import type { ReturnCondition, UnitStatus } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { businessToday, fromDbDate, toDbDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { fromPaise, toPaise } from "@/lib/money";
import { type Tx, withTx } from "@/lib/tx";
import { days, lineRent } from "@/modules/billing/engine";
import { recordMovement } from "@/modules/inventory/service";
import { type Actor, resolveEntryDate } from "@/modules/orders/service";
import type { ReturnEntry } from "./schema";

const UNIT_AFTER_RETURN: Record<ReturnCondition, UnitStatus> = {
  GOOD: "AVAILABLE",
  DAMAGED: "UNDER_REPAIR",
  LOST: "LOST",
};

async function lockOrder(tx: Tx, orderId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "rental_orders" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("orders.notFound");
  return tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
}

async function lockProductsAndUnits(tx: Tx, productIds: number[], unitIds: number[]) {
  const p = [...new Set(productIds)].sort((a, b) => a - b);
  const u = [...new Set(unitIds)].sort((a, b) => a - b);
  if (p.length) await tx.$queryRaw`SELECT id FROM "products" WHERE id = ANY(${p}::int[]) ORDER BY id FOR UPDATE`;
  if (u.length) await tx.$queryRaw`SELECT id FROM "product_units" WHERE id = ANY(${u}::int[]) ORDER BY id FOR UPDATE`;
}

type Part = { condition: ReturnCondition; quantity: number; chargePaise: number; note: string | null };

/** Splits one form entry into per-condition parts, validating charges and notes. */
function partsOf(e: ReturnEntry, productName: string): Part[] {
  const parts: Part[] = [];
  if (e.good > 0) parts.push({ condition: "GOOD", quantity: e.good, chargePaise: 0, note: null });
  if (e.damaged > 0) {
    if (!e.damagedNote) throw new DomainError("returns.noteRequired", { product: productName });
    parts.push({ condition: "DAMAGED", quantity: e.damaged, chargePaise: e.damagedAmount ? toPaise(e.damagedAmount) : 0, note: e.damagedNote });
  }
  if (e.lost > 0) {
    if (!e.lostNote) throw new DomainError("returns.noteRequired", { product: productName });
    parts.push({ condition: "LOST", quantity: e.lost, chargePaise: e.lostAmount ? toPaise(e.lostAmount) : 0, note: e.lostNote });
  }
  return parts;
}

/**
 * Records a (partial or full) return against an open order
 * (docs/02-architecture.md §6 "Record return"):
 * lock order → lock products/units → check returned + qty ≤ issued → the
 * billing engine computes days and rent → insert Return + ReturnLines →
 * qty_returned += n → stock by condition → unit status → audit.
 */
export async function recordReturn(
  actor: Actor,
  input: { orderId: number; date: string | null; notes: string | null; entries: ReturnEntry[] },
) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
    const when = resolveEntryDate(actor, input.date);

    const entries = input.entries.filter((e) => e.good + e.damaged + e.lost > 0);
    if (entries.length === 0) throw new DomainError("returns.noItems");
    const ids = entries.map((e) => e.issueLineId);
    if (new Set(ids).size !== ids.length) throw new DomainError("returns.duplicateLine");

    const lines = await tx.issueLine.findMany({
      where: { id: { in: ids } },
      include: { issue: { select: { issueDate: true } }, product: { select: { name: true } }, unit: { select: { serialNo: true } } },
    });
    const lineById = new Map(lines.map((l) => [l.id, l]));
    await lockProductsAndUnits(
      tx,
      lines.map((l) => l.productId),
      lines.flatMap((l) => (l.unitId ? [l.unitId] : [])),
    );

    const ret = await tx.return.create({
      data: { orderId: order.id, returnDate: toDbDate(when.date), isBackdated: when.isBackdated, notes: input.notes, receivedById: actor.id },
    });

    const summary: Record<string, string | number>[] = [];
    let rentTotal = 0;
    for (const e of entries) {
      const line = lineById.get(e.issueLineId);
      if (!line || line.orderId !== order.id || line.status !== "ACTIVE") throw new DomainError("returns.lineNotFound");
      const name = line.unit ? `${line.product.name} ${line.unit.serialNo}` : line.product.name;
      const outstanding = line.quantity - line.qtyReturned;
      const total = e.good + e.damaged + e.lost;
      if (total > outstanding) throw new DomainError("returns.tooMany", { product: name, outstanding });
      const issueDate = fromDbDate(line.issue.issueDate);
      if (when.date < issueDate) throw new DomainError("returns.beforeIssue", { product: name, date: issueDate });

      const dayCount = days(issueDate, when.date);
      const ratePaise = toPaise(line.dailyRate);
      for (const part of partsOf(e, name)) {
        const rent = lineRent(part.quantity, ratePaise, dayCount);
        rentTotal += rent;
        const rl = await tx.returnLine.create({
          data: {
            returnId: ret.id,
            issueLineId: line.id,
            quantity: part.quantity,
            condition: part.condition,
            days: dayCount,
            dailyRate: line.dailyRate,
            rentAmount: fromPaise(rent),
            damageAmount: fromPaise(part.chargePaise),
            damageNote: part.note,
          },
        });
        // Out first, then owned/repair, so the stock-balance CHECK holds after every statement.
        await tx.product.update({ where: { id: line.productId }, data: { qtyOut: { decrement: part.quantity } } });
        if (part.condition === "DAMAGED") {
          await recordMovement(tx, actor, line.productId, "RETURN_DAMAGED", { deltaOwned: 0, deltaRepair: part.quantity }, { unitId: line.unitId ?? undefined, returnLineId: rl.id });
        } else if (part.condition === "LOST") {
          await recordMovement(tx, actor, line.productId, "RETURN_LOST", { deltaOwned: -part.quantity, deltaRepair: 0 }, { unitId: line.unitId ?? undefined, returnLineId: rl.id });
        }
        if (line.unitId) await tx.productUnit.update({ where: { id: line.unitId }, data: { status: UNIT_AFTER_RETURN[part.condition] } });
        summary.push({ product: name, quantity: part.quantity, condition: part.condition, days: dayCount, rent: fromPaise(rent), charge: fromPaise(part.chargePaise) });
      }
      await tx.issueLine.update({ where: { id: line.id }, data: { qtyReturned: { increment: total } } });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "RETURN_CREATE",
      entity: "order",
      entityId: order.id,
      summary: { returnId: ret.id, date: when.date, backdated: when.isBackdated, rentTotal: fromPaise(rentTotal), lines: summary },
    });
    if (when.isBackdated) {
      await writeAudit(tx, {
        actorId: actor.id,
        action: "BACKDATE",
        entity: "order",
        entityId: order.id,
        summary: { returnId: ret.id, date: when.date, enteredOn: businessToday() },
      });
    }
    return ret;
  });
}

/**
 * Admin correction of a wrongly entered return, while the order is open
 * and has no live invoice. Never deletes: the return is
 * marked VOIDED, quantities go back onto the issue lines and every stock
 * effect is reversed, with reversing ledger rows (the ledger is append-only).
 * Refused if the returned pieces have since moved on (re-issued, repaired or
 * written off), so a unit can never be counted twice.
 */
export async function voidReturn(actor: Actor, input: { returnId: number; reason: string }) {
  return withTx(async (tx) => {
    const found = await tx.return.findUnique({ where: { id: input.returnId }, select: { orderId: true } });
    if (!found) throw new DomainError("returns.notFound");
    const order = await lockOrder(tx, found.orderId);
    // A return that is on a live invoice can't change: cancel the invoice first.
    if (await tx.invoice.count({ where: { orderId: order.id, status: "ISSUED" } })) throw new DomainError("returns.hasInvoice");
    if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
    const ret = await tx.return.findUniqueOrThrow({
      where: { id: input.returnId },
      include: { lines: { include: { issueLine: { include: { product: { select: { name: true } }, unit: true } } } } },
    });
    if (ret.status === "VOIDED") throw new DomainError("returns.alreadyVoided");

    await lockProductsAndUnits(
      tx,
      ret.lines.map((l) => l.issueLine.productId),
      ret.lines.flatMap((l) => (l.issueLine.unitId ? [l.issueLine.unitId] : [])),
    );

    // Can every piece still be taken back from where the return put it?
    const need = new Map<number, { good: number; damaged: number; name: string }>();
    for (const l of ret.lines) {
      const n = need.get(l.issueLine.productId) ?? { good: 0, damaged: 0, name: l.issueLine.product.name };
      if (l.condition === "GOOD") n.good += l.quantity;
      if (l.condition === "DAMAGED") n.damaged += l.quantity;
      need.set(l.issueLine.productId, n);
      if (l.issueLine.unitId) {
        const unit = await tx.productUnit.findUniqueOrThrow({ where: { id: l.issueLine.unitId } });
        if (unit.status !== UNIT_AFTER_RETURN[l.condition]) {
          throw new DomainError("returns.cannotVoidMoved", { product: `${l.issueLine.product.name} ${unit.serialNo}` });
        }
      }
    }
    for (const [productId, n] of need) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
      const available = p.qtyOwned - p.qtyOut - p.qtyRepair;
      if (n.good > available || n.damaged > p.qtyRepair) throw new DomainError("returns.cannotVoidMoved", { product: n.name });
    }

    const why = `Void of return #${ret.id}: ${input.reason}`;
    for (const l of ret.lines) {
      const { productId, unitId } = l.issueLine;
      // Reverse owned/repair first, then put the pieces back out.
      if (l.condition === "DAMAGED") {
        await recordMovement(tx, actor, productId, "RETURN_DAMAGED", { deltaOwned: 0, deltaRepair: -l.quantity }, { unitId: unitId ?? undefined, returnLineId: l.id, reason: why });
      } else if (l.condition === "LOST") {
        await recordMovement(tx, actor, productId, "RETURN_LOST", { deltaOwned: l.quantity, deltaRepair: 0 }, { unitId: unitId ?? undefined, returnLineId: l.id, reason: why });
      }
      await tx.product.update({ where: { id: productId }, data: { qtyOut: { increment: l.quantity } } });
      if (unitId) await tx.productUnit.update({ where: { id: unitId }, data: { status: "RENTED" } });
      await tx.issueLine.update({ where: { id: l.issueLineId }, data: { qtyReturned: { decrement: l.quantity } } });
    }
    await tx.return.update({
      where: { id: ret.id },
      data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: input.reason },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "RETURN_VOID",
      entity: "order",
      entityId: order.id,
      reason: input.reason,
      summary: { returnId: ret.id, date: fromDbDate(ret.returnDate) },
    });
  });
}

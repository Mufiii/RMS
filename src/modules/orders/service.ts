import type { Role } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { addDays, businessToday, fromDbDate, isIsoDate, toDbDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequences";
import { type Tx, withTx } from "@/lib/tx";
import { available, countersOf } from "@/modules/inventory/client-safe";
import type { IssueLineInput } from "./schema";

/** The user doing the work; the role decides whether backdating is allowed. */
export type Actor = { id: number; role: Role };

/** Catches a typo (e.g. 2006 for 2026) without blocking go-live entries from past months. */
const MAX_BACKDATE_YEARS = 2;

/**
 * Business date for an entry (docs/01-requirements.md §8):
 * staff always use today (Asia/Kolkata); admins may pick an earlier date
 * (backdating, audited); future dates are never allowed.
 */
export function resolveEntryDate(actor: Actor, requested: string | null | undefined, today = businessToday()) {
  if (!requested || requested === today) return { date: today, isBackdated: false };
  if (!isIsoDate(requested)) throw new DomainError("orders.dateInvalid");
  if (requested > today) throw new DomainError("orders.futureDate");
  if (!can(actor.role, "date.backdate")) throw new DomainError("orders.backdateForbidden");
  if (requested < addDays(today, -365 * MAX_BACKDATE_YEARS)) {
    throw new DomainError("orders.backdateTooOld", { years: MAX_BACKDATE_YEARS });
  }
  return { date: requested, isBackdated: true };
}

async function lockOrder(tx: Tx, orderId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "rental_orders" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("orders.notFound");
  return tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
}

type PlannedLine = { productId: number; unitId: number | null; quantity: number };

/**
 * Issues items onto an OPEN, already-locked order (architecture §6):
 * lock products (ascending id) → check active + availability → lock units
 * (ascending id), require AVAILABLE → insert issue + lines with the rate
 * snapshot → qty_out += n, units → RENTED → audit.
 */
async function issueItemsTx(
  tx: Tx,
  actor: Actor,
  orderId: number,
  when: { date: string; isBackdated: boolean },
  notes: string | null,
  input: IssueLineInput[],
) {
  if (input.length === 0) throw new DomainError("orders.noItems");

  // Merge repeated products: quantities add up, serials are collected.
  const byProduct = new Map<number, { quantity: number; unitIds: Set<number> }>();
  for (const l of input) {
    const e = byProduct.get(l.productId) ?? { quantity: 0, unitIds: new Set<number>() };
    e.quantity += l.quantity ?? 0;
    for (const u of l.unitIds ?? []) e.unitIds.add(u);
    byProduct.set(l.productId, e);
  }
  const productIds = [...byProduct.keys()].sort((a, b) => a - b);
  await tx.$queryRaw`SELECT id FROM "products" WHERE id = ANY(${productIds}::int[]) ORDER BY id FOR UPDATE`;
  const products = await tx.product.findMany({ where: { id: { in: productIds } } });
  const productById = new Map(products.map((p) => [p.id, p]));

  const allUnitIds = [...byProduct.values()].flatMap((e) => [...e.unitIds]).sort((a, b) => a - b);
  if (allUnitIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM "product_units" WHERE id = ANY(${allUnitIds}::int[]) ORDER BY id FOR UPDATE`;
  }
  const units = allUnitIds.length ? await tx.productUnit.findMany({ where: { id: { in: allUnitIds } } }) : [];
  const unitById = new Map(units.map((u) => [u.id, u]));

  const planned: PlannedLine[] = [];
  for (const productId of productIds) {
    const want = byProduct.get(productId)!;
    const p = productById.get(productId);
    if (!p) throw new DomainError("products.notFound");
    if (!p.isActive) throw new DomainError("orders.productInactive", { product: p.name });
    if (p.tracking === "QUANTITY") {
      if (want.unitIds.size > 0 || want.quantity <= 0) throw new DomainError("orders.quantityRequired", { product: p.name });
      const avail = available(countersOf(p));
      if (want.quantity > avail) throw new DomainError("orders.notEnoughStock", { product: p.name, available: avail });
      planned.push({ productId, unitId: null, quantity: want.quantity });
    } else {
      if (want.unitIds.size === 0 || want.quantity > 0) throw new DomainError("orders.unitsRequired", { product: p.name });
      for (const unitId of want.unitIds) {
        const u = unitById.get(unitId);
        if (!u || u.productId !== productId) throw new DomainError("stock.unitNotFound");
        if (u.status !== "AVAILABLE") throw new DomainError("orders.unitNotAvailable", { serial: u.serialNo });
        planned.push({ productId, unitId, quantity: 1 });
      }
    }
  }

  const issue = await tx.issue.create({
    data: { orderId, issueDate: toDbDate(when.date), isBackdated: when.isBackdated, notes, issuedById: actor.id },
  });
  for (const line of planned) {
    const p = productById.get(line.productId)!;
    await tx.issueLine.create({
      data: {
        issueId: issue.id,
        orderId,
        productId: line.productId,
        unitId: line.unitId,
        quantity: line.quantity,
        dailyRate: p.dailyRate, // snapshot
      },
    });
  }
  for (const productId of productIds) {
    const n = planned.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity, 0);
    await tx.product.update({ where: { id: productId }, data: { qtyOut: { increment: n } } });
  }
  if (allUnitIds.length > 0) {
    await tx.productUnit.updateMany({ where: { id: { in: allUnitIds } }, data: { status: "RENTED" } });
  }

  const summary = {
    orderId,
    issueId: issue.id,
    date: when.date,
    backdated: when.isBackdated,
    lines: planned.map((l) => ({
      product: productById.get(l.productId)!.name,
      quantity: l.quantity,
      serial: l.unitId ? unitById.get(l.unitId)!.serialNo : undefined,
      rate: productById.get(l.productId)!.dailyRate.toFixed(2),
    })),
  };
  await writeAudit(tx, { actorId: actor.id, action: "ISSUE_CREATE", entity: "order", entityId: orderId, summary });
  if (when.isBackdated) {
    await writeAudit(tx, {
      actorId: actor.id,
      action: "BACKDATE",
      // Recorded on the order so it shows in the order's activity list.
      entity: "order",
      entityId: orderId,
      summary: { issueId: issue.id, date: when.date, enteredOn: businessToday() },
    });
  }
  return issue;
}

/**
 * Opens a new order for an active customer, optionally issuing the first
 * items in the same transaction (the usual counter flow).
 */
export async function createOrder(
  actor: Actor,
  input: { customerId: number; siteAddress: string | null; notes: string | null; date: string | null; lines: IssueLineInput[] },
) {
  return withTx(async (tx) => {
    // FOR SHARE: blocks a concurrent deactivation of this customer until we commit.
    const c = await tx.$queryRaw<{ id: number; is_active: boolean; name: string }[]>`
      SELECT id, is_active, name FROM "customers" WHERE id = ${input.customerId} FOR SHARE`;
    if (c.length === 0) throw new DomainError("customers.notFound");
    if (!c[0].is_active) throw new DomainError("orders.customerInactive", { name: c[0].name });

    const when = resolveEntryDate(actor, input.date);
    const settings = await tx.settings.findUnique({ where: { id: 1 }, select: { orderPrefix: true } });
    const orderNo = await nextDocumentNumber(tx, "ORDER", when.date, settings?.orderPrefix ?? "ORD");
    const order = await tx.rentalOrder.create({
      data: {
        orderNo,
        customerId: input.customerId,
        siteAddress: input.siteAddress,
        notes: input.notes,
        openedOn: toDbDate(when.date),
        createdById: actor.id,
      },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "ORDER_CREATE",
      entity: "order",
      entityId: order.id,
      summary: { orderNo, customerId: input.customerId, openedOn: when.date, backdated: when.isBackdated },
    });
    if (input.lines.length > 0) await issueItemsTx(tx, actor, order.id, when, null, input.lines);
    return order;
  });
}

/** Adds items to an open order later (a new issue with its own date). */
export async function issueItems(
  actor: Actor,
  input: { orderId: number; date: string | null; notes: string | null; lines: IssueLineInput[] },
) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
    const when = resolveEntryDate(actor, input.date);
    if (when.date < fromDbDate(order.openedOn)) {
      throw new DomainError("orders.issueBeforeOpen", { date: fromDbDate(order.openedOn) });
    }
    return issueItemsTx(tx, actor, order.id, when, input.notes, input.lines);
  });
}

/**
 * Admin correction of a wrongly entered issue line, only before anything was
 * returned against it. Never deletes: the line is marked VOIDED and the stock
 * goes back (qty_out −= n, unit → AVAILABLE).
 */
export async function voidIssueLine(actor: Actor, input: { lineId: number; reason: string }) {
  return withTx(async (tx) => {
    const found = await tx.issueLine.findUnique({ where: { id: input.lineId }, select: { orderId: true, productId: true, unitId: true } });
    if (!found) throw new DomainError("orders.lineNotFound");
    // Same lock order as issuing: order → product → unit.
    const order = await lockOrder(tx, found.orderId);
    await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${found.productId} FOR UPDATE`;
    if (found.unitId) await tx.$queryRaw`SELECT id FROM "product_units" WHERE id = ${found.unitId} FOR UPDATE`;
    const line = await tx.issueLine.findUniqueOrThrow({
      where: { id: input.lineId },
      include: { product: { select: { name: true } }, unit: { select: { serialNo: true } } },
    });
    if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
    if (line.status === "VOIDED") throw new DomainError("orders.lineAlreadyVoided");
    if (line.qtyReturned > 0) throw new DomainError("orders.lineHasReturns");

    await tx.issueLine.update({
      where: { id: line.id },
      data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: input.reason },
    });
    await tx.product.update({ where: { id: line.productId }, data: { qtyOut: { decrement: line.quantity } } });
    if (line.unitId) await tx.productUnit.update({ where: { id: line.unitId }, data: { status: "AVAILABLE" } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "ISSUE_LINE_VOID",
      entity: "order",
      entityId: order.id,
      reason: input.reason,
      summary: { lineId: line.id, product: line.product.name, serial: line.unit?.serialNo, quantity: line.quantity },
    });
  });
}

/**
 * Admin cancel of an order entered by mistake. Allowed only when it has no
 * active issue lines and no active payments (void those first).
 */
export async function cancelOrder(actor: Actor, input: { orderId: number; reason: string }) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
    const active = await tx.issueLine.count({ where: { orderId: order.id, status: "ACTIVE" } });
    if (active > 0) throw new DomainError("orders.hasActiveLines", { count: active });
    const paid = await tx.payment.count({ where: { orderId: order.id, status: "ACTIVE" } });
    if (paid > 0) throw new DomainError("orders.hasPayments", { count: paid });
    await tx.rentalOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledById: actor.id, cancelledAt: new Date(), cancelReason: input.reason },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "ORDER_CANCEL",
      entity: "order",
      entityId: order.id,
      reason: input.reason,
      summary: { orderNo: order.orderNo },
    });
  });
}

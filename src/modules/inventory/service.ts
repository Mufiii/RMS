import type { MovementType, UnitStatus } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { type Tx, withTx } from "@/lib/tx";
import {
  type Counters,
  type Deltas,
  type ManualMovement,
  movementDeltas,
  REASON_REQUIRED,
  UNIT_TRANSITIONS,
  type UnitAction,
} from "./stock";

export type Actor = { id: number };

/** Row-locks a product (FOR UPDATE) and returns it with its counters. */
export async function lockProduct(tx: Tx, productId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "products" WHERE id = ${productId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("products.notFound");
  return tx.product.findUniqueOrThrow({ where: { id: productId } });
}

export const countersOf = (p: { qtyOwned: number; qtyOut: number; qtyRepair: number }): Counters => ({
  owned: p.qtyOwned,
  out: p.qtyOut,
  repair: p.qtyRepair,
});

/**
 * Applies validated deltas to a locked product and appends the ledger row.
 * The only place product stock counters change outside issue/return.
 */
export async function recordMovement(
  tx: Tx,
  actor: Actor,
  productId: number,
  type: MovementType,
  deltas: Deltas,
  opts: { unitId?: number; reason?: string | null; returnLineId?: number } = {},
) {
  await tx.product.update({
    where: { id: productId },
    data: { qtyOwned: { increment: deltas.deltaOwned }, qtyRepair: { increment: deltas.deltaRepair } },
  });
  return tx.stockMovement.create({
    data: {
      productId,
      unitId: opts.unitId ?? null,
      returnLineId: opts.returnLineId ?? null,
      type,
      deltaOwned: deltas.deltaOwned,
      deltaRepair: deltas.deltaRepair,
      reason: opts.reason ?? null,
      createdById: actor.id,
    },
  });
}

function requireReason(type: ManualMovement, reason: string | null | undefined) {
  if (REASON_REQUIRED.includes(type) && !reason?.trim()) throw new DomainError("stock.reasonRequired");
}

/** Quantity-tracked products: one adjustment of N pieces. */
export async function adjustQuantity(
  actor: Actor,
  input: { productId: number; type: ManualMovement; quantity: number; direction?: "increase" | "decrease"; reason?: string | null },
) {
  return withTx(async (tx) => {
    const p = await lockProduct(tx, input.productId);
    if (p.tracking !== "QUANTITY") throw new DomainError("stock.useUnits");
    requireReason(input.type, input.reason);
    const before = countersOf(p);
    const deltas = movementDeltas(before, input.type, input.quantity, input.direction !== "decrease");
    const movement = await recordMovement(tx, actor, p.id, input.type, deltas, { reason: input.reason });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "STOCK_ADJUST",
      entity: "product",
      entityId: p.id,
      reason: input.reason ?? null,
      summary: { type: input.type, quantity: input.quantity, ...deltas, before, movementId: movement.id },
    });
    return movement;
  });
}

/** Inserts units (status AVAILABLE) inside an existing transaction; the product must be locked. */
export async function insertUnits(
  tx: Tx,
  actor: Actor,
  productId: number,
  type: "OPENING" | "PURCHASE",
  serials: string[],
) {
  const seen = new Set<string>();
  for (const s of serials) {
    const key = s.toUpperCase();
    if (seen.has(key)) throw new DomainError("stock.serialDuplicate", { serial: s });
    seen.add(key);
  }
  const existing = await tx.productUnit.findMany({
    where: { productId, serialNo: { in: serials, mode: "insensitive" } },
    select: { serialNo: true },
    take: 1,
  });
  if (existing.length > 0) throw new DomainError("stock.serialExists", { serial: existing[0].serialNo });

  const units = [];
  for (const serialNo of serials) {
    const unit = await tx.productUnit.create({ data: { productId, serialNo, status: "AVAILABLE" } });
    await recordMovement(tx, actor, productId, type, { deltaOwned: 1, deltaRepair: 0 }, { unitId: unit.id });
    units.push(unit);
  }
  return units;
}

/** Serialised products: add new units by serial number. */
export async function addUnits(actor: Actor, input: { productId: number; type: "OPENING" | "PURCHASE"; serials: string[] }) {
  return withTx(async (tx) => {
    const p = await lockProduct(tx, input.productId);
    if (p.tracking !== "SERIALISED") throw new DomainError("stock.notSerialised");
    const units = await insertUnits(tx, actor, p.id, input.type, input.serials);
    await writeAudit(tx, {
      actorId: actor.id,
      action: "UNITS_ADD",
      entity: "product",
      entityId: p.id,
      summary: { type: input.type, serials: input.serials },
    });
    return units;
  });
}

/** Serialised products: send a unit to repair, bring it back, write it off or scrap it. */
export async function unitAction(actor: Actor, input: { unitId: number; action: UnitAction; reason?: string | null }) {
  return withTx(async (tx) => {
    const found = await tx.productUnit.findUnique({ where: { id: input.unitId }, select: { productId: true } });
    if (!found) throw new DomainError("stock.unitNotFound");
    // Lock order: product, then unit (same as issue/return in later steps).
    const p = await lockProduct(tx, found.productId);
    await tx.$queryRaw`SELECT id FROM "product_units" WHERE id = ${input.unitId} FOR UPDATE`;
    const unit = await tx.productUnit.findUniqueOrThrow({ where: { id: input.unitId } });

    const transition = UNIT_TRANSITIONS[input.action];
    if (unit.status !== transition.from) {
      throw new DomainError("stock.unitWrongStatus", { serial: unit.serialNo, status: unit.status });
    }
    requireReason(input.action, input.reason);
    const deltas = movementDeltas(countersOf(p), input.action, 1);
    await tx.productUnit.update({ where: { id: unit.id }, data: { status: transition.to as UnitStatus } });
    const movement = await recordMovement(tx, actor, p.id, input.action, deltas, { unitId: unit.id, reason: input.reason });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "STOCK_ADJUST",
      entity: "product",
      entityId: p.id,
      reason: input.reason ?? null,
      summary: { type: input.action, serial: unit.serialNo, from: unit.status, to: transition.to, movementId: movement.id },
    });
    return movement;
  });
}

export type ReconcileRow = {
  productId: number;
  name: string;
  tracking: "SERIALISED" | "QUANTITY";
  stored: Counters;
  fromLedger: Counters;
  fromUnits: Counters | null;
  ok: boolean;
};

/**
 * Recomputes every product's counters from history and compares
 * (docs/03-database-design.md §stock_movements):
 *   owned = Σ delta_owned, repair = Σ delta_repair,
 *   out   = Σ active issued − Σ active returned (issue lines),
 * and for serialised products also from unit statuses.
 */
export async function reconcile(): Promise<ReconcileRow[]> {
  const rows = await db.$queryRaw<
    {
      id: number;
      name: string;
      tracking: "SERIALISED" | "QUANTITY";
      qty_owned: number;
      qty_out: number;
      qty_repair: number;
      ledger_owned: bigint;
      ledger_repair: bigint;
      lines_out: bigint;
      units_owned: bigint;
      units_out: bigint;
      units_repair: bigint;
    }[]
  >`
    SELECT p.id, p.name, p.tracking::text AS tracking, p.qty_owned, p.qty_out, p.qty_repair,
      COALESCE((SELECT SUM(m.delta_owned)  FROM stock_movements m WHERE m.product_id = p.id), 0) AS ledger_owned,
      COALESCE((SELECT SUM(m.delta_repair) FROM stock_movements m WHERE m.product_id = p.id), 0) AS ledger_repair,
      COALESCE((SELECT SUM(l.quantity - l.qty_returned) FROM issue_lines l WHERE l.product_id = p.id AND l.status = 'ACTIVE'), 0) AS lines_out,
      (SELECT COUNT(*) FROM product_units u WHERE u.product_id = p.id AND u.status NOT IN ('LOST','RETIRED')) AS units_owned,
      (SELECT COUNT(*) FROM product_units u WHERE u.product_id = p.id AND u.status = 'RENTED') AS units_out,
      (SELECT COUNT(*) FROM product_units u WHERE u.product_id = p.id AND u.status = 'UNDER_REPAIR') AS units_repair
    FROM products p
    ORDER BY p.id`;

  return rows.map((r) => {
    const stored = { owned: r.qty_owned, out: r.qty_out, repair: r.qty_repair };
    // out = Σ (issued − returned) over active issue lines.
    const fromLedger = { owned: Number(r.ledger_owned), out: Number(r.lines_out), repair: Number(r.ledger_repair) };
    const fromUnits =
      r.tracking === "SERIALISED"
        ? { owned: Number(r.units_owned), out: Number(r.units_out), repair: Number(r.units_repair) }
        : null;
    const same = (a: Counters, b: Counters) => a.owned === b.owned && a.out === b.out && a.repair === b.repair;
    return {
      productId: r.id,
      name: r.name,
      tracking: r.tracking,
      stored,
      fromLedger,
      fromUnits,
      ok: same(stored, fromLedger) && (fromUnits === null || same(stored, fromUnits)),
    };
  });
}

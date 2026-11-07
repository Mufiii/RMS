import type { RentalOrder } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { businessToday, fromDbDate, toDbDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequences";
import { type Tx, withTx } from "@/lib/tx";
import { days, invoiceTotals } from "@/modules/billing/engine";
import type { Actor } from "@/modules/orders/service";

type Discount = { amount: string | null; reason: string | null };

async function lockOrder(tx: Tx, orderId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "rental_orders" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("orders.notFound");
  return tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
}

function discountPaise(actor: Actor, d: Discount): number {
  const paise = d.amount ? toPaise(d.amount) : 0;
  if (paise === 0) return 0;
  if (!can(actor.role, "invoice.discount")) throw new DomainError("invoices.discountForbidden");
  if (!d.reason) throw new DomainError("invoices.discountReasonRequired");
  return paise;
}

/**
 * Final invoice for an already-locked order (docs/02-architecture.md §6):
 * require OPEN, no live invoice and every active line fully returned (or
 * lost) → snapshot customer + one line per returned batch + totals → next
 * gap-free number → order CLOSED → audit.
 */
async function createInvoiceTx(tx: Tx, actor: Actor, order: RentalOrder, discount: Discount) {
  if (order.status !== "OPEN") throw new DomainError("orders.notOpen");
  if (await tx.invoice.count({ where: { orderId: order.id, status: "ISSUED" } })) throw new DomainError("invoices.alreadyIssued");

  const lines = await tx.issueLine.findMany({ where: { orderId: order.id, status: "ACTIVE" } });
  if (lines.length === 0) throw new DomainError("invoices.nothingToBill");
  const stillOut = lines.reduce((s, l) => s + (l.quantity - l.qtyReturned), 0);
  if (stillOut > 0) throw new DomainError("invoices.itemsStillOut", { count: stillOut });

  const batches = await tx.returnLine.findMany({
    where: { return: { orderId: order.id, status: "ACTIVE" }, issueLine: { status: "ACTIVE" } },
    include: {
      return: { select: { returnDate: true } },
      issueLine: {
        select: {
          issue: { select: { issueDate: true } },
          product: { select: { name: true, nameMl: true } },
          unit: { select: { serialNo: true } },
        },
      },
    },
  });
  // The return history must account for every returned piece exactly once.
  const returnedByLine = new Map<number, number>();
  for (const b of batches) returnedByLine.set(b.issueLineId, (returnedByLine.get(b.issueLineId) ?? 0) + b.quantity);
  for (const l of lines) {
    if ((returnedByLine.get(l.id) ?? 0) !== l.qtyReturned) throw new Error(`Issue line ${l.id}: returns do not add up`);
  }

  const snap = batches
    .map((b) => {
      const issueDate = fromDbDate(b.issueLine.issue.issueDate);
      const returnDate = fromDbDate(b.return.returnDate);
      if (days(issueDate, returnDate) !== b.days) throw new Error(`Return line ${b.id}: days do not match its dates`);
      const serialNo = b.issueLine.unit?.serialNo ?? null;
      return {
        productName: b.issueLine.product.name,
        productNameMl: b.issueLine.product.nameMl,
        serialNo,
        quantity: b.quantity,
        issueDate,
        returnDate,
        days: b.days,
        dailyRate: b.dailyRate,
        rent: toPaise(b.rentAmount),
        damage: toPaise(b.damageAmount),
        condition: b.condition,
        damageNote: b.damageNote,
        // Issue date, then product, serial, return date: reads like the register.
        key: [issueDate, b.issueLine.product.name, serialNo ?? "", returnDate, String(b.id).padStart(10, "0")].join("\u0000"),
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const off = discountPaise(actor, discount);
  const subtotal = snap.reduce((s, l) => s + l.rent + l.damage, 0);
  if (off > subtotal) throw new DomainError("invoices.discountTooLarge", { max: formatINR(subtotal) });
  const totals = invoiceTotals(snap, off);

  const customer = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId } });
  const settings = await tx.settings.findUnique({ where: { id: 1 }, select: { invoicePrefix: true } });
  const today = businessToday();
  const invoiceNo = await nextDocumentNumber(tx, "INVOICE", today, settings?.invoicePrefix ?? "INV");

  const invoice = await tx.invoice.create({
    data: {
      invoiceNo,
      orderId: order.id,
      invoiceDate: toDbDate(today),
      orderNo: order.orderNo,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      siteAddress: order.siteAddress,
      rentTotal: fromPaise(totals.rentTotal),
      damageTotal: fromPaise(totals.damageTotal),
      discountAmount: fromPaise(totals.discount),
      discountReason: totals.discount > 0 ? discount.reason : null,
      total: fromPaise(totals.total),
      createdById: actor.id,
      lines: {
        create: snap.map((l, i) => ({
          sortOrder: i + 1,
          productName: l.productName,
          productNameMl: l.productNameMl,
          serialNo: l.serialNo,
          quantity: l.quantity,
          issueDate: toDbDate(l.issueDate),
          returnDate: toDbDate(l.returnDate),
          days: l.days,
          dailyRate: l.dailyRate,
          rentAmount: fromPaise(l.rent),
          condition: l.condition,
          damageAmount: fromPaise(l.damage),
          damageNote: l.damageNote,
        })),
      },
    },
  });
  await tx.rentalOrder.update({ where: { id: order.id }, data: { status: "CLOSED", closedAt: new Date() } });

  await writeAudit(tx, {
    actorId: actor.id,
    action: "INVOICE_CREATE",
    entity: "order",
    entityId: order.id,
    summary: {
      invoiceId: invoice.id,
      invoiceNo,
      lines: snap.length,
      rentTotal: fromPaise(totals.rentTotal),
      damageTotal: fromPaise(totals.damageTotal),
      discount: fromPaise(totals.discount),
      total: fromPaise(totals.total),
    },
  });
  if (totals.discount > 0) {
    await writeAudit(tx, {
      actorId: actor.id,
      action: "INVOICE_DISCOUNT",
      entity: "order",
      entityId: order.id,
      reason: discount.reason,
      summary: { invoiceId: invoice.id, invoiceNo, discount: fromPaise(totals.discount), before: fromPaise(totals.subtotal), after: fromPaise(totals.total) },
    });
  }
  return invoice;
}

/** Generates the final invoice. Staff can't give a discount; admins can, with a reason. */
export async function createInvoice(actor: Actor, input: { orderId: number; discount: string | null; discountReason: string | null }) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    return createInvoiceTx(tx, actor, order, { amount: input.discount, reason: input.discountReason });
  });
}

async function cancelInvoiceTx(tx: Tx, actor: Actor, invoiceId: number, reason: string) {
  const found = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { orderId: true } });
  if (!found) throw new DomainError("invoices.notFound");
  const order = await lockOrder(tx, found.orderId);
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.status !== "ISSUED") throw new DomainError("invoices.alreadyCancelled");
  if (order.status !== "CLOSED") throw new Error(`Order ${order.id} has a live invoice but is ${order.status}`);

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { status: "CANCELLED", cancelledById: actor.id, cancelledAt: new Date(), cancelReason: reason },
  });
  // The order is open again, so returns can be corrected before a new invoice.
  const reopened = await tx.rentalOrder.update({ where: { id: order.id }, data: { status: "OPEN", closedAt: null } });
  await writeAudit(tx, {
    actorId: actor.id,
    action: "INVOICE_CANCEL",
    entity: "order",
    entityId: order.id,
    reason,
    summary: { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, total: invoice.total.toFixed(2) },
  });
  return reopened;
}

/**
 * Admin cancel of a final invoice, with a reason. Never deletes: the invoice
 * stays, marked CANCELLED, and the order re-opens. With `reissue`, a new
 * invoice (new number, optional discount) is issued in the same transaction.
 */
export async function cancelInvoice(actor: Actor, input: { invoiceId: number; reason: string; reissue?: Discount | null }) {
  return withTx(async (tx) => {
    const order = await cancelInvoiceTx(tx, actor, input.invoiceId, input.reason);
    const reissued = input.reissue ? await createInvoiceTx(tx, actor, order, input.reissue) : null;
    return { orderId: order.id, reissued };
  });
}

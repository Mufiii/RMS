import type { PaymentType } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/audit";
import { businessToday, toDbDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { formatINR, fromPaise, toPaise } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/sequences";
import { type Tx, withTx } from "@/lib/tx";
import { balance } from "@/modules/billing/engine";
import type { Actor } from "@/modules/orders/service";
import type { MoneyInput } from "./schema";

async function lockOrder(tx: Tx, orderId: number) {
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "rental_orders" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("orders.notFound");
  return tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
}

/** Money position of a locked order: live invoice total (if any), received and refunded, in paise. */
export async function moneyOf(tx: Tx, orderId: number) {
  const invoice = await tx.invoice.findFirst({ where: { orderId, status: "ISSUED" }, select: { id: true, total: true } });
  const sums = await tx.payment.groupBy({ by: ["type"], where: { orderId, status: "ACTIVE" }, _sum: { amount: true } });
  const sum = (types: PaymentType[]) => sums.filter((s) => types.includes(s.type)).reduce((a, s) => a + toPaise(s._sum.amount ?? 0), 0);
  return { invoiceTotal: invoice ? toPaise(invoice.total) : null, received: sum(["ADVANCE", "PAYMENT"]), refunded: sum(["REFUND"]) };
}

async function insertPayment(tx: Tx, actor: Actor, order: { id: number; customerId: number }, type: PaymentType, input: MoneyInput) {
  const today = businessToday();
  const settings = await tx.settings.findUnique({ where: { id: 1 }, select: { receiptPrefix: true, refundPrefix: true } });
  const receiptNo =
    type === "REFUND"
      ? await nextDocumentNumber(tx, "REFUND", today, settings?.refundPrefix ?? "RFD")
      : await nextDocumentNumber(tx, "RECEIPT", today, settings?.receiptPrefix ?? "RCP");
  const payment = await tx.payment.create({
    data: {
      receiptNo,
      orderId: order.id,
      customerId: order.customerId,
      type,
      mode: input.mode,
      amount: input.amount,
      paymentDate: toDbDate(today),
      reference: input.reference,
      notes: input.notes,
      receivedById: actor.id,
    },
  });
  await writeAudit(tx, {
    actorId: actor.id,
    action: type === "REFUND" ? "REFUND_CREATE" : "PAYMENT_CREATE",
    entity: "order",
    entityId: order.id,
    summary: { paymentId: payment.id, receiptNo, type, mode: input.mode, amount: fromPaise(toPaise(input.amount)) },
  });
  return payment;
}

/**
 * Money in (docs/01-requirements.md §2, §8). Before the final invoice it is an
 * ADVANCE and is not limited. After it, it is a PAYMENT and can't exceed the
 * balance due. Always dated today.
 */
export async function recordPayment(actor: Actor, input: MoneyInput) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status === "CANCELLED") throw new DomainError("payments.orderCancelled");
    const m = await moneyOf(tx, order.id);
    if (m.invoiceTotal === null) return insertPayment(tx, actor, order, "ADVANCE", input);
    const due = balance(m.invoiceTotal, [m.received], [m.refunded]);
    if (due <= 0) throw new DomainError("payments.nothingDue");
    if (toPaise(input.amount) > due) throw new DomainError("payments.moreThanDue", { due: formatINR(due) });
    return insertPayment(tx, actor, order, "PAYMENT", input);
  });
}

/** Refund of an excess: only once the final invoice exists, and never more than the excess. */
export async function recordRefund(actor: Actor, input: MoneyInput) {
  return withTx(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    const m = await moneyOf(tx, order.id);
    if (m.invoiceTotal === null) throw new DomainError("payments.refundNeedsInvoice");
    const excess = -balance(m.invoiceTotal, [m.received], [m.refunded]);
    if (excess <= 0) throw new DomainError("payments.noExcess");
    if (toPaise(input.amount) > excess) throw new DomainError("payments.refundTooLarge", { max: formatINR(excess) });
    return insertPayment(tx, actor, order, "REFUND", input);
  });
}

/**
 * Admin void of a wrongly entered payment or refund, with a reason. Never
 * deletes. Voiding money in is refused if refunds already paid out would
 * then be more than the excess (void the refund first).
 */
export async function voidPayment(actor: Actor, input: { paymentId: number; reason: string }) {
  return withTx(async (tx) => {
    const found = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { orderId: true } });
    if (!found) throw new DomainError("payments.notFound");
    const order = await lockOrder(tx, found.orderId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
    if (p.status === "VOIDED") throw new DomainError("payments.alreadyVoided");

    if (p.type !== "REFUND") {
      const m = await moneyOf(tx, order.id);
      const receivedAfter = m.received - toPaise(p.amount);
      if (m.refunded > receivedAfter - (m.invoiceTotal ?? 0) && m.refunded > 0) throw new DomainError("payments.voidRefundFirst");
    }
    await tx.payment.update({
      where: { id: p.id },
      data: { status: "VOIDED", voidedById: actor.id, voidedAt: new Date(), voidReason: input.reason },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "PAYMENT_VOID",
      entity: "order",
      entityId: order.id,
      reason: input.reason,
      summary: { paymentId: p.id, receiptNo: p.receiptNo, type: p.type, amount: p.amount.toFixed(2) },
    });
  });
}

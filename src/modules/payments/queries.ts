import "server-only";
import type { PaymentMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { balance, statementTotals } from "@/modules/billing/engine";

const paymentInclude = {
  receivedBy: { select: { fullName: true } },
  voidedBy: { select: { fullName: true } },
} as const;

export function orderPayments(orderId: number) {
  return db.payment.findMany({ where: { orderId }, orderBy: { id: "asc" }, include: paymentInclude });
}

export function getPayment(id: number) {
  return db.payment.findUnique({
    where: { id },
    include: {
      ...paymentInclude,
      order: { select: { id: true, orderNo: true, siteAddress: true } },
      customer: { select: { id: true, name: true, phone: true, address: true } },
    },
  });
}

/** Sums of active money in and refunds, in paise. */
export function sumPayments(rows: { type: string; status: string; amount: { toString(): string } }[]) {
  let received = 0;
  let refunded = 0;
  for (const p of rows) {
    if (p.status !== "ACTIVE") continue;
    if (p.type === "REFUND") refunded += toPaise(p.amount);
    else received += toPaise(p.amount);
  }
  return { received, refunded };
}

/** Every payment and refund entered on one business day, with totals per mode (the day's collections). */
export async function paymentsOn(date: string) {
  const rows = await db.payment.findMany({
    where: { paymentDate: toDbDate(date) },
    orderBy: { id: "asc" },
    include: { ...paymentInclude, order: { select: { id: true, orderNo: true } }, customer: { select: { id: true, name: true } } },
  });
  const byMode = new Map<PaymentMode, { in: number; out: number }>();
  for (const p of rows) {
    if (p.status !== "ACTIVE") continue;
    const m = byMode.get(p.mode) ?? { in: 0, out: 0 };
    if (p.type === "REFUND") m.out += toPaise(p.amount);
    else m.in += toPaise(p.amount);
    byMode.set(p.mode, m);
  }
  const { received, refunded } = sumPayments(rows);
  return { rows, byMode: [...byMode.entries()], received, refunded, net: received - refunded };
}

/**
 * Balance of each order (positive = customer owes, negative = excess held).
 * Invoiced orders use the invoice total; open orders use rent accrued to
 * `today` (the running statement). Cancelled orders are left out.
 */
export async function orderBalances(customerId: number, today: string) {
  const orders = await db.rentalOrder.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
    orderBy: [{ openedOn: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderNo: true,
      status: true,
      invoices: { where: { status: "ISSUED" }, select: { id: true, invoiceNo: true, total: true } },
      payments: { select: { type: true, status: true, amount: true } },
      lines: {
        where: { status: "ACTIVE" },
        select: {
          quantity: true,
          qtyReturned: true,
          dailyRate: true,
          issue: { select: { issueDate: true } },
          returnLines: { where: { return: { status: "ACTIVE" } }, select: { rentAmount: true, damageAmount: true } },
        },
      },
    },
  });
  const rows = orders.map((o) => {
    const { received, refunded } = sumPayments(o.payments);
    const invoice = o.invoices[0] ?? null;
    let due: number;
    if (invoice) {
      due = toPaise(invoice.total);
    } else {
      const returned = o.lines.flatMap((l) => l.returnLines.map((r) => ({ rent: toPaise(r.rentAmount), damage: toPaise(r.damageAmount) })));
      const out = o.lines
        .filter((l) => l.qtyReturned < l.quantity)
        .map((l) => ({ qtyOutstanding: l.quantity - l.qtyReturned, ratePaise: toPaise(l.dailyRate), issueDate: fromDbDate(l.issue.issueDate) }));
      due = statementTotals(returned, out, today).total;
    }
    return { id: o.id, orderNo: o.orderNo, status: o.status, invoice, due, received, refunded, balance: balance(due, [received], [refunded]) };
  });
  const invoiced = rows.filter((r) => r.invoice);
  const open = rows.filter((r) => !r.invoice);
  return {
    rows: rows.filter((r) => r.balance !== 0 || !r.invoice),
    /** Billed and still unpaid (final invoices). */
    billedDue: invoiced.reduce((s, r) => s + Math.max(r.balance, 0), 0),
    /** Excess paid on invoiced orders, refundable. */
    creditHeld: invoiced.reduce((s, r) => s + Math.max(-r.balance, 0), 0),
    /** Open orders: rent so far minus advances. */
    openSoFar: open.reduce((s, r) => s + r.balance, 0),
  };
}

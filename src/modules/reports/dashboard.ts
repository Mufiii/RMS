import "server-only";
import { db } from "@/lib/db";
import { addDays, fromDbDate, monthStart, toDbDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { accruedRent, days } from "@/modules/billing/engine";
import { balancesFor, paymentsOn, summarizeBalances } from "@/modules/payments/queries";

/** Lines still (partly) out on open orders, issued on or before `cutoff` when given. */
function outLines(cutoff?: string) {
  return {
    status: "ACTIVE" as const,
    qtyReturned: { lt: db.issueLine.fields.quantity },
    order: { status: "OPEN" as const },
    ...(cutoff ? { issue: { issueDate: { lte: toDbDate(cutoff) } } } : {}),
  };
}

/** Business date of the first day of the month `n` months before the month of `iso`. */
export function monthsBack(iso: string, n: number): string {
  const [y, m] = monthStart(iso).split("-").map(Number);
  return fromDbDate(new Date(Date.UTC(y, m - 1 - n, 1)));
}

/**
 * Items out for `threshold` days or more (counted like rent: issue day = day 1),
 * oldest first: who to call. Rentals have no due date, so age is the signal.
 */
export async function longRentals(today: string, threshold: number) {
  const lines = await db.issueLine.findMany({
    where: outLines(addDays(today, -(threshold - 1))),
    orderBy: [{ issue: { issueDate: "asc" } }, { id: "asc" }],
    take: 100,
    include: {
      issue: { select: { issueDate: true } },
      order: { select: { id: true, orderNo: true, customer: { select: { id: true, name: true, phone: true } } } },
      product: { select: { name: true, nameMl: true } },
      unit: { select: { serialNo: true } },
    },
  });
  return lines.map((l) => {
    const issueDate = fromDbDate(l.issue.issueDate);
    const qty = l.quantity - l.qtyReturned;
    return {
      id: l.id,
      order: l.order,
      customer: l.order.customer,
      product: l.product,
      serialNo: l.unit?.serialNo ?? null,
      qty,
      issueDate,
      days: days(issueDate, today),
      accrued: accruedRent(qty, toPaise(l.dailyRate), issueDate, today),
    };
  });
}

/** Pieces owned, by state: available, on rent (long rentals split out) and in repair. */
export async function stock(today: string, threshold: number) {
  const [counters, long] = await Promise.all([
    db.product.aggregate({ _sum: { qtyOwned: true, qtyOut: true, qtyRepair: true } }),
    db.issueLine.aggregate({ where: outLines(addDays(today, -(threshold - 1))), _sum: { quantity: true, qtyReturned: true } }),
  ]);
  const owned = counters._sum.qtyOwned ?? 0;
  const out = counters._sum.qtyOut ?? 0;
  const repair = counters._sum.qtyRepair ?? 0;
  const tooLong = Math.min(out, (long._sum.quantity ?? 0) - (long._sum.qtyReturned ?? 0));
  return { owned, available: owned - out - repair, onRent: out - tooLong, tooLong, repair };
}

/** Money collected (in − refunds, paise) per month for the last `count` months, oldest first. Month = "YYYY-MM". */
export async function monthlyCollections(today: string, count: number) {
  const rows = await db.payment.findMany({
    where: { status: "ACTIVE", paymentDate: { gte: toDbDate(monthsBack(today, count - 1)), lte: toDbDate(today) } },
    select: { paymentDate: true, type: true, amount: true },
  });
  const months = Array.from({ length: count }, (_, i) => ({ month: monthsBack(today, count - 1 - i).slice(0, 7), net: 0 }));
  for (const p of rows) {
    const m = months.find((x) => x.month === fromDbDate(p.paymentDate).slice(0, 7));
    if (m) m.net += p.type === "REFUND" ? -toPaise(p.amount) : toPaise(p.amount);
  }
  return months;
}

export type RentalState = "out" | "partReturned" | "returned" | "tooLong";

/** The latest issue lines (newest issue date first) and where each stands now. */
export async function recentRentals(today: string, threshold: number, take = 6) {
  const lines = await db.issueLine.findMany({
    where: { status: "ACTIVE", order: { status: { not: "CANCELLED" } } },
    orderBy: [{ issue: { issueDate: "desc" } }, { id: "desc" }],
    take,
    include: {
      issue: { select: { issueDate: true } },
      order: { select: { id: true, orderNo: true, customer: { select: { id: true, name: true } } } },
      product: { select: { name: true, nameMl: true } },
      unit: { select: { serialNo: true } },
      returnLines: { where: { return: { status: "ACTIVE" } }, select: { return: { select: { returnDate: true } } } },
    },
  });
  return lines.map((l) => {
    const issueDate = fromDbDate(l.issue.issueDate);
    const out = l.quantity - l.qtyReturned;
    const lastReturn = l.returnLines.map((r) => fromDbDate(r.return.returnDate)).sort().at(-1) ?? null;
    const state: RentalState =
      out <= 0 ? "returned" : days(issueDate, today) >= threshold ? "tooLong" : l.qtyReturned > 0 ? "partReturned" : "out";
    return {
      id: l.id,
      order: l.order,
      customer: l.order.customer,
      product: l.product,
      serialNo: l.unit?.serialNo ?? null,
      qty: l.quantity,
      issueDate,
      returnDate: out <= 0 ? lastReturn : null,
      state,
    };
  });
}

/** The latest payments and refunds (voided ones left out), newest first. */
export async function recentPayments(take = 6) {
  const rows = await db.payment.findMany({
    where: { status: "ACTIVE" },
    orderBy: { id: "desc" },
    take,
    select: {
      id: true,
      receiptNo: true,
      type: true,
      mode: true,
      amount: true,
      paymentDate: true,
      customer: { select: { id: true, name: true } },
    },
  });
  return rows.map((p) => ({ ...p, amount: toPaise(p.amount), paymentDate: fromDbDate(p.paymentDate) }));
}

/** Everything the admin dashboard shows, as of `today`. */
export async function dashboard(today: string) {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { longRentalDays: true } });
  const threshold = settings?.longRentalDays ?? 30;
  const [outAgg, openOrders, long, day, balances, months, stockNow, rentals, payments] = await Promise.all([
    db.issueLine.aggregate({
      where: { status: "ACTIVE", order: { status: "OPEN" } },
      _sum: { quantity: true, qtyReturned: true },
    }),
    db.rentalOrder.count({ where: { status: "OPEN" } }),
    longRentals(today, threshold),
    paymentsOn(today),
    balancesFor({}, today),
    monthlyCollections(today, 6),
    stock(today, threshold),
    recentRentals(today, threshold),
    recentPayments(),
  ]);
  const money = summarizeBalances(balances);
  const customersOwing = new Set(balances.filter((b) => b.invoice && b.balance > 0).map((b) => b.customerId)).size;
  return {
    threshold,
    piecesOut: (outAgg._sum.quantity ?? 0) - (outAgg._sum.qtyReturned ?? 0),
    openOrders,
    longRentals: long,
    today: { received: day.received, refunded: day.refunded, net: day.net, count: day.rows.filter((r) => r.status === "ACTIVE" && r.type !== "REFUND").length, byMode: day.byMode },
    billedDue: money.billedDue,
    customersOwing,
    openSoFar: money.openSoFar,
    creditHeld: money.creditHeld,
    months,
    stock: stockNow,
    recentRentals: rentals,
    recentPayments: payments,
  };
}

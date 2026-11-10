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

/** Open orders with at least one line overdue (counted per order, not per line, and not capped like `longRentals`). */
export async function overdueOrderCount(today: string, threshold: number) {
  const rows = await db.issueLine.groupBy({ by: ["orderId"], where: outLines(addDays(today, -(threshold - 1))) });
  return rows.length;
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

/** Customers: active count, and how many were added since the 1st of this month (IST). */
export async function customerCounts(today: string) {
  const monthStartIst = new Date(`${monthStart(today)}T00:00:00+05:30`);
  const [active, newThisMonth] = await Promise.all([
    db.customer.count({ where: { isActive: true } }),
    db.customer.count({ where: { createdAt: { gte: monthStartIst } } }),
  ]);
  return { active, newThisMonth };
}

/** Money collected (in − refunds, paise) between two business dates, inclusive. Voided payments excluded. */
async function netCollected(from: string, to: string): Promise<number> {
  const rows = await db.payment.findMany({
    where: { status: "ACTIVE", paymentDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { type: true, amount: true },
  });
  return rows.reduce((sum, p) => sum + (p.type === "REFUND" ? -toPaise(p.amount) : toPaise(p.amount)), 0);
}

/**
 * This month so far vs the same number of days of last month, net collected.
 * `changePct` is null when last month had nothing to compare against.
 */
export async function monthToDate(today: string) {
  const thisStart = monthStart(today);
  const lastStart = monthsBack(today, 1);
  const lastMonthEnd = addDays(thisStart, -1);
  const dayOfMonth = Number(today.slice(8, 10));
  const lastCompareEnd = [addDays(lastStart, dayOfMonth - 1), lastMonthEnd].sort()[0];
  const [current, previous] = await Promise.all([netCollected(thisStart, today), netCollected(lastStart, lastCompareEnd)]);
  const changePct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return { current, previous, changePct };
}

/** Invoices issued today (ISSUED only): how many, and their total billed after discount. */
export async function todayInvoices(today: string) {
  const agg = await db.invoice.aggregate({
    where: { status: "ISSUED", invoiceDate: toDbDate(today) },
    _count: { _all: true },
    _sum: { total: true },
  });
  return { count: agg._count._all, billed: toPaise(agg._sum.total ?? 0) };
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

const TOP_ITEMS = 4;

/**
 * Billed rent + damage per item over the last `months` months (ISSUED invoices only), before discounts.
 * Top `TOP_ITEMS` items by amount, the rest summed as `others`. Discounts are reported separately.
 */
export async function revenueByItem(today: string, months = 6) {
  const from = monthsBack(today, months - 1);
  const where = { status: "ISSUED" as const, invoiceDate: { gte: toDbDate(from), lte: toDbDate(today) } };
  const [lines, discount] = await Promise.all([
    db.invoiceLine.findMany({
      where: { invoice: where },
      select: { productName: true, productNameMl: true, rentAmount: true, damageAmount: true },
    }),
    db.invoice.aggregate({ where, _sum: { discountAmount: true } }),
  ]);
  const byName = new Map<string, { name: string; nameMl: string | null; amount: number }>();
  for (const l of lines) {
    const row = byName.get(l.productName) ?? { name: l.productName, nameMl: l.productNameMl, amount: 0 };
    row.amount += toPaise(l.rentAmount) + toPaise(l.damageAmount);
    byName.set(l.productName, row);
  }
  const sorted = [...byName.values()].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, TOP_ITEMS);
  const total = sorted.reduce((s, r) => s + r.amount, 0);
  const others = total - top.reduce((s, r) => s + r.amount, 0);
  return { items: top, others, total, discount: toPaise(discount._sum.discountAmount ?? 0), from };
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

/** Everything the admin dashboard shows, as of `today`. */
export async function dashboard(today: string) {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { longRentalDays: true } });
  const threshold = settings?.longRentalDays ?? 30;
  const [outAgg, openOrders, overdueOrders, long, day, balances, months, stockNow, rentals, customers, mtd, todayInv, byItem] = await Promise.all([
    db.issueLine.aggregate({
      where: { status: "ACTIVE", order: { status: "OPEN" } },
      _sum: { quantity: true, qtyReturned: true },
    }),
    db.rentalOrder.count({ where: { status: "OPEN" } }),
    overdueOrderCount(today, threshold),
    longRentals(today, threshold),
    paymentsOn(today),
    balancesFor({}, today),
    monthlyCollections(today, 6),
    stock(today, threshold),
    recentRentals(today, threshold),
    customerCounts(today),
    monthToDate(today),
    todayInvoices(today),
    revenueByItem(today, 6),
  ]);
  const money = summarizeBalances(balances);
  const customersOwing = new Set(balances.filter((b) => b.invoice && b.balance > 0).map((b) => b.customerId)).size;
  return {
    threshold,
    piecesOut: (outAgg._sum.quantity ?? 0) - (outAgg._sum.qtyReturned ?? 0),
    openOrders,
    overdueOrders,
    longRentals: long,
    today: { received: day.received, refunded: day.refunded, net: day.net, count: day.rows.filter((r) => r.status === "ACTIVE" && r.type !== "REFUND").length, byMode: day.byMode, invoices: todayInv },
    billedDue: money.billedDue,
    customersOwing,
    openSoFar: money.openSoFar,
    creditHeld: money.creditHeld,
    customers,
    monthToDate: mtd,
    revenueByItem: byItem,
    months,
    stock: stockNow,
    recentRentals: rentals,
  };
}

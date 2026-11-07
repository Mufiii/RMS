import "server-only";
import { db } from "@/lib/db";
import { addDays, fromDbDate, toDbDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { accruedRent, days } from "@/modules/billing/engine";
import { balancesFor, paymentsOn, summarizeBalances } from "@/modules/payments/queries";
import { runReport } from "./queries";

/**
 * Items out for `threshold` days or more (counted like rent: issue day = day 1),
 * oldest first: who to call. Rentals have no due date, so age is the signal.
 */
export async function longRentals(today: string, threshold: number) {
  const cutoff = addDays(today, -(threshold - 1));
  const lines = await db.issueLine.findMany({
    where: {
      status: "ACTIVE",
      qtyReturned: { lt: db.issueLine.fields.quantity },
      order: { status: "OPEN" },
      issue: { issueDate: { lte: toDbDate(cutoff) } },
    },
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

/** Everything the admin dashboard shows, as of `today`. */
export async function dashboard(today: string) {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { longRentalDays: true } });
  const threshold = settings?.longRentalDays ?? 30;
  const [outAgg, openOrders, long, day, balances, week] = await Promise.all([
    db.issueLine.aggregate({
      where: { status: "ACTIVE", order: { status: "OPEN" } },
      _sum: { quantity: true, qtyReturned: true },
    }),
    db.rentalOrder.count({ where: { status: "OPEN" } }),
    longRentals(today, threshold),
    paymentsOn(today),
    balancesFor({}, today),
    runReport("collections", { from: addDays(today, -6), to: today }, today),
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
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      return { date, net: Number(week.rows.find((r) => r.date === date)?.net ?? 0) };
    }),
  };
}

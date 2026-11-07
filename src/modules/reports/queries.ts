import "server-only";
import type { PaymentMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addDays, fromDbDate, toDbDate } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { balancesFor, sumPayments } from "@/modules/payments/queries";
import { col, sumColumns, type ReportTable, type Row } from "./table";

export const REPORTS = ["inventory", "customers", "rentals", "payments", "collections"] as const;
export type ReportName = (typeof REPORTS)[number];
/** Reports over a date range; the others are a snapshot as of today. */
export const RANGED: ReadonlySet<ReportName> = new Set(["rentals", "payments", "collections"]);
export type Range = { from: string; to: string };

/** Stock per product right now: owned, out, in repair, available and how much of it is out. */
async function inventory(): Promise<ReportTable> {
  const products = await db.product.findMany({
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    include: { category: { select: { name: true } } },
  });
  const rows: Row[] = products.map((p) => ({
    category: p.category.name,
    product: p.name,
    code: p.code,
    tracking: p.tracking === "SERIALISED" ? "serial" : "qty",
    active: p.isActive ? "yes" : "no",
    rate: toPaise(p.dailyRate),
    owned: p.qtyOwned,
    out: p.qtyOut,
    repair: p.qtyRepair,
    available: p.qtyOwned - p.qtyOut - p.qtyRepair,
    utilisation: p.qtyOwned > 0 ? (p.qtyOut / p.qtyOwned) * 100 : null,
  }));
  return {
    columns: [
      col("category"),
      col("product"),
      col("code"),
      col("tracking"),
      col("active"),
      col("rate", "money"),
      col("owned", "int"),
      col("out", "int"),
      col("repair", "int"),
      col("available", "int"),
      col("utilisation", "pct"),
    ],
    rows,
    totals: sumColumns(rows, ["owned", "out", "repair", "available"], { category: "total" }),
  };
}

/** Every customer with orders: what they have out and what they owe (as of today). */
async function customers(today: string): Promise<ReportTable> {
  const [balances, list, out] = await Promise.all([
    balancesFor({}, today),
    db.customer.findMany({
      where: { orders: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, isActive: true, orders: { select: { status: true, openedOn: true } } },
    }),
    db.issueLine.groupBy({
      by: ["orderId"],
      where: { status: "ACTIVE", order: { status: "OPEN" } },
      _sum: { quantity: true, qtyReturned: true },
    }),
  ]);
  const outByOrder = new Map(out.map((o) => [o.orderId, (o._sum.quantity ?? 0) - (o._sum.qtyReturned ?? 0)]));
  const rows: Row[] = list.map((c) => {
    const mine = balances.filter((b) => b.customerId === c.id);
    const invoiced = mine.filter((b) => b.invoice);
    const lastOpened = c.orders.reduce((m, o) => (fromDbDate(o.openedOn) > m ? fromDbDate(o.openedOn) : m), "");
    return {
      no: c.id,
      name: c.name,
      phone: c.phone,
      active: c.isActive ? "yes" : "no",
      orders: c.orders.length,
      openOrders: c.orders.filter((o) => o.status === "OPEN").length,
      piecesOut: mine.reduce((s, b) => s + (outByOrder.get(b.id) ?? 0), 0),
      billedDue: invoiced.reduce((s, b) => s + Math.max(b.balance, 0), 0),
      openSoFar: mine.filter((b) => !b.invoice).reduce((s, b) => s + b.balance, 0),
      excess: invoiced.reduce((s, b) => s + Math.max(-b.balance, 0), 0),
      lastOrder: lastOpened || null,
    };
  });
  return {
    columns: [
      col("no", "int"),
      col("name"),
      col("phone"),
      col("active"),
      col("orders", "int"),
      col("openOrders", "int"),
      col("piecesOut", "int"),
      col("billedDue", "money"),
      col("openSoFar", "money"),
      col("excess", "money"),
      col("lastOrder", "date"),
    ],
    rows,
    totals: sumColumns(rows, ["orders", "openOrders", "piecesOut", "billedDue", "openSoFar", "excess"], { name: "total" }),
  };
}

/** Orders opened in the range, with what was issued, the invoice and the money received. */
async function rentals(r: Range): Promise<ReportTable> {
  const orders = await db.rentalOrder.findMany({
    where: { openedOn: { gte: toDbDate(r.from), lte: toDbDate(r.to) } },
    orderBy: [{ openedOn: "asc" }, { id: "asc" }],
    include: {
      customer: { select: { name: true, phone: true } },
      lines: { where: { status: "ACTIVE" }, select: { quantity: true, qtyReturned: true } },
      invoices: { where: { status: "ISSUED" }, select: { invoiceNo: true, total: true } },
      payments: { select: { type: true, status: true, amount: true } },
    },
  });
  const rows: Row[] = orders.map((o) => {
    const { received, refunded } = sumPayments(o.payments);
    const inv = o.invoices[0];
    return {
      order: o.orderNo,
      opened: fromDbDate(o.openedOn),
      customer: o.customer.name,
      phone: o.customer.phone,
      status: o.status.toLowerCase(),
      issued: o.lines.reduce((s, l) => s + l.quantity, 0),
      out: o.status === "OPEN" ? o.lines.reduce((s, l) => s + l.quantity - l.qtyReturned, 0) : 0,
      invoice: inv?.invoiceNo ?? null,
      invoiceTotal: inv ? toPaise(inv.total) : null,
      received: received - refunded,
    };
  });
  return {
    columns: [
      col("order"),
      col("opened", "date"),
      col("customer"),
      col("phone"),
      col("status"),
      col("issued", "int"),
      col("out", "int"),
      col("invoice"),
      col("invoiceTotal", "money"),
      col("received", "money"),
    ],
    rows,
    totals: sumColumns(rows, ["issued", "out", "invoiceTotal", "received"], { order: "total" }),
  };
}

/** Every receipt and refund in the range. Voided ones are listed (status "voided") but not totalled. */
async function payments(r: Range): Promise<ReportTable> {
  const list = await db.payment.findMany({
    where: { paymentDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
    include: {
      customer: { select: { name: true } },
      order: { select: { orderNo: true } },
      receivedBy: { select: { fullName: true } },
    },
  });
  const rows: Row[] = list.map((p) => {
    const amount = toPaise(p.amount);
    const live = p.status === "ACTIVE";
    return {
      date: fromDbDate(p.paymentDate),
      receipt: p.receiptNo,
      type: p.type.toLowerCase(),
      mode: p.mode.toLowerCase(),
      customer: p.customer.name,
      order: p.order.orderNo,
      reference: p.reference,
      in: live && p.type !== "REFUND" ? amount : null,
      outAmt: live && p.type === "REFUND" ? amount : null,
      status: live ? "active" : "voided",
      by: p.receivedBy.fullName,
    };
  });
  return {
    columns: [
      col("date", "date"),
      col("receipt"),
      col("type"),
      col("mode"),
      col("customer"),
      col("order"),
      col("reference"),
      col("in", "money"),
      col("outAmt", "money"),
      col("status"),
      col("by"),
    ],
    rows,
    totals: sumColumns(rows, ["in", "outAmt"], { date: null, receipt: "total" }),
  };
}

const MODES: PaymentMode[] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"];

/** Collections per day in the range: money in per mode, refunds out and the net. Days without money are skipped. */
async function collections(r: Range): Promise<ReportTable> {
  const list = await db.payment.findMany({
    where: { status: "ACTIVE", paymentDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } },
    select: { paymentDate: true, type: true, mode: true, amount: true },
  });
  const byDay = new Map<string, Row>();
  for (const p of list) {
    const day = fromDbDate(p.paymentDate);
    const row = byDay.get(day) ?? { date: day, CASH: 0, UPI: 0, BANK_TRANSFER: 0, CHEQUE: 0, refunds: 0, net: 0 };
    const a = toPaise(p.amount);
    if (p.type === "REFUND") {
      row.refunds = Number(row.refunds) + a;
      row.net = Number(row.net) - a;
    } else {
      row[p.mode] = Number(row[p.mode]) + a;
      row.net = Number(row.net) + a;
    }
    byDay.set(day, row);
  }
  const rows = [...byDay.values()].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
  return {
    columns: [col("date", "date"), ...MODES.map((m) => col(m, "money")), col("refunds", "money"), col("net", "money")],
    rows,
    totals: sumColumns(rows, [...MODES, "refunds", "net"], { date: null }),
  };
}

export function runReport(name: ReportName, range: Range, today: string): Promise<ReportTable> {
  switch (name) {
    case "inventory":
      return inventory();
    case "customers":
      return customers(today);
    case "rentals":
      return rentals(range);
    case "payments":
      return payments(range);
    case "collections":
      return collections(range);
  }
}

/** ?from=&to= → a valid range: defaults to this month so far, never in the future, at most 366 days. */
export function parseRange(params: { from?: unknown; to?: unknown }, today: string, isIso: (s: string) => boolean): Range {
  const pick = (v: unknown) => (typeof v === "string" && isIso(v) && v <= today ? v : null);
  const to = pick(params.to) ?? today;
  let from = pick(params.from) ?? `${today.slice(0, 8)}01`;
  if (from > to) from = to;
  if (from < addDays(to, -365)) from = addDays(to, -365);
  return { from, to };
}

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, businessToday, isIsoDate } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { newProductSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct } from "@/modules/products/service";
import { createOrder, type Actor } from "@/modules/orders/service";
import { returnEntrySchema } from "@/modules/returns/schema";
import { recordReturn } from "@/modules/returns/service";
import { createInvoice } from "@/modules/invoices/service";
import { moneySchema } from "@/modules/payments/schema";
import { recordPayment, recordRefund, voidPayment } from "@/modules/payments/service";
import { dashboard, longRentals } from "./dashboard";
import { parseRange, runReport } from "./queries";

const today = businessToday();
let admin: Actor;
let ravi: number;
let anu: number;
let props: { id: number };
let gen: { id: number };

const order = (customerId: number, daysAgo: number, lines: Parameters<typeof createOrder>[1]["lines"]) =>
  createOrder(admin, { customerId, siteAddress: null, notes: null, date: addDays(today, -daysAgo), lines });
const pay = (orderId: number, amount: string, mode = "CASH") => recordPayment(admin, moneySchema.parse({ orderId, amount, mode, reference: mode === "CHEQUE" ? "1" : undefined }));

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN", fullName: "Boss" })).id, role: "ADMIN" };
  ravi = (await createCustomer(admin, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
  anu = (await createCustomer(admin, customerSchema.parse({ name: "Anu", phone: "9847099999" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 50 }));
  gen = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Generator", tracking: "SERIALISED", dailyRate: "1500", serials: "G1\nG2" }));
});

describe("longRentals", () => {
  it("flags items out for the threshold or more (issue day = day 1), oldest first", async () => {
    await order(ravi, 29, [{ productId: props.id, quantity: 4 }]); // day 30 today → flagged
    await order(anu, 28, [{ productId: props.id, quantity: 2 }]); // day 29 → not yet
    const units = await db.productUnit.findMany({ where: { productId: gen.id }, orderBy: { id: "asc" } });
    await order(anu, 45, [{ productId: gen.id, unitIds: [units[0].id] }]); // day 46
    const long = await longRentals(today, 30);
    expect(long.map((l) => [l.customer.name, l.product.name, l.serialNo, l.qty, l.days])).toEqual([
      ["Anu", "Generator", "G1", 1, 46],
      ["Ravi", "Prop", null, 4, 30],
    ]);
    expect(long[1].accrued).toBe(4 * 800 * 30);
  });

  it("only counts what is still out", async () => {
    const o = await order(ravi, 40, [{ productId: props.id, quantity: 10 }]);
    const line = await db.issueLine.findFirstOrThrow({ where: { orderId: o.id } });
    await recordReturn(admin, { orderId: o.id, date: addDays(today, -5), notes: null, entries: [returnEntrySchema.parse({ issueLineId: line.id, good: 7 })] });
    expect((await longRentals(today, 30)).map((l) => l.qty)).toEqual([3]);
  });
});

describe("dashboard", () => {
  it("sums items out, today's collections and what is owed; the threshold comes from Settings", async () => {
    const o1 = await order(ravi, 9, [{ productId: props.id, quantity: 10 }]);
    const l1 = await db.issueLine.findFirstOrThrow({ where: { orderId: o1.id } });
    await recordReturn(admin, { orderId: o1.id, date: addDays(today, -5), notes: null, entries: [returnEntrySchema.parse({ issueLineId: l1.id, good: 10 })] });
    await createInvoice(admin, { orderId: o1.id, discount: null, discountReason: null }); // 10 × ₹8 × 5 days = ₹400
    await pay(o1.id, "150", "UPI");
    const o2 = await order(anu, 34, [{ productId: props.id, quantity: 3 }]); // open, day 35
    await pay(o2.id, "100");

    let d = await dashboard(today);
    expect([d.piecesOut, d.openOrders, d.longRentals.length, d.threshold]).toEqual([3, 1, 1, 30]);
    expect([d.today.received, d.today.refunded, d.today.net, d.today.count]).toEqual([25000, 0, 25000, 2]);
    expect([d.billedDue, d.customersOwing, d.creditHeld]).toEqual([25000, 1, 0]);
    expect(d.openSoFar).toBe(3 * 800 * 35 - 10000);
    expect(d.week).toHaveLength(7);
    expect(d.week[6]).toEqual({ date: today, net: 25000 });

    await db.settings.update({ where: { id: 1 }, data: { longRentalDays: 40 } });
    d = await dashboard(today);
    expect([d.threshold, d.longRentals.length]).toEqual([40, 0]);
  });
});

describe("reports", () => {
  const range = { from: addDays(today, -30), to: today };

  it("inventory: owned, out, repair, available and utilisation, with totals", async () => {
    await order(ravi, 1, [{ productId: props.id, quantity: 10 }]);
    const r = await runReport("inventory", range, today);
    expect(r.rows.map((x) => [x.product, x.owned, x.out, x.available, x.utilisation])).toEqual([
      ["Generator", 2, 0, 2, 0],
      ["Prop", 50, 10, 40, 20],
    ]);
    expect(r.totals).toMatchObject({ owned: 52, out: 10, available: 42 });
  });

  it("customers: orders, pieces out, billed due, open so far and excess", async () => {
    const o1 = await order(ravi, 9, [{ productId: props.id, quantity: 10 }]);
    const l1 = await db.issueLine.findFirstOrThrow({ where: { orderId: o1.id } });
    await pay(o1.id, "500");
    await recordReturn(admin, { orderId: o1.id, date: addDays(today, -5), notes: null, entries: [returnEntrySchema.parse({ issueLineId: l1.id, good: 10 })] });
    await createInvoice(admin, { orderId: o1.id, discount: null, discountReason: null }); // ₹400 → ₹100 excess
    await order(anu, 0, [{ productId: props.id, quantity: 2 }]); // ₹16 so far
    const r = await runReport("customers", range, today);
    expect(r.rows.map((x) => [x.name, x.orders, x.openOrders, x.piecesOut, x.billedDue, x.openSoFar, x.excess])).toEqual([
      ["Anu", 1, 1, 2, 0, 1600, 0],
      ["Ravi", 1, 0, 0, 0, 0, 10000],
    ]);
  });

  it("rentals: orders opened in the range only", async () => {
    await order(ravi, 40, [{ productId: props.id, quantity: 1 }]); // before the range
    await order(anu, 3, [{ productId: props.id, quantity: 6 }]);
    const r = await runReport("rentals", range, today);
    expect(r.rows.map((x) => [x.customer, x.issued, x.out, x.status])).toEqual([["Anu", 6, 6, "open"]]);
  });

  it("payments and collections: voided money is listed but never totalled; refunds come off the net", async () => {
    const o1 = await order(ravi, 9, [{ productId: props.id, quantity: 10 }]);
    const l1 = await db.issueLine.findFirstOrThrow({ where: { orderId: o1.id } });
    await pay(o1.id, "600");
    const wrong = await pay(o1.id, "50", "UPI");
    await voidPayment(admin, { paymentId: wrong.id, reason: "Duplicate" });
    await recordReturn(admin, { orderId: o1.id, date: addDays(today, -5), notes: null, entries: [returnEntrySchema.parse({ issueLineId: l1.id, good: 10 })] });
    await createInvoice(admin, { orderId: o1.id, discount: null, discountReason: null });
    await recordRefund(admin, moneySchema.parse({ orderId: o1.id, amount: "200", mode: "CASH" }));

    const p = await runReport("payments", range, today);
    expect(p.rows.map((x) => [x.type, x.mode, x.in, x.outAmt, x.status])).toEqual([
      ["advance", "cash", 60000, null, "active"],
      ["advance", "upi", null, null, "voided"],
      ["refund", "cash", null, 20000, "active"],
    ]);
    expect(p.totals).toMatchObject({ in: 60000, outAmt: 20000 });

    const c = await runReport("collections", range, today);
    expect(c.rows).toEqual([{ date: today, CASH: 60000, UPI: 0, BANK_TRANSFER: 0, CHEQUE: 0, refunds: 20000, net: 40000 }]);
  });
});

describe("parseRange", () => {
  it("defaults to this month so far and never goes past today or beyond a year", () => {
    expect(parseRange({}, "2026-11-07", isIsoDate)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(parseRange({ from: "2026-11-05", to: "2026-11-03" }, "2026-11-07", isIsoDate)).toEqual({ from: "2026-11-03", to: "2026-11-03" });
    expect(parseRange({ from: "2026-10-01", to: "2027-01-01" }, "2026-11-07", isIsoDate)).toEqual({ from: "2026-10-01", to: "2026-11-07" });
    expect(parseRange({ from: "2020-01-01" }, "2026-11-07", isIsoDate)).toEqual({ from: "2025-11-07", to: "2026-11-07" });
    expect(parseRange({ from: "garbage", to: ["x"] }, "2026-11-07", isIsoDate)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
  });
});

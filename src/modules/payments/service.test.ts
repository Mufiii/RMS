import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { businessToday, fiscalYear } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { newProductSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct } from "@/modules/products/service";
import { cancelOrder, createOrder, voidIssueLine, type Actor } from "@/modules/orders/service";
import { returnEntrySchema } from "@/modules/returns/schema";
import { recordReturn } from "@/modules/returns/service";
import { cancelInvoice, createInvoice } from "@/modules/invoices/service";
import { orderBalances } from "./queries";
import { moneySchema } from "./schema";
import { recordPayment, recordRefund, voidPayment } from "./service";

let admin: Actor;
let staff: Actor;
let customerId: number;
let props: { id: number };
let orderId: number;
let propLine: number;

const FY = fiscalYear(businessToday());
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; params?: object }) => e.code ?? String(e));
const pay = (amount: string, o: Partial<{ mode: string; reference: string; orderId: number }> = {}) =>
  recordPayment(staff, moneySchema.parse({ orderId: o.orderId ?? orderId, amount, mode: o.mode ?? "CASH", reference: o.reference }));
const refund = (amount: string) => recordRefund(staff, moneySchema.parse({ orderId, amount, mode: "CASH" }));
/** All 10 props back on 5 Nov: 10 × ₹8 × 5 days = ₹400, then the final invoice. */
const settle = async () => {
  await recordReturn(admin, { orderId, date: "2026-11-05", notes: null, entries: [returnEntrySchema.parse({ issueLineId: propLine, good: 10 })] });
  return createInvoice(staff, { orderId, discount: null, discountReason: null });
};

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
  staff = { id: (await makeUser({ role: "STAFF" })).id, role: "STAFF" };
  customerId = (await createCustomer(staff, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 50 }));
  const o = await createOrder(admin, { customerId, siteAddress: null, notes: null, date: "2026-11-01", lines: [{ productId: props.id, quantity: 10 }] });
  orderId = o.id;
  propLine = (await db.issueLine.findFirstOrThrow({ where: { orderId } })).id;
});

describe("recordPayment", () => {
  it("before the invoice, money in is an ADVANCE with no limit, dated today, with a gap-free receipt number", async () => {
    const a = await pay("5000");
    const b = await pay("250.50", { mode: "UPI", reference: "UPI-123" });
    expect([a.receiptNo, b.receiptNo]).toEqual([`RCP/${FY}/0001`, `RCP/${FY}/0002`]);
    expect([a.type, b.type, b.mode, b.amount.toFixed(2), b.reference]).toEqual(["ADVANCE", "ADVANCE", "UPI", "250.50", "UPI-123"]);
    expect(a.paymentDate.toISOString().slice(0, 10)).toBe(businessToday());
    expect(a.customerId).toBe(customerId);
    expect(await db.auditLog.count({ where: { action: "PAYMENT_CREATE" } })).toBe(2);
  });

  it("after the invoice, money in is a PAYMENT and can't exceed the balance due", async () => {
    await pay("100"); // advance
    await settle(); // ₹400
    expect(await code(pay("300.01"))).toBe("payments.moreThanDue");
    const p = await pay("300");
    expect(p.type).toBe("PAYMENT");
    expect(await code(pay("1"))).toBe("payments.nothingDue");
  });

  it("is refused on a cancelled order", async () => {
    await voidIssueLine(admin, { lineId: propLine, reason: "Wrong entry" });
    await cancelOrder(admin, { orderId, reason: "Mistake" });
    expect(await code(pay("10"))).toBe("payments.orderCancelled");
  });

  it("concurrent payments can't together exceed the balance", async () => {
    await settle();
    const results = await Promise.all(Array.from({ length: 4 }, () => code(pay("300"))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(await db.payment.count()).toBe(1);
  });

  it("validates input: positive amounts, cheque numbers", () => {
    expect(moneySchema.safeParse({ orderId, amount: "0", mode: "CASH" }).success).toBe(false);
    expect(moneySchema.safeParse({ orderId, amount: "10.555", mode: "CASH" }).success).toBe(false);
    expect(moneySchema.safeParse({ orderId, amount: "10", mode: "CHEQUE" }).success).toBe(false);
    expect(moneySchema.safeParse({ orderId, amount: "10", mode: "CHEQUE", reference: "004512" }).success).toBe(true);
    expect(moneySchema.safeParse({ orderId, amount: "10", mode: "BITCOIN" }).success).toBe(false);
  });
});

describe("recordRefund", () => {
  it("only once the invoice exists, and never more than the excess", async () => {
    await pay("1000");
    expect(await code(refund("100"))).toBe("payments.refundNeedsInvoice");
    await settle(); // ₹400 → excess ₹600
    expect(await code(refund("600.01"))).toBe("payments.refundTooLarge");
    const r = await refund("500");
    expect([r.type, r.receiptNo]).toEqual(["REFUND", `RFD/${FY}/0001`]);
    await refund("100");
    expect(await code(refund("1"))).toBe("payments.noExcess");
    expect(await db.auditLog.count({ where: { action: "REFUND_CREATE" } })).toBe(2);
  });

  it("nothing to refund when nothing was overpaid", async () => {
    await settle();
    await pay("400");
    expect(await code(refund("1"))).toBe("payments.noExcess");
  });
});

describe("voidPayment (admin)", () => {
  it("marks the payment voided with a reason, keeps it, and frees the balance again", async () => {
    await settle();
    const p = await pay("400");
    await voidPayment(admin, { paymentId: p.id, reason: "Entered twice" });
    const v = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect([v.status, v.voidReason, v.voidedById]).toEqual(["VOIDED", "Entered twice", admin.id]);
    expect((await pay("400")).type).toBe("PAYMENT"); // the full ₹400 is due again
    expect(await code(voidPayment(admin, { paymentId: p.id, reason: "Again" }))).toBe("payments.alreadyVoided");
    expect(await code(voidPayment(admin, { paymentId: 9999, reason: "Nope" }))).toBe("payments.notFound");
  });

  it("money in can't be voided while a refund depends on it — void the refund first", async () => {
    const a = await pay("1000");
    await settle();
    const r = await refund("600");
    expect(await code(voidPayment(admin, { paymentId: a.id, reason: "Wrong" }))).toBe("payments.voidRefundFirst");
    await voidPayment(admin, { paymentId: r.id, reason: "Refund not given" });
    await voidPayment(admin, { paymentId: a.id, reason: "Wrong" });
    expect(await db.payment.count({ where: { status: "ACTIVE" } })).toBe(0);
  });

  it("voiding one of several advances is fine as long as refunds stay covered", async () => {
    const a = await pay("700");
    await pay("100");
    await settle(); // due 400, paid 800, excess 400
    await refund("200"); // excess left 200
    await voidPayment(admin, { paymentId: (await db.payment.findFirstOrThrow({ where: { amount: "100" } })).id, reason: "Mistake" });
    expect(await code(voidPayment(admin, { paymentId: a.id, reason: "Mistake" }))).toBe("payments.voidRefundFirst");
  });
});

describe("with other modules", () => {
  it("an order with payments can't be cancelled", async () => {
    const p = await pay("100");
    await voidIssueLine(admin, { lineId: propLine, reason: "Wrong entry" });
    expect(await code(cancelOrder(admin, { orderId, reason: "Mistake" }))).toBe("orders.hasPayments");
    await voidPayment(admin, { paymentId: p.id, reason: "Mistake" });
    await cancelOrder(admin, { orderId, reason: "Mistake" });
  });

  it("payments survive an invoice cancel and count against the reissued invoice", async () => {
    await pay("150");
    const inv = await settle();
    await pay("250"); // fully paid
    const { reissued } = await cancelInvoice(admin, { invoiceId: inv.id, reason: "Discount", reissue: { amount: "100", reason: "Regular" } });
    expect(reissued!.total.toFixed(2)).toBe("300.00");
    // ₹400 received against ₹300 → ₹100 excess, refundable.
    expect((await refund("100")).type).toBe("REFUND");
  });

  it("money after an invoice is cancelled and the order re-opened is an advance again", async () => {
    const inv = await settle();
    await cancelInvoice(admin, { invoiceId: inv.id, reason: "Fix a return" });
    expect((await pay("50")).type).toBe("ADVANCE");
  });
});

describe("database backstops", () => {
  it("amount > 0, cheques carry a number, payments are never edited or deleted", async () => {
    const p = await pay("100");
    const base = { receiptNo: "X/1", orderId, customerId, type: "ADVANCE" as const, mode: "CASH" as const, paymentDate: p.paymentDate, receivedById: staff.id };
    await expect(db.payment.create({ data: { ...base, amount: "0" } })).rejects.toThrow();
    await expect(db.payment.create({ data: { ...base, mode: "CHEQUE", amount: "10" } })).rejects.toThrow();
    await expect(db.payment.update({ where: { id: p.id }, data: { amount: "1" } })).rejects.toThrow();
    await expect(db.payment.update({ where: { id: p.id }, data: { status: "VOIDED" } })).rejects.toThrow(); // void needs who/when/why
    await expect(db.payment.delete({ where: { id: p.id } })).rejects.toThrow();
  });
});

describe("orderBalances (customer outstanding)", () => {
  it("billed balance due, excess held and open orders' rent so far minus advances", async () => {
    await pay("100");
    await settle(); // order 1: ₹400 billed, ₹100 paid → ₹300 due
    const o2 = await createOrder(admin, { customerId, siteAddress: null, notes: null, date: "2026-11-01", lines: [{ productId: props.id, quantity: 5 }] });
    await pay("50", { orderId: o2.id });
    const b = await orderBalances(customerId, "2026-11-07");
    // order 2 open: 5 × ₹8 × 7 days = ₹280 so far − ₹50 advance = ₹230
    expect(b.rows.map((r) => [r.orderNo.slice(-4), r.due, r.received, r.balance])).toEqual([
      ["0001", 40000, 10000, 30000],
      ["0002", 28000, 5000, 23000],
    ]);
    expect([b.billedDue, b.creditHeld, b.openSoFar]).toEqual([30000, 0, 23000]);
  });
});

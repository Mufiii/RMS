import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, businessToday } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { newProductSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct } from "@/modules/products/service";
import { returnEntrySchema } from "@/modules/returns/schema";
import { recordReturn } from "@/modules/returns/service";
import { createInvoice } from "@/modules/invoices/service";
import { moneySchema } from "@/modules/payments/schema";
import { recordPayment, recordRefund } from "@/modules/payments/service";
import { balancesFor } from "@/modules/payments/queries";
import { createOrder, type Actor } from "./service";
import { listOrders } from "./queries";

const today = businessToday();
let admin: Actor;
let ravi: number;
let props: { id: number };

const order = (daysAgo: number, quantity: number) =>
  createOrder(admin, { customerId: ravi, siteAddress: null, notes: null, date: addDays(today, -daysAgo), lines: [{ productId: props.id, quantity }] });
const pay = (orderId: number, amount: string) => recordPayment(admin, moneySchema.parse({ orderId, amount, mode: "CASH" }));
async function giveBack(orderId: number, good: number, daysAgo: number) {
  const line = await db.issueLine.findFirstOrThrow({ where: { orderId } });
  await recordReturn(admin, { orderId, date: addDays(today, -daysAgo), notes: null, entries: [returnEntrySchema.parse({ issueLineId: line.id, good })] });
}
const row = async (id: number) => (await listOrders("", "ALL", 1)).rows.find((r) => r.id === id)!;

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test", longRentalDays: 30 } });
  admin = { id: (await makeUser({ role: "ADMIN", fullName: "Boss" })).id, role: "ADMIN" };
  ravi = (await createCustomer(admin, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 100 }));
});

describe("listOrders: items, days out, amount, balance and stage", () => {
  it("open order with an advance: rent so far counted to today, less the advance", async () => {
    const o = await order(4, 10); // issued 4 days ago = day 5 today; 10 × ₹8 × 5 = ₹400
    await pay(o.id, "150");
    const r = await row(o.id);
    expect([r.totalItems, r.piecesOut, r.daysOut, r.invoiced, r.stage]).toEqual([10, 10, 5, false, "out"]);
    expect([r.amount, r.balance]).toEqual([40000, 25000]);
  });

  it("partial return: counts what is out, and days out follow the oldest piece still out", async () => {
    const o = await order(9, 10);
    await giveBack(o.id, 6, 5); // 6 back after 5 days: 6 × ₹8 × 5 = ₹240; 4 still out since day 10: 4 × ₹8 × 10 = ₹320
    const r = await row(o.id);
    expect([r.totalItems, r.piecesOut, r.daysOut, r.stage]).toEqual([10, 4, 10, "partReturned"]);
    expect(r.amount).toBe(24000 + 32000);
  });

  it("all back but not billed: ready to bill, nothing out", async () => {
    const o = await order(9, 10);
    await giveBack(o.id, 10, 5);
    const r = await row(o.id);
    expect([r.piecesOut, r.daysOut, r.stage]).toEqual([0, null, "readyToBill"]);
    expect(r.amount).toBe(40000);
  });

  it("invoiced and part paid: the invoice total, what is still owed, then paid", async () => {
    const o = await order(9, 10);
    await giveBack(o.id, 10, 5);
    await createInvoice(admin, { orderId: o.id, discount: null, discountReason: null }); // ₹400
    await pay(o.id, "150");
    let r = await row(o.id);
    expect([r.invoiced, r.amount, r.balance, r.stage, r.daysOut]).toEqual([true, 40000, 25000, "unpaid", null]);
    await pay(o.id, "250");
    r = await row(o.id);
    expect([r.balance, r.stage]).toEqual([0, "paid"]);
  });

  it("excess after a discount is refund due, and a refund clears it", async () => {
    const o = await order(9, 10);
    await giveBack(o.id, 10, 5);
    await pay(o.id, "400");
    await createInvoice(admin, { orderId: o.id, discount: "100", discountReason: "regular customer" }); // ₹400 − ₹100 = ₹300; ₹100 excess
    let r = await row(o.id);
    expect([r.amount, r.balance, r.stage]).toEqual([30000, -10000, "refundDue"]);
    await recordRefund(admin, moneySchema.parse({ orderId: o.id, amount: "100", mode: "CASH" }));
    r = await row(o.id);
    expect([r.balance, r.stage]).toEqual([0, "paid"]);
  });

  it("amounts and balances equal balancesFor, the figures the order and customer pages use", async () => {
    const a = await order(9, 10);
    await giveBack(a.id, 10, 5);
    await createInvoice(admin, { orderId: a.id, discount: null, discountReason: null });
    await pay(a.id, "100");
    const b = await order(2, 3);
    await pay(b.id, "10");
    const rows = (await listOrders("", "ALL", 1)).rows;
    for (const bal of await balancesFor({}, today)) {
      const r = rows.find((x) => x.id === bal.id)!;
      expect([r.amount, r.balance]).toEqual([bal.due, bal.balance]);
    }
  });

  it("the threshold comes from Settings; cancelled orders have no money", async () => {
    const o = await order(2, 1);
    const page = await listOrders("", "ALL", 1);
    expect(page.threshold).toBe(30);
    await db.rentalOrder.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledById: admin.id, cancelledAt: new Date(), cancelReason: "entered by mistake" } });
    const r = await row(o.id);
    expect([r.amount, r.balance, r.stage, r.daysOut]).toEqual([null, null, "cancelled", null]);
  });
});

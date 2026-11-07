import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, businessToday } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { newProductSchema } from "@/modules/inventory/schema";
import { createInvoice } from "@/modules/invoices/service";
import { cancelOrder, createOrder, type Actor, voidIssueLine } from "@/modules/orders/service";
import { moneySchema } from "@/modules/payments/schema";
import { recordPayment } from "@/modules/payments/service";
import { createCategory, createProduct } from "@/modules/products/service";
import { returnEntrySchema } from "@/modules/returns/schema";
import { recordReturn } from "@/modules/returns/service";
import { customerSummary, searchCustomers } from "./queries";
import { customerSchema } from "./schema";
import { createCustomer, deleteCustomer, setCustomerActive } from "./service";

const today = businessToday();
let admin: Actor;
let props: { id: number };
let ravi: number;
let anu: number;
let manu: number;

const customer = async (name: string, phone: string) => (await createCustomer(admin, customerSchema.parse({ name, phone }))).id;
const order = (customerId: number, daysAgo: number, quantity: number) =>
  createOrder(admin, { customerId, siteAddress: null, notes: null, date: addDays(today, -daysAgo), lines: [{ productId: props.id, quantity }] });
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 50 }));
  ravi = await customer("Ravi", "9847012345");
  anu = await customer("Anu", "9847099999");
  manu = await customer("Manu", "9847011111");

  // Ravi: invoiced ₹400, paid ₹150 → ₹250 billed and unpaid.
  const o1 = await order(ravi, 9, 10);
  const l1 = await db.issueLine.findFirstOrThrow({ where: { orderId: o1.id } });
  await recordReturn(admin, { orderId: o1.id, date: addDays(today, -5), notes: null, entries: [returnEntrySchema.parse({ issueLineId: l1.id, good: 10 })] });
  await createInvoice(admin, { orderId: o1.id, discount: null, discountReason: null });
  await recordPayment(admin, moneySchema.parse({ orderId: o1.id, amount: "150", mode: "CASH" }));
  // Anu: one open order (running rent is not "outstanding") and one cancelled order (not a rental).
  await order(anu, 3, 2);
  const o3 = await order(anu, 2, 1);
  const l3 = await db.issueLine.findFirstOrThrow({ where: { orderId: o3.id } });
  await voidIssueLine(admin, { lineId: l3.id, reason: "Typo" });
  await cancelOrder(admin, { orderId: o3.id, reason: "Typo" });
  // Manu: no history, inactive.
  await setCustomerActive(admin, manu, false, null);
});

describe("customer list", () => {
  it("shows rentals (cancelled left out), billed-and-unpaid amount and whether there is history", async () => {
    const { rows, total } = await searchCustomers("", "all", 1, today);
    expect(total).toBe(3);
    expect(rows.map((r) => [r.name, r.isActive, r.rentals, r.outstanding, r.hasHistory])).toEqual([
      ["Anu", true, 1, 0, true],
      ["Ravi", true, 1, 25000, true],
      ["Manu", false, 0, 0, false],
    ]);
    expect((await searchCustomers("", "inactive", 1, today)).rows.map((r) => r.name)).toEqual(["Manu"]);
  });

  it("summary cards count the whole shop", async () => {
    expect(await customerSummary(today)).toEqual({ customers: 3, active: 2, rentals: 2, outstanding: 25000, customersOwing: 1 });
  });
});

describe("deleteCustomer", () => {
  it("deletes a customer with no orders or payments and keeps their details in the audit log", async () => {
    await deleteCustomer(admin, manu);
    expect(await db.customer.findUnique({ where: { id: manu } })).toBeNull();
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "CUSTOMER_DELETE" } });
    expect(a).toMatchObject({ actorId: admin.id, entityId: String(manu), summary: { name: "Manu", phone: "9847011111" } });
  });

  it("refuses customers with history, even if their only order was cancelled", async () => {
    expect(await code(deleteCustomer(admin, ravi))).toBe("customers.hasHistory");
    const only = await customer("Only cancelled", "9847022222");
    const o = await order(only, 1, 1);
    await voidIssueLine(admin, { lineId: (await db.issueLine.findFirstOrThrow({ where: { orderId: o.id } })).id, reason: "x" });
    await cancelOrder(admin, { orderId: o.id, reason: "x" });
    expect(await code(deleteCustomer(admin, only))).toBe("customers.hasHistory");
    expect(await code(deleteCustomer(admin, 99999))).toBe("customers.notFound");
  });
});

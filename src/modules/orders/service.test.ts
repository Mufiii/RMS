import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { businessToday } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer, setCustomerActive } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { reconcile } from "@/modules/inventory/service";
import { newProductSchema, productSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct, setProductActive, updateProduct } from "@/modules/products/service";
import { cancelOrder, createOrder, issueItems, resolveEntryDate, voidIssueLine, type Actor } from "./service";

let admin: Actor;
let staff: Actor;
let customerId: number;
let props: { id: number };
let gen: { id: number };
let genUnits: { id: number; serialNo: string }[];

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
  staff = { id: (await makeUser({ role: "STAFF" })).id, role: "STAFF" };
  customerId = (await createCustomer(staff, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 10 }));
  gen = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Generator", tracking: "SERIALISED", dailyRate: "1500", serials: "G1\nG2" }));
  genUnits = await db.productUnit.findMany({ where: { productId: gen.id }, orderBy: { id: "asc" } });
});

const stock = async (id: number) => {
  const p = await db.product.findUniqueOrThrow({ where: { id } });
  return { owned: p.qtyOwned, out: p.qtyOut, repair: p.qtyRepair };
};
const order = (actor: Actor, lines: { productId: number; quantity?: number; unitIds?: number[] }[], date: string | null = null) =>
  createOrder(actor, { customerId, siteAddress: null, notes: null, date, lines });

describe("resolveEntryDate", () => {
  const today = "2026-11-06";
  it("staff always get today; admins may backdate; nobody may post-date", () => {
    expect(resolveEntryDate(staff, null, today)).toEqual({ date: today, isBackdated: false });
    expect(resolveEntryDate(staff, today, today)).toEqual({ date: today, isBackdated: false });
    expect(() => resolveEntryDate(staff, "2026-11-01", today)).toThrow("orders.backdateForbidden");
    expect(resolveEntryDate(admin, "2026-11-01", today)).toEqual({ date: "2026-11-01", isBackdated: true });
    expect(() => resolveEntryDate(admin, "2026-11-07", today)).toThrow("orders.futureDate");
    expect(() => resolveEntryDate(admin, "2026-02-30", today)).toThrow("orders.dateInvalid");
  });

  it("even an admin can't backdate past the typo guard (e.g. 2006 for 2026)", () => {
    expect(resolveEntryDate(admin, "2024-11-10", today)).toEqual({ date: "2024-11-10", isBackdated: true });
    expect(() => resolveEntryDate(admin, "2006-11-06", today)).toThrow("orders.backdateTooOld");
  });
});

describe("createOrder + issue", () => {
  it("numbers the order, issues items with a rate snapshot, and moves stock", async () => {
    const o = await order(staff, [
      { productId: props.id, quantity: 4 },
      { productId: gen.id, unitIds: [genUnits[0].id] },
    ]);
    expect(o.orderNo).toMatch(/^ORD\/\d{4}-\d{2}\/0001$/);
    const lines = await db.issueLine.findMany({ where: { orderId: o.id }, orderBy: { id: "asc" } });
    expect(lines.map((l) => [l.productId, l.unitId, l.quantity, l.dailyRate.toFixed(2)])).toEqual([
      [props.id, null, 4, "8.00"],
      [gen.id, genUnits[0].id, 1, "1500.00"],
    ]);
    expect(await stock(props.id)).toEqual({ owned: 10, out: 4, repair: 0 });
    expect(await stock(gen.id)).toEqual({ owned: 2, out: 1, repair: 0 });
    expect((await db.productUnit.findUniqueOrThrow({ where: { id: genUnits[0].id } })).status).toBe("RENTED");
    expect((await reconcile()).every((r) => r.ok)).toBe(true);
    expect(await db.auditLog.count({ where: { action: { in: ["ORDER_CREATE", "ISSUE_CREATE"] } } })).toBe(2);
  });

  it("a later rate change does not touch items already out", async () => {
    const o = await order(staff, [{ productId: props.id, quantity: 2 }]);
    await updateProduct(admin, props.id, productSchema.parse({ categoryId: "1", name: "Prop", tracking: "QUANTITY", dailyRate: "12" }));
    await issueItems(staff, { orderId: o.id, date: null, notes: null, lines: [{ productId: props.id, quantity: 1 }] });
    const rates = (await db.issueLine.findMany({ where: { orderId: o.id }, orderBy: { id: "asc" } })).map((l) => l.dailyRate.toFixed(2));
    expect(rates).toEqual(["8.00", "12.00"]);
  });

  it("merges repeated products in one issue", async () => {
    const o = await order(staff, [
      { productId: props.id, quantity: 2 },
      { productId: props.id, quantity: 3 },
    ]);
    const lines = await db.issueLine.findMany({ where: { orderId: o.id } });
    expect(lines.map((l) => l.quantity)).toEqual([5]);
  });

  it("refuses more than is available, and leaves nothing behind", async () => {
    expect(await code(order(staff, [{ productId: props.id, quantity: 11 }]))).toBe("orders.notEnoughStock");
    expect(await db.rentalOrder.count()).toBe(0); // the whole transaction rolled back, including the order number
    const o = await order(staff, [{ productId: props.id, quantity: 1 }]);
    expect(o.orderNo).toMatch(/\/0001$/);
  });

  it("refuses units that are not available, and wrong input shapes", async () => {
    await order(staff, [{ productId: gen.id, unitIds: [genUnits[0].id] }]);
    expect(await code(order(staff, [{ productId: gen.id, unitIds: [genUnits[0].id] }]))).toBe("orders.unitNotAvailable");
    expect(await code(order(staff, [{ productId: gen.id, quantity: 1 }]))).toBe("orders.unitsRequired");
    expect(await code(order(staff, [{ productId: props.id, unitIds: [genUnits[1].id] }]))).toBe("orders.quantityRequired");
    expect(await code(order(staff, [{ productId: gen.id, unitIds: [999] }]))).toBe("stock.unitNotFound");
  });

  it("refuses inactive customers and products", async () => {
    await setProductActive(admin, props.id, false, null);
    expect(await code(order(staff, [{ productId: props.id, quantity: 1 }]))).toBe("orders.productInactive");
    await setCustomerActive(staff, customerId, false, null);
    expect(await code(order(staff, []))).toBe("orders.customerInactive");
  });

  it("two people issuing the last unit at the same moment: exactly one wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => code(order(staff, [{ productId: gen.id, unitIds: [genUnits[1].id] }]))),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "orders.unitNotAvailable")).toHaveLength(3);
    expect(await db.issueLine.count({ where: { unitId: genUnits[1].id } })).toBe(1);
  });

  it("concurrent quantity issues never oversell", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => code(order(staff, [{ productId: props.id, quantity: 3 }]))));
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    expect(await stock(props.id)).toEqual({ owned: 10, out: 9, repair: 0 });
    expect((await reconcile()).every((r) => r.ok)).toBe(true);
  });

  it("the database itself refuses a unit on two active lines", async () => {
    const o = await order(staff, [{ productId: gen.id, unitIds: [genUnits[0].id] }]);
    const issue = await db.issue.findFirstOrThrow({ where: { orderId: o.id } });
    await expect(
      db.issueLine.create({ data: { issueId: issue.id, orderId: o.id, productId: gen.id, unitId: genUnits[0].id, quantity: 1, dailyRate: "1500" } }),
    ).rejects.toThrow();
  });
});

describe("backdating", () => {
  it("admin can open a backdated order (go-live); it is audited", async () => {
    const o = await order(admin, [{ productId: props.id, quantity: 1 }], "2026-10-01");
    expect(o.openedOn.toISOString().slice(0, 10)).toBe("2026-10-01");
    const issue = await db.issue.findFirstOrThrow({ where: { orderId: o.id } });
    expect(issue.isBackdated).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "BACKDATE" } });
    expect(audit.summary).toMatchObject({ date: "2026-10-01", enteredOn: businessToday() });
  });

  it("staff can't backdate, and nobody can issue before the order was opened", async () => {
    const o = await order(admin, [], "2026-10-10");
    expect(await code(issueItems(staff, { orderId: o.id, date: "2026-10-12", notes: null, lines: [{ productId: props.id, quantity: 1 }] }))).toBe(
      "orders.backdateForbidden",
    );
    expect(await code(issueItems(admin, { orderId: o.id, date: "2026-10-09", notes: null, lines: [{ productId: props.id, quantity: 1 }] }))).toBe(
      "orders.issueBeforeOpen",
    );
    await issueItems(admin, { orderId: o.id, date: "2026-10-12", notes: null, lines: [{ productId: props.id, quantity: 1 }] });
  });
});

describe("void and cancel", () => {
  it("voiding a line puts the stock back and keeps the line (never deleted)", async () => {
    const o = await order(staff, [
      { productId: props.id, quantity: 4 },
      { productId: gen.id, unitIds: [genUnits[0].id] },
    ]);
    const [propLine, genLine] = await db.issueLine.findMany({ where: { orderId: o.id }, orderBy: { id: "asc" } });
    await voidIssueLine(admin, { lineId: propLine.id, reason: "Wrong quantity" });
    await voidIssueLine(admin, { lineId: genLine.id, reason: "Wrong unit" });
    expect(await stock(props.id)).toEqual({ owned: 10, out: 0, repair: 0 });
    expect((await db.productUnit.findUniqueOrThrow({ where: { id: genUnits[0].id } })).status).toBe("AVAILABLE");
    expect(await db.issueLine.count({ where: { orderId: o.id, status: "VOIDED" } })).toBe(2);
    expect(await code(voidIssueLine(admin, { lineId: propLine.id, reason: "again" }))).toBe("orders.lineAlreadyVoided");
    expect((await reconcile()).every((r) => r.ok)).toBe(true);
    // The freed unit can be issued again.
    await order(staff, [{ productId: gen.id, unitIds: [genUnits[0].id] }]);
  });

  it("a line with returns can't be voided (DB backstop)", async () => {
    const o = await order(staff, [{ productId: props.id, quantity: 4 }]);
    const line = await db.issueLine.findFirstOrThrow({ where: { orderId: o.id } });
    await db.issueLine.update({ where: { id: line.id }, data: { qtyReturned: 1 } }); // simulates Step 5
    expect(await code(voidIssueLine(admin, { lineId: line.id, reason: "x" }))).toBe("orders.lineHasReturns");
  });

  it("an order can be cancelled only once all its lines are voided", async () => {
    const o = await order(staff, [{ productId: props.id, quantity: 2 }]);
    expect(await code(cancelOrder(admin, { orderId: o.id, reason: "Entered twice" }))).toBe("orders.hasActiveLines");
    const line = await db.issueLine.findFirstOrThrow({ where: { orderId: o.id } });
    await voidIssueLine(admin, { lineId: line.id, reason: "Entered twice" });
    await cancelOrder(admin, { orderId: o.id, reason: "Entered twice" });
    const after = await db.rentalOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelReason).toBe("Entered twice");
    expect(await code(issueItems(staff, { orderId: o.id, date: null, notes: null, lines: [{ productId: props.id, quantity: 1 }] }))).toBe("orders.notOpen");
  });
});

describe("customer guard", () => {
  it("a customer with an open order can't be deactivated", async () => {
    const o = await order(staff, []);
    expect(await code(setCustomerActive(staff, customerId, false, null))).toBe("customers.hasOpenOrders");
    await cancelOrder(admin, { orderId: o.id, reason: "No longer needed" });
    await setCustomerActive(staff, customerId, false, null);
  });
});

describe("order search", () => {
  it("a short number matches the running number only; names and phones match too", async () => {
    const { buildOrderWhere } = await import("./queries");
    const o1 = await order(staff, []);
    const o2 = await order(staff, []);
    const find = async (q: string) =>
      (await db.rentalOrder.findMany({ where: buildOrderWhere(q, "ALL"), orderBy: { id: "asc" } })).map((o) => o.id);
    expect(await find("2")).toEqual([o2.id]); // not every order (they all contain "2026")
    expect(await find("0001")).toEqual([o1.id]);
    expect(await find(o2.orderNo)).toEqual([o2.id]);
    expect(await find("ravi")).toEqual([o1.id, o2.id]);
    expect(await find("98470 12345")).toEqual([o1.id, o2.id]);
  });
});

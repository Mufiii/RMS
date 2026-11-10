import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { businessToday, fiscalYear } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer, updateCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { newProductSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct } from "@/modules/products/service";
import { cancelOrder, createOrder, voidIssueLine, type Actor } from "@/modules/orders/service";
import { getOrder } from "@/modules/orders/queries";
import { returnEntrySchema } from "@/modules/returns/schema";
import { recordReturn, voidReturn } from "@/modules/returns/service";
import { buildStatement } from "./statement";
import { cancelInvoice, createInvoice } from "./service";

let admin: Actor;
let staff: Actor;
let customerId: number;
let props: { id: number };
let gen: { id: number };
let orderId: number;
let propLine: number;
let genLines: number[];

const FY = fiscalYear(businessToday());
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const ret = (date: string, entries: Record<string, unknown>[]) =>
  recordReturn(admin, { orderId, date, notes: null, entries: entries.map((e) => returnEntrySchema.parse(e)) });
const invoice = (actor: Actor, discount: string | null = null, discountReason: string | null = null, id = orderId) =>
  createInvoice(actor, { orderId: id, discount, discountReason });
const orderStatus = async (id = orderId) => (await db.rentalOrder.findUniqueOrThrow({ where: { id } })).status;
const actions = async () => (await db.auditLog.findMany({ where: { entity: "order", entityId: String(orderId) }, orderBy: { id: "asc" } })).map((a) => a.action);

/** Everything back: props 4 good on 3 Nov, 5 good + 1 lost on 5 Nov; G1 good, G2 damaged on 4 Nov. */
async function returnEverything() {
  await ret("2026-11-03", [{ issueLineId: propLine, good: 4 }]);
  await ret("2026-11-04", [
    { issueLineId: genLines[0], good: 1 },
    { issueLineId: genLines[1], damaged: 1, damagedAmount: "2500", damagedNote: "Starter broken" },
  ]);
  await ret("2026-11-05", [{ issueLineId: propLine, good: 5, lost: 1, lostAmount: "900", lostNote: "Missing at site" }]);
}

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
  staff = { id: (await makeUser({ role: "STAFF" })).id, role: "STAFF" };
  customerId = (await createCustomer(staff, customerSchema.parse({ name: "Ravi", phone: "9847012345", address: "Thrissur" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 50 }));
  gen = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Generator", tracking: "SERIALISED", dailyRate: "1500", serials: "G1\nG2" }));
  const units = await db.productUnit.findMany({ where: { productId: gen.id }, orderBy: { id: "asc" } });
  const o = await createOrder(admin, {
    customerId,
    siteAddress: "Site A",
    notes: null,
    date: "2026-11-01",
    lines: [
      { productId: props.id, quantity: 10 },
      { productId: gen.id, unitIds: units.map((u) => u.id) },
    ],
  });
  orderId = o.id;
  const lines = await db.issueLine.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  propLine = lines[0].id;
  genLines = [lines[1].id, lines[2].id];
});

describe("createInvoice", () => {
  it("staff generate the final invoice: one snapshot line per returned batch, exact totals, order closed", async () => {
    await returnEverything();
    const inv = await invoice(staff);
    expect(inv.invoiceNo).toBe(`INV/${FY}/0001`);
    const full = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    expect(full.lines.map((l) => [l.productName, l.serialNo, l.quantity, l.days, l.condition, l.rentAmount.toFixed(2), l.damageAmount.toFixed(2)])).toEqual([
      ["Generator", "G1", 1, 4, "GOOD", "6000.00", "0.00"], // 1 × 1500 × 4
      ["Generator", "G2", 1, 4, "DAMAGED", "6000.00", "2500.00"],
      ["Prop", null, 4, 3, "GOOD", "96.00", "0.00"], // 4 × 8 × 3
      ["Prop", null, 5, 5, "GOOD", "200.00", "0.00"], // 5 × 8 × 5
      ["Prop", null, 1, 5, "LOST", "40.00", "900.00"], // lost pieces are charged rent up to the day reported
    ]);
    expect([full.rentTotal, full.damageTotal, full.discountAmount, full.total].map((d) => d.toFixed(2))).toEqual(["12336.00", "3400.00", "0.00", "15736.00"]);
    expect([full.customerName, full.customerPhone, full.customerAddress, full.siteAddress, full.orderNo]).toEqual(["Ravi", "9847012345", "Thrissur", "Site A", "ORD-0001"]);
    expect(await orderStatus()).toBe("CLOSED");
    expect(await actions()).toContain("INVOICE_CREATE");
  });

  it("the invoice equals the running statement once everything is back", async () => {
    await returnEverything();
    const s = buildStatement((await getOrder(orderId))!, businessToday());
    const inv = await invoice(staff);
    expect(Number(inv.total.toFixed(2)) * 100).toBe(s.total);
  });

  it("is refused while pieces are still out, or with nothing to bill", async () => {
    await ret("2026-11-03", [{ issueLineId: propLine, good: 4 }]);
    expect(await code(invoice(staff))).toBe("invoices.itemsStillOut");
    // An order whose lines were all voided has nothing to bill (it is cancelled instead).
    const o2 = await createOrder(admin, { customerId, siteAddress: null, notes: null, date: null, lines: [{ productId: props.id, quantity: 1 }] });
    const l2 = await db.issueLine.findFirstOrThrow({ where: { orderId: o2.id } });
    await voidIssueLine(admin, { lineId: l2.id, reason: "Wrong entry" });
    expect(await code(invoice(staff, null, null, o2.id))).toBe("invoices.nothingToBill");
    await cancelOrder(admin, { orderId: o2.id, reason: "Entered by mistake" });
    expect(await code(invoice(staff, null, null, o2.id))).toBe("orders.notOpen");
    expect(await db.invoice.count()).toBe(0);
  });

  it("only one live invoice per order", async () => {
    await returnEverything();
    await invoice(staff);
    expect(await code(invoice(staff))).toBe("orders.notOpen");
    // DB backstop: a second ISSUED invoice for the order is rejected by the partial unique index.
    const first = await db.invoice.findFirstOrThrow();
    const { id: _id, createdAt: _c, ...copy } = first;
    await expect(db.invoice.create({ data: { ...copy, invoiceNo: "X/1" } })).rejects.toThrow();
  });

  it("concurrent clicks produce exactly one invoice and no gap in numbering", async () => {
    await returnEverything();
    const results = await Promise.all(Array.from({ length: 4 }, () => code(invoice(staff))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect((await db.invoice.findMany()).map((i) => i.invoiceNo)).toEqual([`INV/${FY}/0001`]);
    const seq = await db.numberSequence.findUniqueOrThrow({ where: { docType_fiscalYear: { docType: "INVOICE", fiscalYear: FY } } });
    expect(seq.nextValue).toBe(2);
  });

  it("uses the invoice prefix from Settings", async () => {
    await db.settings.update({ where: { id: 1 }, data: { invoicePrefix: "SKM" } });
    await returnEverything();
    expect((await invoice(staff)).invoiceNo).toBe(`SKM/${FY}/0001`);
  });
});

describe("discounts", () => {
  beforeEach(returnEverything);

  it("staff can't give one", async () => {
    expect(await code(invoice(staff, "100", "Regular customer"))).toBe("invoices.discountForbidden");
    expect(await orderStatus()).toBe("OPEN");
  });

  it("admins give a fixed amount with a mandatory reason, audited", async () => {
    expect(await code(invoice(admin, "736"))).toBe("invoices.discountReasonRequired");
    const inv = await invoice(admin, "736", "Regular customer");
    expect([inv.discountAmount.toFixed(2), inv.total.toFixed(2), inv.discountReason]).toEqual(["736.00", "15000.00", "Regular customer"]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "INVOICE_DISCOUNT" } });
    expect(audit.reason).toBe("Regular customer");
    expect(audit.summary).toMatchObject({ discount: "736.00", before: "15736.00", after: "15000.00" });
  });

  it("can waive the whole amount but never more", async () => {
    expect(await code(invoice(admin, "15736.01", "Too much"))).toBe("invoices.discountTooLarge");
    expect((await invoice(admin, "15736", "Waived")).total.toFixed(2)).toBe("0.00");
  });

  it("a zero discount needs no reason", async () => {
    expect((await invoice(staff, "0")).discountAmount.toFixed(2)).toBe("0.00");
  });
});

describe("snapshot", () => {
  beforeEach(returnEverything);

  it("later changes to the customer, product or rates never change an issued invoice", async () => {
    const inv = await invoice(staff);
    await updateCustomer(staff, customerId, customerSchema.parse({ name: "Ravi K", phone: "9847099999" }));
    await db.product.update({ where: { id: props.id }, data: { name: "Steel prop", dailyRate: "20" } });
    const again = await db.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
    expect(again.customerName).toBe("Ravi");
    expect(again.lines.filter((l) => l.productName === "Prop")).toHaveLength(3);
    expect(again.total.toFixed(2)).toBe("15736.00");
  });

  it("the database refuses edits: lines are immutable, an invoice can only be cancelled", async () => {
    const inv = await invoice(staff);
    const line = await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: inv.id } });
    await expect(db.invoiceLine.update({ where: { id: line.id }, data: { quantity: 99 } })).rejects.toThrow();
    await expect(db.invoiceLine.delete({ where: { id: line.id } })).rejects.toThrow();
    await expect(db.invoice.update({ where: { id: inv.id }, data: { total: "1.00" } })).rejects.toThrow();
    await expect(db.invoice.delete({ where: { id: inv.id } })).rejects.toThrow();
  });

  it("the database checks the invoice arithmetic", async () => {
    const inv = await db.invoice.findFirst();
    expect(inv).toBeNull();
    const base = {
      invoiceNo: "T/1",
      orderId,
      invoiceDate: new Date("2026-11-07T00:00:00Z"),
      orderNo: "x",
      customerName: "x",
      customerPhone: "x",
      rentTotal: "100.00",
      damageTotal: "50.00",
      createdById: admin.id,
    };
    await expect(db.invoice.create({ data: { ...base, total: "140.00" } })).rejects.toThrow(); // ≠ 100 + 50 − 0
    await expect(db.invoice.create({ data: { ...base, discountAmount: "10", total: "140.00" } })).rejects.toThrow(); // no reason
    await expect(db.invoice.create({ data: { ...base, discountAmount: "151", discountReason: "x", total: "-1.00" } })).rejects.toThrow();
  });
});

describe("cancelInvoice (admin)", () => {
  beforeEach(returnEverything);

  it("keeps the cancelled invoice, re-opens the order and allows correcting a return", async () => {
    const inv = await invoice(staff);
    // While the invoice is live, returns can't be voided.
    const r = await db.return.findFirstOrThrow({ where: { orderId }, orderBy: { id: "desc" } });
    expect(await code(voidReturn(admin, { returnId: r.id, reason: "Wrong count" }))).toBe("returns.hasInvoice");

    const res = await cancelInvoice(admin, { invoiceId: inv.id, reason: "Lost prop was found" });
    expect(res).toEqual({ orderId, reissued: null });
    const old = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect([old.status, old.cancelReason, old.cancelledById]).toEqual(["CANCELLED", "Lost prop was found", admin.id]);
    expect(await orderStatus()).toBe("OPEN");

    await voidReturn(admin, { returnId: r.id, reason: "Lost prop was found" });
    await ret("2026-11-05", [{ issueLineId: propLine, good: 6 }]);
    const fresh = await invoice(staff);
    expect(fresh.invoiceNo).toBe(`INV/${FY}/0002`); // a new number; the cancelled one keeps 0001
    expect(fresh.total.toFixed(2)).toBe("14836.00"); // 15736 − ₹900 loss charge
    expect(await actions()).toEqual(expect.arrayContaining(["INVOICE_CREATE", "INVOICE_CANCEL", "RETURN_VOID"]));
  });

  it("cancel and reissue with a discount in one step", async () => {
    const inv = await invoice(staff);
    const { reissued } = await cancelInvoice(admin, { invoiceId: inv.id, reason: "Add discount", reissue: { amount: "236", reason: "Long-time customer" } });
    expect([reissued!.invoiceNo, reissued!.total.toFixed(2), reissued!.discountAmount.toFixed(2)]).toEqual([`INV/${FY}/0002`, "15500.00", "236.00"]);
    expect(await orderStatus()).toBe("CLOSED");
    expect(await db.invoice.count({ where: { orderId, status: "ISSUED" } })).toBe(1);
  });

  it("a failed reissue rolls back the cancel too", async () => {
    const inv = await invoice(staff);
    expect(await code(cancelInvoice(admin, { invoiceId: inv.id, reason: "Add discount", reissue: { amount: "99999", reason: "x" } }))).toBe("invoices.discountTooLarge");
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("ISSUED");
    expect(await orderStatus()).toBe("CLOSED");
  });

  it("can't cancel twice", async () => {
    const inv = await invoice(staff);
    await cancelInvoice(admin, { invoiceId: inv.id, reason: "Mistake" });
    expect(await code(cancelInvoice(admin, { invoiceId: inv.id, reason: "Again" }))).toBe("invoices.alreadyCancelled");
    expect(await code(cancelInvoice(admin, { invoiceId: 9999, reason: "Nope" }))).toBe("invoices.notFound");
  });
});

describe("buildStatement (running statement)", () => {
  it("returned batches at their recorded rent, plus rent accrued to today on what is still out", async () => {
    await ret("2026-11-03", [{ issueLineId: propLine, good: 4 }]);
    await ret("2026-11-04", [{ issueLineId: genLines[1], damaged: 1, damagedAmount: "2500", damagedNote: "Starter broken" }]);
    const s = buildStatement((await getOrder(orderId))!, "2026-11-07");
    expect(s.returned.map((r) => [r.product.name, r.quantity, r.days, r.rent, r.damage])).toEqual([
      ["Prop", 4, 3, 9600, 0],
      ["Generator", 1, 4, 600000, 250000],
    ]);
    expect(s.out.map((o) => [o.product.name, o.serialNo, o.qtyOutstanding, o.daysSoFar, o.accrued])).toEqual([
      ["Prop", null, 6, 7, 6 * 800 * 7],
      ["Generator", "G1", 1, 7, 150000 * 7],
    ]);
    expect(s.total).toBe(9600 + 600000 + 250000 + 33600 + 1050000);
  });

  it("ignores voided returns and voided lines", async () => {
    const r = await ret("2026-11-03", [{ issueLineId: propLine, good: 4 }]);
    await voidReturn(admin, { returnId: r.id, reason: "Wrong" });
    const s = buildStatement((await getOrder(orderId))!, "2026-11-01");
    expect(s.returned).toEqual([]);
    expect(s.total).toBe(10 * 800 + 2 * 150000); // one day, everything still out
  });
});

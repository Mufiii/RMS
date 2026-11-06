import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { adjustQuantity, reconcile, unitAction } from "@/modules/inventory/service";
import { newProductSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct } from "@/modules/products/service";
import { createOrder, voidIssueLine, type Actor } from "@/modules/orders/service";
import { returnEntrySchema } from "./schema";
import { recordReturn, voidReturn } from "./service";

let admin: Actor;
let staff: Actor;
let props: { id: number };
let gen: { id: number };
let units: { id: number; serialNo: string }[];
let orderId: number;
let propLine: number;
let genLine: number;

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const entry = (o: Record<string, unknown>) => returnEntrySchema.parse(o);
const stock = async (id: number) => {
  const p = await db.product.findUniqueOrThrow({ where: { id } });
  return { owned: p.qtyOwned, out: p.qtyOut, repair: p.qtyRepair };
};
const unitStatus = async (id: number) => (await db.productUnit.findUniqueOrThrow({ where: { id } })).status;
const allAgree = async () => expect((await reconcile()).filter((r) => !r.ok)).toEqual([]);
const ret = (actor: Actor, date: string | null, entries: Record<string, unknown>[]) =>
  recordReturn(actor, { orderId, date, notes: null, entries: entries.map(entry) });

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
  staff = { id: (await makeUser({ role: "STAFF" })).id, role: "STAFF" };
  const customerId = (await createCustomer(staff, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
  const cat = await createCategory(admin, { name: "Equipment", nameMl: null });
  props = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Prop", tracking: "QUANTITY", dailyRate: "8", openingQty: 50 }));
  gen = await createProduct(admin, newProductSchema.parse({ categoryId: cat.id, name: "Generator", tracking: "SERIALISED", dailyRate: "1500", serials: "G1\nG2\nG3" }));
  units = await db.productUnit.findMany({ where: { productId: gen.id }, orderBy: { id: "asc" } });
  // Go-live style: issued on 1 Nov 2026 (backdated by the admin).
  const o = await createOrder(admin, {
    customerId,
    siteAddress: null,
    notes: null,
    date: "2026-11-01",
    lines: [
      { productId: props.id, quantity: 10 },
      { productId: gen.id, unitIds: [units[0].id, units[1].id, units[2].id] },
    ],
  });
  orderId = o.id;
  const lines = await db.issueLine.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  propLine = lines[0].id;
  genLine = lines[1].id;
});

describe("recordReturn", () => {
  it("partial returns over several visits are each charged for their own days", async () => {
    await ret(admin, "2026-11-03", [{ issueLineId: propLine, good: 4 }]); // 3 days
    await ret(admin, "2026-11-05", [{ issueLineId: propLine, good: 6 }]); // 5 days
    const rls = await db.returnLine.findMany({ where: { issueLineId: propLine }, orderBy: { id: "asc" } });
    expect(rls.map((r) => [r.quantity, r.days, r.rentAmount.toFixed(2)])).toEqual([
      [4, 3, "96.00"], // 4 × ₹8 × 3
      [6, 5, "240.00"], // 6 × ₹8 × 5
    ]);
    expect((await db.issueLine.findUniqueOrThrow({ where: { id: propLine } })).qtyReturned).toBe(10);
    expect(await stock(props.id)).toEqual({ owned: 50, out: 0, repair: 0 });
    await allAgree();
  });

  it("one batch can come back in mixed condition: good, damaged (to repair), lost (written off)", async () => {
    await ret(admin, "2026-11-04", [
      { issueLineId: propLine, good: 7, damaged: 2, damagedAmount: "150", damagedNote: "Bent", lost: 1, lostAmount: "900", lostNote: "Not returned" },
    ]);
    expect(await stock(props.id)).toEqual({ owned: 49, out: 0, repair: 2 });
    const rls = await db.returnLine.findMany({ where: { issueLineId: propLine }, orderBy: { id: "asc" } });
    expect(rls.map((r) => [r.condition, r.quantity, r.rentAmount.toFixed(2), r.damageAmount.toFixed(2), r.damageNote])).toEqual([
      ["GOOD", 7, "224.00", "0.00", null],
      ["DAMAGED", 2, "64.00", "150.00", "Bent"],
      ["LOST", 1, "32.00", "900.00", "Not returned"],
    ]);
    const moves = await db.stockMovement.findMany({ where: { productId: props.id, returnLineId: { not: null } }, orderBy: { id: "asc" } });
    expect(moves.map((m) => [m.type, m.deltaOwned, m.deltaRepair])).toEqual([
      ["RETURN_DAMAGED", 0, 2],
      ["RETURN_LOST", -1, 0],
    ]);
    await allAgree();
  });

  it("serialised units: good → available, damaged → under repair, lost → lost", async () => {
    // A unit issue line has quantity 1; three separate lines, one per unit.
    const lines = await db.issueLine.findMany({ where: { orderId, productId: gen.id }, orderBy: { id: "asc" } });
    await ret(staff, null, [
      { issueLineId: lines[0].id, good: 1 },
      { issueLineId: lines[1].id, damaged: 1, damagedNote: "Starter broken" },
      { issueLineId: lines[2].id, lost: 1, lostAmount: "45000", lostNote: "Stolen from site" },
    ]);
    expect([await unitStatus(units[0].id), await unitStatus(units[1].id), await unitStatus(units[2].id)]).toEqual(["AVAILABLE", "UNDER_REPAIR", "LOST"]);
    expect(await stock(gen.id)).toEqual({ owned: 2, out: 0, repair: 1 });
    await allAgree();
  });

  it("refuses returning more than is out, and checks the whole return atomically", async () => {
    expect(await code(ret(staff, null, [{ issueLineId: propLine, good: 11 }]))).toBe("returns.tooMany");
    await ret(staff, null, [{ issueLineId: propLine, good: 8 }]);
    // Second entry fails → the first must not be saved either.
    expect(await code(ret(staff, null, [{ issueLineId: genLine, good: 1 }, { issueLineId: propLine, good: 3 }]))).toBe("returns.tooMany");
    expect(await unitStatus(units[0].id)).toBe("RENTED");
    expect(await db.return.count()).toBe(1);
  });

  it("damaged and lost need a note; good can't carry a charge (DB backstop)", async () => {
    expect(await code(ret(staff, null, [{ issueLineId: propLine, damaged: 1 }]))).toBe("returns.noteRequired");
    expect(await code(ret(staff, null, [{ issueLineId: propLine, lost: 1, lostAmount: "10" }]))).toBe("returns.noteRequired");
    const r = await ret(staff, null, [{ issueLineId: propLine, good: 1 }]);
    const rl = await db.returnLine.findFirstOrThrow({ where: { returnId: r.id } });
    await expect(db.returnLine.update({ where: { id: rl.id }, data: { damageAmount: "5" } })).rejects.toThrow();
  });

  it("the database refuses wrong rent arithmetic and over-returns", async () => {
    const r = await ret(staff, null, [{ issueLineId: propLine, good: 1 }]);
    const rl = await db.returnLine.findFirstOrThrow({ where: { returnId: r.id } });
    await expect(db.returnLine.update({ where: { id: rl.id }, data: { rentAmount: "1.00" } })).rejects.toThrow();
    await expect(db.issueLine.update({ where: { id: propLine }, data: { qtyReturned: 11 } })).rejects.toThrow();
  });

  it("dates: never before the issue date, never in the future; staff can't backdate", async () => {
    expect(await code(ret(admin, "2026-10-31", [{ issueLineId: propLine, good: 1 }]))).toBe("returns.beforeIssue");
    expect(await code(ret(admin, "2099-01-01", [{ issueLineId: propLine, good: 1 }]))).toBe("orders.futureDate");
    expect(await code(ret(staff, "2026-11-02", [{ issueLineId: propLine, good: 1 }]))).toBe("orders.backdateForbidden");
    await ret(admin, "2026-11-01", [{ issueLineId: propLine, good: 1 }]); // same day = 1 day
    expect((await db.returnLine.findFirstOrThrow()).days).toBe(1);
    expect(await db.auditLog.count({ where: { action: "BACKDATE" } })).toBe(2); // the order + this return
  });

  it("voided lines and other orders' lines can't be returned", async () => {
    await voidIssueLine(admin, { lineId: propLine, reason: "Wrong" });
    expect(await code(ret(staff, null, [{ issueLineId: propLine, good: 1 }]))).toBe("returns.lineNotFound");
    expect(await code(ret(staff, null, [{ issueLineId: 99999, good: 1 }]))).toBe("returns.lineNotFound");
  });

  it("concurrent returns of the same pieces never over-return", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => code(ret(staff, null, [{ issueLineId: propLine, good: 4 }]))));
    expect(results.filter((r) => r === "ok")).toHaveLength(2);
    expect((await db.issueLine.findUniqueOrThrow({ where: { id: propLine } })).qtyReturned).toBe(8);
    await allAgree();
  });
});

describe("voidReturn", () => {
  it("reverses every stock effect with new ledger rows and puts the pieces back out", async () => {
    const lines = await db.issueLine.findMany({ where: { orderId, productId: gen.id }, orderBy: { id: "asc" } });
    const r = await ret(admin, "2026-11-04", [
      { issueLineId: propLine, good: 5, damaged: 2, damagedNote: "Bent", lost: 1, lostNote: "Gone" },
      { issueLineId: lines[1].id, damaged: 1, damagedNote: "Broken" },
    ]);
    await voidReturn(admin, { returnId: r.id, reason: "Entered on the wrong order" });
    expect(await stock(props.id)).toEqual({ owned: 50, out: 10, repair: 0 });
    expect(await stock(gen.id)).toEqual({ owned: 3, out: 3, repair: 0 });
    expect(await unitStatus(units[1].id)).toBe("RENTED");
    expect((await db.issueLine.findUniqueOrThrow({ where: { id: propLine } })).qtyReturned).toBe(0);
    const v = await db.return.findUniqueOrThrow({ where: { id: r.id } });
    expect([v.status, v.voidReason]).toEqual(["VOIDED", "Entered on the wrong order"]);
    expect(await db.returnLine.count({ where: { returnId: r.id } })).toBe(4); // kept, never deleted
    expect(await code(voidReturn(admin, { returnId: r.id, reason: "again" }))).toBe("returns.alreadyVoided");
    await allAgree();
    // And the pieces can be returned again properly.
    await ret(staff, null, [{ issueLineId: propLine, good: 10 }]);
    await allAgree();
  });

  it("refuses when the returned pieces have moved on since (re-issued or repaired)", async () => {
    const lines = await db.issueLine.findMany({ where: { orderId, productId: gen.id }, orderBy: { id: "asc" } });
    const r1 = await ret(staff, null, [{ issueLineId: lines[0].id, good: 1 }]);
    // G1 goes out again to someone else.
    const other = await createCustomer(staff, customerSchema.parse({ name: "Suresh", phone: "9123456789" }));
    await createOrder(staff, { customerId: other.id, siteAddress: null, notes: null, date: null, lines: [{ productId: gen.id, unitIds: [units[0].id] }] });
    expect(await code(voidReturn(admin, { returnId: r1.id, reason: "x" }))).toBe("returns.cannotVoidMoved");

    const r2 = await ret(staff, null, [{ issueLineId: lines[1].id, damaged: 1, damagedNote: "Broken" }]);
    await unitAction(admin, { unitId: units[1].id, action: "REPAIR_DONE" });
    expect(await code(voidReturn(admin, { returnId: r2.id, reason: "x" }))).toBe("returns.cannotVoidMoved");

    const r3 = await ret(staff, null, [{ issueLineId: propLine, good: 10 }]);
    await adjustQuantity(admin, { productId: props.id, type: "WRITE_OFF", quantity: 45, reason: "Sold off" });
    expect(await code(voidReturn(admin, { returnId: r3.id, reason: "x" }))).toBe("returns.cannotVoidMoved");
    await allAgree();
  });

  it("an issue line with returns can't be voided, but can after its returns are voided", async () => {
    const r = await ret(staff, null, [{ issueLineId: propLine, good: 2 }]);
    expect(await code(voidIssueLine(admin, { lineId: propLine, reason: "x" }))).toBe("orders.lineHasReturns");
    await voidReturn(admin, { returnId: r.id, reason: "Wrong" });
    await voidIssueLine(admin, { lineId: propLine, reason: "Wrong" });
    await allAgree();
  });
});

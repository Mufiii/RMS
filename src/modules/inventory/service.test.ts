import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../../../tests/db";
import { createCategory, createProduct, setCategoryActive, setProductActive, updateProduct } from "@/modules/products/service";
import { newProductSchema, productSchema } from "./schema";
import { addUnits, adjustQuantity, reconcile, unitAction } from "./service";

let admin: { id: number };
let categoryId: number;
beforeEach(async () => {
  await resetDb();
  admin = await makeUser({ role: "ADMIN" });
  categoryId = (await createCategory(admin, { name: "Scaffolding", nameMl: null })).id;
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

const props = (over: Record<string, unknown> = {}) =>
  createProduct(
    admin,
    newProductSchema.parse({ categoryId: String(categoryId), name: "Prop 3m", code: "prop-3m", tracking: "QUANTITY", dailyRate: "8", openingQty: "100", ...over }),
  );
const generator = (serials = "GEN-001\nGEN-002\nGEN-003") =>
  createProduct(
    admin,
    newProductSchema.parse({ categoryId: String(categoryId), name: "Generator 5 kVA", tracking: "SERIALISED", dailyRate: "1500", serials }),
  );
const counters = async (id: number) => {
  const p = await db.product.findUniqueOrThrow({ where: { id } });
  return { owned: p.qtyOwned, out: p.qtyOut, repair: p.qtyRepair };
};

describe("createProduct", () => {
  it("creates a quantity product with opening stock in the ledger", async () => {
    const p = await props();
    expect(p.code).toBe("PROP-3M");
    expect(await counters(p.id)).toEqual({ owned: 100, out: 0, repair: 0 });
    const m = await db.stockMovement.findMany({ where: { productId: p.id } });
    expect(m.map((x) => [x.type, x.deltaOwned])).toEqual([["OPENING", 100]]);
    expect(await db.auditLog.count({ where: { action: "PRODUCT_CREATE" } })).toBe(1);
  });

  it("creates a serialised product with one unit per serial", async () => {
    const g = await generator();
    expect(await counters(g.id)).toEqual({ owned: 3, out: 0, repair: 0 });
    const units = await db.productUnit.findMany({ where: { productId: g.id }, orderBy: { id: "asc" } });
    expect(units.map((u) => [u.serialNo, u.status])).toEqual([
      ["GEN-001", "AVAILABLE"],
      ["GEN-002", "AVAILABLE"],
      ["GEN-003", "AVAILABLE"],
    ]);
  });

  it("refuses duplicate codes, duplicate serials and inactive categories", async () => {
    await props();
    expect(await code(props({ name: "Another" }))).toBe("products.codeTaken");
    expect(await code(generator("A1\na1"))).toBe("stock.serialDuplicate");
    await setCategoryActive(admin, categoryId, false);
    expect(await code(props({ code: "" }))).toBe("categories.inactive");
  });

  it("validates rates and quantities", () => {
    const parse = (o: Record<string, string>) =>
      newProductSchema.safeParse({ categoryId: "1", name: "X", tracking: "QUANTITY", dailyRate: "8", ...o }).error?.issues.map((i) => i.message);
    expect(parse({ dailyRate: "0" })).toContain("validation.rateInvalid");
    expect(parse({ dailyRate: "8.555" })).toContain("validation.rateInvalid");
    expect(parse({ dailyRate: "abc" })).toContain("validation.rateInvalid");
    expect(parse({ openingQty: "-1" })).toContain("validation.qtyInvalid");
    expect(parse({ code: "has space" })).toContain("validation.codeInvalid");
    expect(parse({ tracking: "SERIALISED", openingQty: "5" })).toContain("validation.qtyInvalid");
  });
});

describe("updateProduct", () => {
  const edit = (id: number, over: Record<string, unknown> = {}) =>
    updateProduct(admin, id, productSchema.parse({ categoryId: String(categoryId), name: "Prop 3m", code: "PROP-3M", tracking: "QUANTITY", dailyRate: "8", ...over }));

  it("audits a rate change old → new, separately from other edits", async () => {
    const p = await props();
    await edit(p.id, { dailyRate: "10.50", name: "Prop 3 m" });
    const rate = await db.auditLog.findFirstOrThrow({ where: { action: "RATE_CHANGE" } });
    expect(rate.summary).toEqual({ before: "8.00", after: "10.50" });
    const upd = await db.auditLog.findFirstOrThrow({ where: { action: "PRODUCT_UPDATE" } });
    expect(upd.summary).toEqual({ before: { name: "Prop 3m" }, after: { name: "Prop 3 m" } });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).dailyRate.toString()).toBe("10.5");
  });

  it("writes nothing when nothing changed", async () => {
    const p = await props();
    await edit(p.id, { dailyRate: "8.00", code: "prop-3m" });
    expect(await db.auditLog.count({ where: { action: { in: ["RATE_CHANGE", "PRODUCT_UPDATE"] } } })).toBe(0);
  });

  it("tracking type is locked once there is stock history", async () => {
    const empty = await props({ openingQty: "0", code: "" });
    await expect(edit(empty.id, { tracking: "SERIALISED", code: "" })).resolves.toBeTruthy();
    const stocked = await props();
    expect(await code(edit(stocked.id, { tracking: "SERIALISED" }))).toBe("products.trackingLocked");
  });
});

describe("adjustQuantity", () => {
  it("records each movement in the ledger and the audit log", async () => {
    const p = await props();
    await adjustQuantity(admin, { productId: p.id, type: "PURCHASE", quantity: 20 });
    await adjustQuantity(admin, { productId: p.id, type: "SENT_TO_REPAIR", quantity: 10 });
    await adjustQuantity(admin, { productId: p.id, type: "REPAIR_SCRAPPED", quantity: 3, reason: "Bent beyond repair" });
    await adjustQuantity(admin, { productId: p.id, type: "REPAIR_DONE", quantity: 7 });
    await adjustQuantity(admin, { productId: p.id, type: "WRITE_OFF", quantity: 7, reason: "Rusted" });
    await adjustQuantity(admin, { productId: p.id, type: "CORRECTION", quantity: 2, direction: "decrease", reason: "Recount" });
    expect(await counters(p.id)).toEqual({ owned: 108, out: 0, repair: 0 });
    expect(await db.auditLog.count({ where: { action: "STOCK_ADJUST" } })).toBe(6);
  });

  it("requires a reason for write-off, scrap and correction", async () => {
    const p = await props();
    expect(await code(adjustQuantity(admin, { productId: p.id, type: "WRITE_OFF", quantity: 1 }))).toBe("stock.reasonRequired");
    expect(await code(adjustQuantity(admin, { productId: p.id, type: "CORRECTION", quantity: 1, reason: "  " }))).toBe("stock.reasonRequired");
  });

  it("can't take out more than is available, and the DB backstops it", async () => {
    const p = await props();
    expect(await code(adjustQuantity(admin, { productId: p.id, type: "WRITE_OFF", quantity: 101, reason: "x" }))).toBe("stock.notEnoughAvailable");
    // Even a direct write that bypasses the service is refused by the CHECK constraint.
    await expect(db.product.update({ where: { id: p.id }, data: { qtyRepair: 101 } })).rejects.toThrow();
  });

  it("serialised products must be adjusted unit by unit", async () => {
    const g = await generator();
    expect(await code(adjustQuantity(admin, { productId: g.id, type: "PURCHASE", quantity: 1 }))).toBe("stock.useUnits");
  });

  it("concurrent write-offs never take stock below zero", async () => {
    const p = await props({ openingQty: "10" });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => code(adjustQuantity(admin, { productId: p.id, type: "WRITE_OFF", quantity: 3, reason: "race" }))),
    );
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
    expect(results.filter((r) => r === "stock.notEnoughAvailable")).toHaveLength(3);
    expect(await counters(p.id)).toEqual({ owned: 1, out: 0, repair: 0 });
  });

  it("the stock ledger is append-only", async () => {
    const p = await props();
    const m = await db.stockMovement.findFirstOrThrow({ where: { productId: p.id } });
    await expect(db.stockMovement.update({ where: { id: m.id }, data: { deltaOwned: 5 } })).rejects.toThrow();
    await expect(db.stockMovement.delete({ where: { id: m.id } })).rejects.toThrow();
  });
});

describe("serialised units", () => {
  it("adds units, refusing serials that already exist (case-insensitive)", async () => {
    const g = await generator();
    await addUnits(admin, { productId: g.id, type: "PURCHASE", serials: ["GEN-004"] });
    expect(await counters(g.id)).toEqual({ owned: 4, out: 0, repair: 0 });
    expect(await code(addUnits(admin, { productId: g.id, type: "PURCHASE", serials: ["gen-001"] }))).toBe("stock.serialExists");
  });

  it("moves units through repair and retirement, keeping counters in step", async () => {
    const g = await generator();
    const [u1, u2, u3] = await db.productUnit.findMany({ where: { productId: g.id }, orderBy: { id: "asc" } });
    await unitAction(admin, { unitId: u1.id, action: "SENT_TO_REPAIR" });
    await unitAction(admin, { unitId: u2.id, action: "SENT_TO_REPAIR" });
    expect(await counters(g.id)).toEqual({ owned: 3, out: 0, repair: 2 });
    await unitAction(admin, { unitId: u1.id, action: "REPAIR_DONE" });
    await unitAction(admin, { unitId: u2.id, action: "REPAIR_SCRAPPED", reason: "Engine seized" });
    await unitAction(admin, { unitId: u3.id, action: "WRITE_OFF", reason: "Stolen from yard" });
    expect(await counters(g.id)).toEqual({ owned: 1, out: 0, repair: 0 });
    const statuses = (await db.productUnit.findMany({ where: { productId: g.id }, orderBy: { id: "asc" } })).map((u) => u.status);
    expect(statuses).toEqual(["AVAILABLE", "RETIRED", "RETIRED"]);
  });

  it("refuses actions that don't fit the unit's status", async () => {
    const g = await generator();
    const u = await db.productUnit.findFirstOrThrow({ where: { productId: g.id } });
    expect(await code(unitAction(admin, { unitId: u.id, action: "REPAIR_DONE" }))).toBe("stock.unitWrongStatus");
    expect(await code(unitAction(admin, { unitId: u.id, action: "WRITE_OFF" }))).toBe("stock.reasonRequired");
  });
});

describe("products are never deleted", () => {
  it("can be deactivated and reactivated with audit rows", async () => {
    const p = await props();
    await setProductActive(admin, p.id, false, "Discontinued");
    await setProductActive(admin, p.id, true, null);
    expect((await db.auditLog.findMany({ where: { entity: "product", action: { contains: "ACTIVATE" } }, orderBy: { id: "asc" } })).map((a) => a.action)).toEqual([
      "PRODUCT_DEACTIVATE",
      "PRODUCT_REACTIVATE",
    ]);
    await expect(db.product.delete({ where: { id: p.id } })).rejects.toThrow(); // ledger rows reference it
  });
});

describe("reconcile", () => {
  it("agrees after normal use", async () => {
    const p = await props();
    const g = await generator();
    await adjustQuantity(admin, { productId: p.id, type: "SENT_TO_REPAIR", quantity: 4 });
    const u = await db.productUnit.findFirstOrThrow({ where: { productId: g.id } });
    await unitAction(admin, { unitId: u.id, action: "SENT_TO_REPAIR" });
    const rows = await reconcile();
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it("detects a counter changed behind the service's back", async () => {
    const p = await props();
    await db.product.update({ where: { id: p.id }, data: { qtyOwned: 99 } });
    const row = (await reconcile()).find((r) => r.productId === p.id)!;
    expect(row.ok).toBe(false);
    expect(row.stored.owned).toBe(99);
    expect(row.fromLedger.owned).toBe(100);
  });
});

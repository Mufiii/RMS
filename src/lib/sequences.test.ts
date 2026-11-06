import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../../tests/db";
import { db } from "./db";
import { nextDocumentNumber } from "./sequences";
import { withTx } from "./tx";

beforeEach(resetDb);

const take = (date = "2026-11-05", prefix = "INV") =>
  withTx((tx) => nextDocumentNumber(tx, "INVOICE", date, prefix));

describe("nextDocumentNumber", () => {
  it("starts at 0001 and increments", async () => {
    expect(await take()).toBe("INV/2026-27/0001");
    expect(await take()).toBe("INV/2026-27/0002");
  });

  it("restarts each financial year", async () => {
    expect(await take("2027-03-31")).toBe("INV/2026-27/0001");
    expect(await take("2027-04-01")).toBe("INV/2027-28/0001");
    expect(await take("2027-03-30")).toBe("INV/2026-27/0002");
  });

  it("keeps document types independent", async () => {
    await take();
    const rcp = await withTx((tx) => nextDocumentNumber(tx, "RECEIPT", "2026-11-05", "RCP"));
    expect(rcp).toBe("RCP/2026-27/0001");
  });

  it("leaves no gap when the business transaction rolls back", async () => {
    await take();
    await expect(
      withTx(async (tx) => {
        await nextDocumentNumber(tx, "INVOICE", "2026-11-05", "INV");
        throw new Error("business rule failed");
      }),
    ).rejects.toThrow("business rule failed");
    expect(await take()).toBe("INV/2026-27/0002");
  });

  it("hands out unique, contiguous numbers under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => take()));
    const nums = results.map((r) => Number(r.split("/")[2])).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe("audit_logs", () => {
  it("is append-only at the database level", async () => {
    const row = await db.auditLog.create({ data: { action: "TEST", entity: "test" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "CHANGED" } })).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});

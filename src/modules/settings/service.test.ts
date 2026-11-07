import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { businessToday, fiscalYear } from "@/lib/dates";
import { makeUser, resetDb } from "../../../tests/db";
import { createCustomer } from "@/modules/customers/service";
import { customerSchema } from "@/modules/customers/schema";
import { createOrder, type Actor } from "@/modules/orders/service";
import { settingsSchema, sniffImage } from "./schema";
import { removeLogo, setLogo, updateSettings } from "./service";

let admin: Actor;
const FY = fiscalYear(businessToday());
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const base = {
  businessName: "Sree Krishna Motors",
  orderPrefix: "ORD",
  invoicePrefix: "INV",
  receiptPrefix: "RCP",
  refundPrefix: "RFD",
  printPaperWidthMm: "80",
  longRentalDays: "30",
};
const parse = (o: Record<string, unknown>) => settingsSchema.parse({ ...base, ...o });
const issues = (o: Record<string, unknown>) => {
  const r = settingsSchema.safeParse({ ...base, ...o });
  return r.success ? [] : r.error.issues.map((i) => `${String(i.path[0])}:${i.message}`);
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

beforeEach(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, businessName: "Test" } });
  admin = { id: (await makeUser({ role: "ADMIN" })).id, role: "ADMIN" };
});

describe("settingsSchema", () => {
  it("upper-cases prefixes and accepts the two paper widths", () => {
    const v = parse({ orderPrefix: "skm-o", printPaperWidthMm: "58", businessNameMl: "  ", email: "" });
    expect([v.orderPrefix, v.printPaperWidthMm, v.businessNameMl, v.email]).toEqual(["SKM-O", 58, null, null]);
  });
  it("rejects bad prefixes, duplicates, widths, thresholds and emails", () => {
    expect(issues({ orderPrefix: "OR/D" })).toEqual(["orderPrefix:validation.prefixInvalid"]);
    expect(issues({ invoicePrefix: "" })).toEqual(["invoicePrefix:validation.prefixInvalid"]);
    expect(issues({ receiptPrefix: "TOOLONGPREFIX" })).toEqual(["receiptPrefix:validation.prefixInvalid"]);
    expect(issues({ refundPrefix: "rcp" })).toEqual(["refundPrefix:validation.prefixDuplicate"]); // case-insensitive clash
    expect(issues({ printPaperWidthMm: "72" })).toEqual(["printPaperWidthMm:validation.invalid"]);
    expect(issues({ longRentalDays: "0" })).toEqual(["longRentalDays:validation.daysInvalid"]);
    expect(issues({ longRentalDays: "366" })).toEqual(["longRentalDays:validation.daysInvalid"]);
    expect(issues({ longRentalDays: "7.5" })).toEqual(["longRentalDays:validation.daysInvalid"]);
    expect(issues({ email: "not-an-email" })).toEqual(["email:validation.emailInvalid"]);
    expect(issues({ businessName: "  " })).toEqual(["businessName:validation.required"]);
  });
});

describe("updateSettings", () => {
  it("saves and audits exactly the fields that changed", async () => {
    const r = await updateSettings(admin, parse({ businessNameMl: "ശ്രീ കൃഷ്ണ മോട്ടോഴ്സ്", longRentalDays: "21" }));
    expect(r.changed.sort()).toEqual(["businessName", "businessNameMl", "longRentalDays"]);
    const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect([s.businessName, s.longRentalDays, s.updatedById]).toEqual(["Sree Krishna Motors", 21, admin.id]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "SETTINGS_UPDATE" } });
    expect(audit.summary).toMatchObject({ longRentalDays: { from: 30, to: 21 }, businessName: { from: "Test", to: "Sree Krishna Motors" } });
    expect(Object.keys(audit.summary as object)).not.toContain("invoicePrefix");
  });

  it("saving with nothing changed writes nothing", async () => {
    await updateSettings(admin, parse({}));
    const r = await updateSettings(admin, parse({}));
    expect(r.changed).toEqual([]);
    expect(await db.auditLog.count({ where: { action: "SETTINGS_UPDATE" } })).toBe(1);
  });

  it("a new prefix applies to new numbers only, and the count carries on without a gap", async () => {
    const customerId = (await createCustomer(admin, customerSchema.parse({ name: "Ravi", phone: "9847012345" }))).id;
    const mk = () => createOrder(admin, { customerId, siteAddress: null, notes: null, date: null, lines: [] });
    const first = await mk();
    await updateSettings(admin, parse({ orderPrefix: "SKM" }));
    const second = await mk();
    expect([first.orderNo, second.orderNo]).toEqual([`ORD/${FY}/0001`, `SKM/${FY}/0002`]);
  });

  it("the database refuses bad prefixes and clashes even without the form", async () => {
    await expect(db.settings.update({ where: { id: 1 }, data: { orderPrefix: "a/b" } })).rejects.toThrow();
    await expect(db.settings.update({ where: { id: 1 }, data: { refundPrefix: "RCP" } })).rejects.toThrow();
    await expect(db.settings.update({ where: { id: 1 }, data: { longRentalDays: 0 } })).rejects.toThrow();
    await expect(db.settings.update({ where: { id: 1 }, data: { businessName: " " } })).rejects.toThrow();
  });
});

describe("logo", () => {
  it("detects PNG and JPEG from the bytes, not the file name or browser type", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
  });

  it("stores, replaces and removes the logo, audited; refuses wrong types and big files", async () => {
    await setLogo(admin, PNG);
    let s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect([s.logoMime, s.logoData?.length]).toEqual(["image/png", PNG.length]);
    await setLogo(admin, JPEG);
    s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect(s.logoMime).toBe("image/jpeg");

    expect(await code(setLogo(admin, new TextEncoder().encode("GIF89a")))).toBe("settings.logoType");
    expect(await code(setLogo(admin, new Uint8Array(0)))).toBe("settings.logoMissing");
    const big = new Uint8Array(300 * 1024 + 1);
    big.set(PNG);
    expect(await code(setLogo(admin, big))).toBe("settings.logoTooBig");

    await removeLogo(admin);
    s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect([s.logoData, s.logoMime]).toEqual([null, null]);
    expect((await db.auditLog.findMany({ where: { entity: "settings" }, orderBy: { id: "asc" } })).map((a) => a.action)).toEqual([
      "LOGO_UPDATE",
      "LOGO_UPDATE",
      "LOGO_REMOVE",
    ]);
  });

  it("the database caps the size and allows only PNG/JPEG", async () => {
    await expect(db.settings.update({ where: { id: 1 }, data: { logoData: Buffer.alloc(10), logoMime: "image/svg+xml" } })).rejects.toThrow();
    await expect(db.settings.update({ where: { id: 1 }, data: { logoData: Buffer.alloc(300 * 1024 + 1), logoMime: "image/png" } })).rejects.toThrow();
    await expect(db.settings.update({ where: { id: 1 }, data: { logoData: Buffer.alloc(10), logoMime: null } })).rejects.toThrow();
  });
});

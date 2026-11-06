import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../../../tests/db";
import { buildCustomerWhere } from "./queries";
import { type CustomerInput, customerSchema } from "./schema";
import { createCustomer, DuplicatePhoneError, setCustomerActive, updateCustomer } from "./service";

let staff: { id: number };
beforeEach(async () => {
  await resetDb();
  staff = await makeUser({ role: "STAFF" });
});

const input = (over: Record<string, string> = {}): CustomerInput =>
  customerSchema.parse({ name: "Ravi Kumar", phone: "98470 12345", ...over });

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));

describe("customerSchema", () => {
  it("normalises phones and turns blanks into null", () => {
    const c = input({ altPhone: "", address: "  ", idProofType: "", notes: "" });
    expect(c).toMatchObject({ phone: "9847012345", altPhone: null, address: null, idProofType: null, notes: null });
  });

  it("rejects bad input with translation keys", () => {
    const issues = (o: Record<string, string>) =>
      customerSchema.safeParse({ name: "X", phone: "9847012345", ...o }).error?.issues.map((i) => i.message);
    expect(issues({ name: "  " })).toContain("validation.required");
    expect(issues({ phone: "12" })).toContain("validation.phoneInvalid");
    expect(issues({ phone: "" })).toContain("validation.required");
    expect(issues({ idProofNumber: "1234" })).toContain("validation.idProofTypeRequired");
    expect(issues({ altPhone: "+91 98470 12345" })).toContain("validation.altPhoneSame");
    expect(issues({ idProofType: "RATION_CARD" })).toBeDefined();
  });
});

describe("createCustomer", () => {
  it("creates the customer with an audit row", async () => {
    const c = await createCustomer(staff, input({ idProofType: "AADHAAR", idProofNumber: "1234 5678 9012" }));
    expect(c.createdById).toBe(staff.id);
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "CUSTOMER_CREATE" } });
    expect(a).toMatchObject({ actorId: staff.id, entityId: String(c.id) });
  });

  it("warns when the phone is already used (as main or alternate number) and saves once confirmed", async () => {
    const first = await createCustomer(staff, input({ altPhone: "9000000001" }));

    const err = await createCustomer(staff, input({ name: "Ravi's brother", phone: "+91 90000 00001" })).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicatePhoneError);
    expect((err as DuplicatePhoneError).matches.map((m) => m.id)).toEqual([first.id]);
    expect(await db.customer.count()).toBe(1);

    await createCustomer(staff, input({ name: "Ravi's brother", phone: "9000000001" }), { confirmDuplicate: true });
    expect(await db.customer.count()).toBe(2);
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "CUSTOMER_CREATE" }, orderBy: { id: "desc" } });
    expect(a.summary).toMatchObject({ duplicateConfirmed: true });
  });
});

describe("updateCustomer", () => {
  it("records only the changed fields, before and after", async () => {
    const c = await createCustomer(staff, input());
    await updateCustomer(staff, c.id, input({ address: "Near temple, Aluva" }));
    const a = await db.auditLog.findFirstOrThrow({ where: { action: "CUSTOMER_UPDATE" } });
    expect(a.summary).toEqual({ before: { address: null }, after: { address: "Near temple, Aluva" } });
  });

  it("writes nothing when nothing changed", async () => {
    const c = await createCustomer(staff, input());
    await updateCustomer(staff, c.id, input({ phone: "+91 98470 12345" }));
    expect(await db.auditLog.count({ where: { action: "CUSTOMER_UPDATE" } })).toBe(0);
  });

  it("doesn't warn about the customer's own numbers, but does about a new number used by someone else", async () => {
    const a = await createCustomer(staff, input());
    const b = await createCustomer(staff, input({ name: "Suresh", phone: "9123456789" }));
    // Keeping its own number while editing the name: no warning.
    await expect(updateCustomer(staff, a.id, input({ name: "Ravi K" }))).resolves.toBeTruthy();
    // Taking b's number: warning, then allowed when confirmed.
    expect(await code(updateCustomer(staff, a.id, input({ altPhone: "9123456789" })))).toBe("customers.duplicatePhone");
    await updateCustomer(staff, a.id, input({ altPhone: "9123456789" }), { confirmDuplicate: true });
    expect((await db.customer.findUniqueOrThrow({ where: { id: a.id } })).altPhone).toBe(b.phone);
  });

  it("reports a missing customer", async () => {
    expect(await code(updateCustomer(staff, 999, input()))).toBe("customers.notFound");
  });
});

describe("setCustomerActive", () => {
  it("deactivates and reactivates with audit rows; never deletes", async () => {
    const c = await createCustomer(staff, input());
    await setCustomerActive(staff, c.id, false, "Moved away");
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(false);
    await setCustomerActive(staff, c.id, false, null); // no-op, no second audit row
    await setCustomerActive(staff, c.id, true, null);
    const actions = (await db.auditLog.findMany({ where: { entity: "customer" }, orderBy: { id: "asc" } })).map((a) => [a.action, a.reason]);
    expect(actions).toEqual([
      ["CUSTOMER_CREATE", null],
      ["CUSTOMER_DEACTIVATE", "Moved away"],
      ["CUSTOMER_REACTIVATE", null],
    ]);
  });

  it("the database refuses deleting a customer's creator (no cascades)", async () => {
    await createCustomer(staff, input());
    await expect(db.user.delete({ where: { id: staff.id } })).rejects.toThrow();
  });
});

describe("customer search", () => {
  const find = async (q: string, status: "active" | "inactive" | "all" = "active") =>
    (await db.customer.findMany({ where: buildCustomerWhere(q, status), orderBy: { id: "asc" } })).map((c) => c.name);

  beforeEach(async () => {
    await createCustomer(staff, input({ name: "Ravi Kumar", phone: "9847012345" }));
    await createCustomer(staff, input({ name: "Lakshmi Ravindran", phone: "9446000111", altPhone: "04842345678" }));
    const old = await createCustomer(staff, input({ name: "Ravi Old", phone: "9000000009" }));
    await setCustomerActive(staff, old.id, false, null);
  });

  it("finds by any part of the name, ignoring case", async () => {
    expect(await find("ravi")).toEqual(["Ravi Kumar", "Lakshmi Ravindran"]);
    expect(await find("KUMAR")).toEqual(["Ravi Kumar"]);
  });

  it("finds by phone typed any way, partial numbers, and the alternate number", async () => {
    expect(await find("+91 98470 12345")).toEqual(["Ravi Kumar"]);
    expect(await find("12345")).toEqual(["Ravi Kumar"]);
    expect(await find("2345678")).toEqual(["Lakshmi Ravindran"]);
  });

  it("finds by customer number", async () => {
    expect(await find("#2")).toEqual(["Lakshmi Ravindran"]);
  });

  it("filters by status", async () => {
    expect(await find("ravi", "inactive")).toEqual(["Ravi Old"]);
    expect(await find("ravi", "all")).toHaveLength(3);
    expect(await find("", "active")).toHaveLength(2);
  });
});

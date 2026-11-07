import { describe, expect, it } from "vitest";
import { can, homePath, PERMISSIONS } from "./permissions";

describe("permission map (docs/01-requirements.md §6)", () => {
  it("admin can do everything", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(can("ADMIN", p)).toBe(true);
    }
  });

  it.each([
    "customer.read",
    "customer.write",
    "order.create",
    "issue.create",
    "return.create",
    "invoice.create",
    "statement.print",
    "payment.create",
    "refund.create",
    "receipt.print",
  ] as const)("staff can %s", (p) => {
    expect(can("STAFF", p)).toBe(true);
  });

  it.each([
    "customer.delete",
    "product.write",
    "rate.write",
    "stock.adjust",
    "invoice.discount",
    "record.void",
    "record.cancel",
    "date.backdate",
    "dashboard.view",
    "report.view",
    "audit.view",
    "user.manage",
    "settings.write",
  ] as const)("staff cannot %s", (p) => {
    expect(can("STAFF", p)).toBe(false);
  });

  it("staff land on orders, admins on the dashboard", () => {
    expect(homePath("STAFF")).toBe("/orders");
    expect(homePath("ADMIN")).toBe("/dashboard");
  });
});

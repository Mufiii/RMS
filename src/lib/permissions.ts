import type { Role } from "@/generated/prisma/enums";

/**
 * Single source of truth for who may do what (docs/01-requirements.md §6,
 * docs/02-architecture.md §5). Checked on the server for every page and action.
 */
export const PERMISSIONS = {
  "customer.read": ["ADMIN", "STAFF"],
  "customer.write": ["ADMIN", "STAFF"],
  /** Only customers with no orders or payments; everyone else is deactivated. */
  "customer.delete": ["ADMIN"],
  "order.create": ["ADMIN", "STAFF"],
  "issue.create": ["ADMIN", "STAFF"],
  "return.create": ["ADMIN", "STAFF"],
  "invoice.create": ["ADMIN", "STAFF"],
  "statement.print": ["ADMIN", "STAFF"],
  "payment.create": ["ADMIN", "STAFF"],
  "refund.create": ["ADMIN", "STAFF"],
  "receipt.print": ["ADMIN", "STAFF"],
  "product.read": ["ADMIN", "STAFF"],
  "product.write": ["ADMIN"],
  "rate.write": ["ADMIN"],
  "stock.adjust": ["ADMIN"],
  "invoice.discount": ["ADMIN"],
  "record.void": ["ADMIN"],
  "record.cancel": ["ADMIN"],
  /** Issue and return dates only — payments are never backdated. */
  "date.backdate": ["ADMIN"],
  "dashboard.view": ["ADMIN"],
  "report.view": ["ADMIN"],
  "audit.view": ["ADMIN"],
  "user.manage": ["ADMIN"],
  "settings.write": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Where a user lands after login: admins see the dashboard, staff see orders. */
export function homePath(role: Role): string {
  return can(role, "dashboard.view") ? "/dashboard" : "/orders";
}

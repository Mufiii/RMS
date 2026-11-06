import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizePhone } from "./phone";

export const CUSTOMER_PAGE_SIZE = 30;

export type CustomerStatusFilter = "active" | "inactive" | "all";

/**
 * Search by name (case-insensitive, any part), by phone (any part of either
 * number, typed any way), or by customer number ("#12" or "12").
 */
export function buildCustomerWhere(qRaw: string, status: CustomerStatusFilter): Prisma.CustomerWhereInput {
  const q = qRaw.trim();
  const statusWhere: Prisma.CustomerWhereInput =
    status === "all" ? {} : { isActive: status === "active" };
  if (!q) return statusWhere;

  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }];
  const idMatch = /^#?(\d{1,9})$/.exec(q);
  if (idMatch) or.push({ id: Number(idMatch[1]) });
  if (/^[\d\s+()-]+$/.test(q)) {
    const digits = q.replace(/\D/g, "");
    // A full number may be typed with +91 / 0; a partial one is matched as typed.
    const needle = digits.length >= 10 ? normalizePhone(digits) : digits;
    if (needle.length >= 3) {
      or.push({ phone: { contains: needle } }, { altPhone: { contains: needle } });
    }
  }
  return { AND: [statusWhere, { OR: or }] };
}

export async function searchCustomers(q: string, status: CustomerStatusFilter, page: number) {
  const where = buildCustomerWhere(q, status);
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
      select: { id: true, name: true, phone: true, altPhone: true, address: true, isActive: true },
    }),
  ]);
  return { total, rows, pages: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)) };
}

export function getCustomer(id: number) {
  return db.customer.findUnique({
    where: { id },
    include: { createdBy: { select: { fullName: true } } },
  });
}

/** Recent changes to one customer, for the history page. */
export function customerAuditTrail(id: number) {
  return db.auditLog.findMany({
    where: { entity: "customer", entityId: String(id) },
    orderBy: { id: "desc" },
    take: 20,
    include: { actor: { select: { fullName: true } } },
  });
}

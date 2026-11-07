import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { balancesFor, type OrderBalance } from "@/modules/payments/queries";
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

/** Billed and still unpaid, per customer (paise): final invoices minus payments, credits not netted. */
function billedDueByCustomer(balances: OrderBalance[]) {
  const due = new Map<number, number>();
  for (const b of balances) {
    if (b.invoice && b.balance > 0) due.set(b.customerId, (due.get(b.customerId) ?? 0) + b.balance);
  }
  return due;
}

/**
 * One page of the customer list, with each customer's rental count (orders,
 * cancelled ones left out), billed-and-unpaid amount, and whether any order or
 * payment refers to them (only customers without history can be deleted).
 */
export async function searchCustomers(q: string, status: CustomerStatusFilter, page: number, today: string) {
  const where = buildCustomerWhere(q, status);
  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        altPhone: true,
        isActive: true,
        _count: { select: { orders: true, payments: true } },
      },
    }),
  ]);
  const ids = customers.map((c) => c.id);
  const balances = ids.length > 0 ? await balancesFor({ customerId: { in: ids } }, today) : [];
  const due = billedDueByCustomer(balances);
  const rentals = new Map<number, number>();
  for (const b of balances) rentals.set(b.customerId, (rentals.get(b.customerId) ?? 0) + 1);

  const rows = customers.map(({ _count, ...c }) => ({
    ...c,
    rentals: rentals.get(c.id) ?? 0,
    outstanding: due.get(c.id) ?? 0,
    hasHistory: _count.orders + _count.payments > 0,
  }));
  return { total, rows, pages: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)) };
}
export type CustomerRow = Awaited<ReturnType<typeof searchCustomers>>["rows"][number];

/** Shop-wide figures for the cards above the customer list (not affected by search or filter). */
export async function customerSummary(today: string) {
  const [customers, active, rentals, balances] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { isActive: true } }),
    db.rentalOrder.count({ where: { status: { not: "CANCELLED" } } }),
    balancesFor({}, today),
  ]);
  const due = billedDueByCustomer(balances);
  return {
    customers,
    active,
    rentals,
    outstanding: [...due.values()].reduce((s, v) => s + v, 0),
    customersOwing: due.size,
  };
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

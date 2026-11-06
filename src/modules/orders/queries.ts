import "server-only";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizePhone } from "@/modules/customers/phone";

export const ORDER_PAGE_SIZE = 30;
export type OrderStatusFilter = OrderStatus | "ALL";

/** Search by order number (or just its last digits), customer name or phone. */
export function buildOrderWhere(qRaw: string, status: OrderStatusFilter): Prisma.RentalOrderWhereInput {
  const q = qRaw.trim();
  const statusWhere: Prisma.RentalOrderWhereInput = status === "ALL" ? {} : { status };
  if (!q) return statusWhere;
  const or: Prisma.RentalOrderWhereInput[] = [{ customer: { name: { contains: q, mode: "insensitive" } } }];
  if (/^\d{1,5}$/.test(q)) {
    // A short number means the order's running number ("12" → …/0012). A plain
    // "contains" would match every order, since they all contain the year.
    or.push({ orderNo: { endsWith: `/${q.padStart(4, "0")}` } });
  } else {
    or.push({ orderNo: { contains: q, mode: "insensitive" } });
  }
  if (/^[\d\s+()-]+$/.test(q)) {
    const digits = q.replace(/\D/g, "");
    const needle = digits.length >= 10 ? normalizePhone(digits) : digits;
    if (needle.length >= 3) or.push({ customer: { OR: [{ phone: { contains: needle } }, { altPhone: { contains: needle } }] } });
  }
  return { AND: [statusWhere, { OR: or }] };
}

/** Pieces still out per order (active lines, issued − returned). */
async function outstandingByOrder(orderIds: number[]) {
  if (orderIds.length === 0) return new Map<number, number>();
  const rows = await db.issueLine.groupBy({
    by: ["orderId"],
    where: { orderId: { in: orderIds }, status: "ACTIVE" },
    _sum: { quantity: true, qtyReturned: true },
  });
  return new Map(rows.map((r) => [r.orderId, (r._sum.quantity ?? 0) - (r._sum.qtyReturned ?? 0)]));
}

export async function listOrders(q: string, status: OrderStatusFilter, page: number) {
  const where = buildOrderWhere(q, status);
  const [total, rows] = await Promise.all([
    db.rentalOrder.count({ where }),
    db.rentalOrder.findMany({
      where,
      orderBy: [{ openedOn: "desc" }, { id: "desc" }],
      skip: (page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    }),
  ]);
  const out = await outstandingByOrder(rows.map((r) => r.id));
  return {
    total,
    pages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r, piecesOut: out.get(r.id) ?? 0 })),
  };
}

export function getOrder(id: number) {
  return db.rentalOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { fullName: true } },
      cancelledBy: { select: { fullName: true } },
      issues: {
        orderBy: [{ issueDate: "asc" }, { id: "asc" }],
        include: {
          issuedBy: { select: { fullName: true } },
          lines: {
            orderBy: { id: "asc" },
            include: {
              product: { select: { id: true, name: true, nameMl: true, code: true } },
              unit: { select: { serialNo: true } },
              voidedBy: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
}

export function orderAuditTrail(orderId: number) {
  return db.auditLog.findMany({
    where: { entity: "order", entityId: String(orderId) },
    orderBy: { id: "desc" },
    take: 30,
    include: { actor: { select: { fullName: true } } },
  });
}

/** Products that can be issued right now, with their available units (issue form). */
export async function issuableProducts() {
  const products = await db.product.findMany({
    where: { isActive: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    include: {
      category: { select: { name: true, nameMl: true } },
      units: { where: { status: "AVAILABLE" }, orderBy: { serialNo: "asc" }, select: { id: true, serialNo: true } },
    },
  });
  return products
    .map((p) => ({
      id: p.id,
      name: p.name,
      nameMl: p.nameMl,
      code: p.code,
      category: p.category.name,
      categoryMl: p.category.nameMl,
      tracking: p.tracking,
      rate: p.dailyRate.toFixed(2),
      available: p.qtyOwned - p.qtyOut - p.qtyRepair,
      units: p.units,
    }))
    .filter((p) => p.available > 0);
}
export type IssuableProduct = Awaited<ReturnType<typeof issuableProducts>>[number];

/** For the customer page: their orders, newest first. */
export async function customerOrders(customerId: number) {
  const rows = await db.rentalOrder.findMany({
    where: { customerId },
    orderBy: [{ openedOn: "desc" }, { id: "desc" }],
    take: 50,
  });
  const out = await outstandingByOrder(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, piecesOut: out.get(r.id) ?? 0 }));
}

/** For the customer page: every item this customer still has, across orders. */
export function customerItemsOut(customerId: number) {
  return db.issueLine.findMany({
    where: { status: "ACTIVE", order: { customerId, status: "OPEN" }, qtyReturned: { lt: db.issueLine.fields.quantity } },
    orderBy: [{ issue: { issueDate: "asc" } }, { id: "asc" }],
    include: {
      order: { select: { id: true, orderNo: true } },
      issue: { select: { issueDate: true } },
      product: { select: { name: true, nameMl: true } },
      unit: { select: { serialNo: true } },
    },
  });
}

/** Customer search for the "new order" picker (active customers only). */
export function pickCustomers(q: string) {
  const query = q.trim();
  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: query, mode: "insensitive" } }];
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3) {
    const needle = digits.length >= 10 ? normalizePhone(digits) : digits;
    or.push({ phone: { contains: needle } }, { altPhone: { contains: needle } });
  }
  if (/^#?\d{1,9}$/.test(query)) or.push({ id: Number(query.replace("#", "")) });
  return db.customer.findMany({
    where: { isActive: true, ...(query ? { OR: or } : {}) },
    orderBy: query ? { name: "asc" } : { createdAt: "desc" },
    take: 20,
    select: { id: true, name: true, phone: true, address: true },
  });
}

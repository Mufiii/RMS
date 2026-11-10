import "server-only";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { businessToday, fromDbDate } from "@/lib/dates";
import { days } from "@/modules/billing/engine";
import { normalizePhone } from "@/modules/customers/phone";
import { balancesFor } from "@/modules/payments/queries";
import { orderStage } from "./stage";

export const ORDER_PAGE_SIZE = 30;
export type OrderStatusFilter = OrderStatus | "ALL";

/** Search by order number (or just its last digits), customer name or phone. */
export function buildOrderWhere(qRaw: string, status: OrderStatusFilter): Prisma.RentalOrderWhereInput {
  const q = qRaw.trim();
  const statusWhere: Prisma.RentalOrderWhereInput = status === "ALL" ? {} : { status };
  if (!q) return statusWhere;
  const or: Prisma.RentalOrderWhereInput[] = [{ customer: { name: { contains: q, mode: "insensitive" } } }];
  // "12" or "ORD-12" means the running number 12. New numbers end "-0012", older
  // ones "/0012"; the separator anchors the match so "1" never hits "ORD-0001"'s
  // neighbours like "ORD-10001", and a plain "contains" would match every old order (the year).
  const short = /^(?:[A-Za-z][A-Za-z0-9]*-)?(\d{1,5})$/.exec(q);
  if (short) {
    const n = short[1].padStart(4, "0");
    or.push({ orderNo: { endsWith: `-${n}` } }, { orderNo: { endsWith: `/${n}` } });
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

/** Item quantities per order (active lines): lifetime total issued, and how much of that is still out (issued − returned). */
async function itemCountsByOrder(orderIds: number[]) {
  if (orderIds.length === 0) return new Map<number, { total: number; out: number }>();
  const rows = await db.issueLine.groupBy({
    by: ["orderId"],
    where: { orderId: { in: orderIds }, status: "ACTIVE" },
    _sum: { quantity: true, qtyReturned: true },
  });
  return new Map(
    rows.map((r) => {
      const total = r._sum.quantity ?? 0;
      return [r.orderId, { total, out: total - (r._sum.qtyReturned ?? 0) }];
    }),
  );
}

/** Issue date of the oldest piece still out, per order (active lines only). */
async function oldestOutByOrder(orderIds: number[]) {
  const map = new Map<number, string>();
  if (orderIds.length === 0) return map;
  const lines = await db.issueLine.findMany({
    where: { orderId: { in: orderIds }, status: "ACTIVE", qtyReturned: { lt: db.issueLine.fields.quantity } },
    select: { orderId: true, issue: { select: { issueDate: true } } },
  });
  for (const l of lines) {
    const date = fromDbDate(l.issue.issueDate);
    const have = map.get(l.orderId);
    if (!have || date < have) map.set(l.orderId, date);
  }
  return map;
}

/**
 * One page of orders for the list. Money comes from the same `balancesFor` the order
 * page, customer page and dashboard use: the invoice total once billed, otherwise rent so far.
 */
export async function listOrders(q: string, status: OrderStatusFilter, page: number) {
  const where = buildOrderWhere(q, status);
  const [total, rows, settings] = await Promise.all([
    db.rentalOrder.count({ where }),
    db.rentalOrder.findMany({
      where,
      orderBy: [{ openedOn: "desc" }, { id: "desc" }],
      skip: (page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    }),
    db.settings.findUnique({ where: { id: 1 }, select: { longRentalDays: true } }),
  ]);
  const ids = rows.map((r) => r.id);
  const today = businessToday();
  const [counts, oldest, balances] = await Promise.all([
    itemCountsByOrder(ids),
    oldestOutByOrder(ids),
    ids.length ? balancesFor({ id: { in: ids } }, today) : Promise.resolve([]),
  ]);
  const money = new Map(balances.map((b) => [b.id, b]));
  const threshold = settings?.longRentalDays ?? 30;
  return {
    total,
    threshold,
    pages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    rows: rows.map((r) => {
      const c = counts.get(r.id) ?? { total: 0, out: 0 };
      const m = money.get(r.id) ?? null; // cancelled orders have no balance
      const since = r.status === "OPEN" ? oldest.get(r.id) : undefined;
      return {
        ...r,
        totalItems: c.total,
        piecesOut: c.out,
        /** Days the oldest piece still out has been out (issue day = day 1); null when nothing is out. */
        daysOut: since ? days(since, today) : null,
        /** Paise: the invoice total once billed, otherwise rent so far. Null for cancelled orders. */
        amount: m?.due ?? null,
        invoiced: !!m?.invoice,
        invoiceId: m?.invoice?.id ?? null,
        /** Paise: positive = the customer owes, negative = excess held. */
        balance: m?.balance ?? null,
        stage: orderStage({ status: r.status, total: c.total, out: c.out, balance: m?.balance ?? 0 }),
      };
    }),
  };
}

export function getOrder(id: number) {
  return db.rentalOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { fullName: true } },
      cancelledBy: { select: { fullName: true } },
      returns: {
        orderBy: [{ returnDate: "asc" }, { id: "asc" }],
        include: {
          receivedBy: { select: { fullName: true } },
          voidedBy: { select: { fullName: true } },
          lines: {
            orderBy: { id: "asc" },
            include: {
              issueLine: {
                select: { product: { select: { name: true, nameMl: true } }, unit: { select: { serialNo: true } } },
              },
            },
          },
        },
      },
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
  const counts = await itemCountsByOrder(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, piecesOut: counts.get(r.id)?.out ?? 0 }));
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

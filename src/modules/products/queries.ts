import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type ProductFilters = { q: string; categoryId: number | null; includeInactive: boolean };

export function listProducts(f: ProductFilters) {
  const q = f.q.trim();
  const where: Prisma.ProductWhereInput = {
    ...(f.includeInactive ? {} : { isActive: true }),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameMl: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { units: { some: { serialNo: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  return db.product.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { category: { name: "asc" } }, { name: "asc" }],
    include: { category: { select: { name: true, nameMl: true } } },
    take: 500,
  });
}

export function getProduct(id: number) {
  return db.product.findUnique({
    where: { id },
    include: {
      category: true,
      units: { orderBy: [{ status: "asc" }, { serialNo: "asc" }] },
    },
  });
}

export function productMovements(productId: number) {
  return db.stockMovement.findMany({
    where: { productId },
    orderBy: { id: "desc" },
    take: 50,
    include: { createdBy: { select: { fullName: true } }, unit: { select: { serialNo: true } } },
  });
}

/** Tracking type may only change while this is false. */
export async function productHasStockHistory(productId: number) {
  return (await db.stockMovement.count({ where: { productId } })) > 0;
}

export function productAuditTrail(productId: number) {
  return db.auditLog.findMany({
    where: { entity: "product", entityId: String(productId), action: { not: "STOCK_ADJUST" } },
    orderBy: { id: "desc" },
    take: 20,
    include: { actor: { select: { fullName: true } } },
  });
}

export function listCategories(includeInactive = true) {
  return db.category.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

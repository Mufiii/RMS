import { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { fromPaise, toPaise } from "@/lib/money";
import { type Tx, withTx } from "@/lib/tx";
import { insertUnits, recordMovement } from "@/modules/inventory/service";
import type { NewProductInput, ProductInput } from "@/modules/inventory/schema";

export type Actor = { id: number };

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------------------------------------------------------------- categories

export async function createCategory(actor: Actor, input: { name: string; nameMl: string | null }) {
  try {
    return await withTx(async (tx) => {
      const c = await tx.category.create({ data: input });
      await writeAudit(tx, { actorId: actor.id, action: "CATEGORY_CREATE", entity: "category", entityId: c.id, summary: input });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("categories.nameTaken", { name: input.name });
    throw e;
  }
}

export async function updateCategory(actor: Actor, id: number, input: { name: string; nameMl: string | null }) {
  try {
    return await withTx(async (tx) => {
      const before = await tx.category.findUnique({ where: { id } });
      if (!before) throw new DomainError("categories.notFound");
      const c = await tx.category.update({ where: { id }, data: input });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "CATEGORY_UPDATE",
        entity: "category",
        entityId: id,
        summary: { before: { name: before.name, nameMl: before.nameMl }, after: input },
      });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("categories.nameTaken", { name: input.name });
    throw e;
  }
}

/** Inactive categories keep their products but can't be chosen for new or edited products. */
export async function setCategoryActive(actor: Actor, id: number, active: boolean) {
  return withTx(async (tx) => {
    const before = await tx.category.findUnique({ where: { id } });
    if (!before) throw new DomainError("categories.notFound");
    if (before.isActive === active) return before;
    const c = await tx.category.update({ where: { id }, data: { isActive: active } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: active ? "CATEGORY_REACTIVATE" : "CATEGORY_DEACTIVATE",
      entity: "category",
      entityId: id,
    });
    return c;
  });
}

async function assertCategoryUsable(tx: Tx, categoryId: number) {
  const c = await tx.category.findUnique({ where: { id: categoryId } });
  if (!c) throw new DomainError("categories.notFound");
  if (!c.isActive) throw new DomainError("categories.inactive", { name: c.name });
}

// ------------------------------------------------------------------ products

/** Creates a product with its opening stock (a count, or serial numbers). */
export async function createProduct(actor: Actor, input: NewProductInput) {
  try {
    return await withTx(async (tx) => {
      await assertCategoryUsable(tx, input.categoryId);
      const p = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          code: input.code,
          name: input.name,
          nameMl: input.nameMl,
          tracking: input.tracking,
          dailyRate: fromPaise(input.dailyRate),
          description: input.description,
        },
      });
      if (input.tracking === "QUANTITY" && input.openingQty > 0) {
        await recordMovement(tx, actor, p.id, "OPENING", { deltaOwned: input.openingQty, deltaRepair: 0 });
      }
      if (input.tracking === "SERIALISED" && input.serials.length > 0) {
        await insertUnits(tx, actor, p.id, "OPENING", input.serials);
      }
      await writeAudit(tx, {
        actorId: actor.id,
        action: "PRODUCT_CREATE",
        entity: "product",
        entityId: p.id,
        summary: {
          name: p.name,
          code: p.code,
          tracking: p.tracking,
          dailyRate: fromPaise(input.dailyRate),
          opening: input.tracking === "QUANTITY" ? input.openingQty : input.serials.length,
        },
      });
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("products.codeTaken", { code: input.code ?? "" });
    throw e;
  }
}

const AUDITED = ["categoryId", "code", "name", "nameMl", "tracking", "description"] as const;

/**
 * Edits product details. A daily-rate change is audited separately as
 * RATE_CHANGE (old → new); it never affects existing rentals, which snapshot
 * the rate on the issue line (docs/01-requirements.md §1).
 */
export async function updateProduct(actor: Actor, id: number, input: ProductInput) {
  try {
    return await withTx(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "products" WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) throw new DomainError("products.notFound");
      const before = await tx.product.findUniqueOrThrow({ where: { id } });

      if (input.categoryId !== before.categoryId) await assertCategoryUsable(tx, input.categoryId);
      if (input.tracking !== before.tracking) {
        // Tracking can only change while the product has no stock history at all
        // (stronger than "no issues yet": units or counts would no longer make sense).
        const history = await tx.stockMovement.count({ where: { productId: id } });
        if (history > 0) throw new DomainError("products.trackingLocked");
      }

      const oldRate = toPaise(before.dailyRate);
      const rateChanged = oldRate !== input.dailyRate;
      const changed = AUDITED.filter((f) => (before[f] ?? null) !== (input[f] ?? null));
      if (!rateChanged && changed.length === 0) return before;

      const p = await tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          code: input.code,
          name: input.name,
          nameMl: input.nameMl,
          tracking: input.tracking,
          dailyRate: fromPaise(input.dailyRate),
          description: input.description,
        },
      });
      if (rateChanged) {
        await writeAudit(tx, {
          actorId: actor.id,
          action: "RATE_CHANGE",
          entity: "product",
          entityId: id,
          summary: { before: fromPaise(oldRate), after: fromPaise(input.dailyRate) },
        });
      }
      if (changed.length > 0) {
        await writeAudit(tx, {
          actorId: actor.id,
          action: "PRODUCT_UPDATE",
          entity: "product",
          entityId: id,
          summary: {
            before: Object.fromEntries(changed.map((f) => [f, before[f]])),
            after: Object.fromEntries(changed.map((f) => [f, p[f]])),
          },
        });
      }
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("products.codeTaken", { code: input.code ?? "" });
    throw e;
  }
}

/** Products are never deleted. Inactive products can't be issued (Step 4). */
export async function setProductActive(actor: Actor, id: number, active: boolean, reason: string | null) {
  return withTx(async (tx) => {
    const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "products" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("products.notFound");
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    if (before.isActive === active) return before;
    if (!active && before.qtyOut > 0) throw new DomainError("products.itemsOut", { count: before.qtyOut });
    const p = await tx.product.update({ where: { id }, data: { isActive: active } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: active ? "PRODUCT_REACTIVATE" : "PRODUCT_DEACTIVATE",
      entity: "product",
      entityId: id,
      reason,
    });
    return p;
  });
}

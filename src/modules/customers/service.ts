import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { type Tx, withTx } from "@/lib/tx";
import type { CustomerInput } from "./schema";

export type Actor = { id: number };

export type DuplicateMatch = { id: number; name: string; phone: string; isActive: boolean };

/**
 * Other customers sharing either of these numbers (in either phone field).
 * Phones are not unique (families share numbers), so this drives a warning
 * the user must confirm, not a hard block.
 */
export async function findPhoneDuplicates(
  tx: Pick<Tx, "customer">,
  phones: (string | null)[],
  excludeId?: number,
): Promise<DuplicateMatch[]> {
  const list = phones.filter((p): p is string => !!p);
  if (list.length === 0) return [];
  return tx.customer.findMany({
    where: {
      OR: [{ phone: { in: list } }, { altPhone: { in: list } }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true, isActive: true },
    orderBy: { id: "asc" },
    take: 10,
  });
}

/** Thrown when the number is already used and the user hasn't confirmed yet. */
export class DuplicatePhoneError extends DomainError {
  constructor(public readonly matches: DuplicateMatch[]) {
    super("customers.duplicatePhone");
    this.name = "DuplicatePhoneError";
  }
}

const AUDITED_FIELDS = ["name", "phone", "altPhone", "address", "idProofType", "idProofNumber", "notes"] as const;

export async function createCustomer(actor: Actor, input: CustomerInput, opts: { confirmDuplicate?: boolean } = {}) {
  return withTx(async (tx) => {
    if (!opts.confirmDuplicate) {
      const dups = await findPhoneDuplicates(tx, [input.phone, input.altPhone]);
      if (dups.length > 0) throw new DuplicatePhoneError(dups);
    }
    const customer = await tx.customer.create({ data: { ...input, createdById: actor.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "CUSTOMER_CREATE",
      entity: "customer",
      entityId: customer.id,
      summary: { name: customer.name, phone: customer.phone, duplicateConfirmed: !!opts.confirmDuplicate },
    });
    return customer;
  });
}

export async function updateCustomer(
  actor: Actor,
  id: number,
  input: CustomerInput,
  opts: { confirmDuplicate?: boolean } = {},
) {
  return withTx(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "customers" WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new DomainError("customers.notFound");
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });

    // Only warn about numbers that are new on this customer.
    const newPhones = [input.phone, input.altPhone].filter(
      (p) => p && p !== before.phone && p !== before.altPhone,
    );
    if (!opts.confirmDuplicate && newPhones.length > 0) {
      const dups = await findPhoneDuplicates(tx, newPhones, id);
      if (dups.length > 0) throw new DuplicatePhoneError(dups);
    }

    const changed = AUDITED_FIELDS.filter((f) => (before[f] ?? null) !== (input[f] ?? null));
    if (changed.length === 0) return before;

    const customer = await tx.customer.update({ where: { id }, data: input });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "CUSTOMER_UPDATE",
      entity: "customer",
      entityId: id,
      summary: {
        before: Object.fromEntries(changed.map((f) => [f, before[f]])),
        after: Object.fromEntries(changed.map((f) => [f, customer[f]])),
      },
    });
    return customer;
  });
}

/**
 * Customers are never deleted (docs/01-requirements.md §9). Inactive customers
 * stay in history and search (filtered), but can't take new orders (Step 4).
 * Step 4 also adds: no deactivation while the customer has items out.
 */
export async function setCustomerActive(actor: Actor, id: number, active: boolean, reason: string | null) {
  return withTx(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "customers" WHERE id = ${id} FOR UPDATE`;
    if (locked.length === 0) throw new DomainError("customers.notFound");
    const before = await tx.customer.findUniqueOrThrow({ where: { id } });
    if (before.isActive === active) return before;
    const customer = await tx.customer.update({ where: { id }, data: { isActive: active } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: active ? "CUSTOMER_REACTIVATE" : "CUSTOMER_DEACTIVATE",
      entity: "customer",
      entityId: id,
      reason,
    });
    return customer;
  });
}

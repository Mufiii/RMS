import { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { type Tx, withTx } from "@/lib/tx";
import { hashPassword } from "@/modules/auth/password";
import type { CreateUserInput, UpdateUserInput } from "./schema";

/** The admin performing the change. */
export type Actor = { id: number };

type AdminRow = { id: number; is_active: boolean };

/**
 * Every user change first locks all admin rows in id order, then the target.
 * That one consistent lock order serialises concurrent user changes (no
 * deadlocks) and means two admins can never deactivate or demote each other
 * at the same moment and leave the shop with no admin.
 */
async function lockForUserChange(tx: Tx, id: number) {
  const admins = await tx.$queryRaw<AdminRow[]>`
    SELECT id, is_active FROM "users" WHERE role = 'ADMIN' ORDER BY id FOR UPDATE`;
  const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "users" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("users.notFound");
  const user = await tx.user.findUniqueOrThrow({ where: { id } });
  return { user, admins };
}

function assertAnotherActiveAdmin(admins: AdminRow[], excludingId: number) {
  if (!admins.some((a) => a.is_active && a.id !== excludingId)) {
    throw new DomainError("users.lastAdmin");
  }
}

export async function createUser(actor: Actor, input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await withTx(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        action: "USER_CREATE",
        entity: "user",
        entityId: user.id,
        summary: { username: user.username, fullName: user.fullName, role: user.role },
      });
      return user;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError("users.usernameTaken", { username: input.username });
    }
    throw e;
  }
}

export async function updateUser(actor: Actor, id: number, input: UpdateUserInput) {
  return withTx(async (tx) => {
    const { user: before, admins } = await lockForUserChange(tx, id);
    if (before.role === "ADMIN" && input.role !== "ADMIN") {
      if (id === actor.id) throw new DomainError("users.cannotDemoteSelf");
      assertAnotherActiveAdmin(admins, id);
    }
    const roleChanged = before.role !== input.role;
    const user = await tx.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        role: input.role,
        // A role change ends the user's sessions so the new permissions apply immediately.
        ...(roleChanged ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: roleChanged ? "USER_ROLE_CHANGE" : "USER_UPDATE",
      entity: "user",
      entityId: id,
      summary: {
        before: { fullName: before.fullName, role: before.role },
        after: { fullName: user.fullName, role: user.role },
      },
    });
    return user;
  });
}

/** Admin sets a temporary password; the user must change it at next login. */
export async function resetPassword(actor: Actor, id: number, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  return withTx(async (tx) => {
    await lockForUserChange(tx, id);
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
      },
    });
    await writeAudit(tx, { actorId: actor.id, action: "PASSWORD_RESET", entity: "user", entityId: id });
  });
}

export async function setUserActive(actor: Actor, id: number, active: boolean, reason: string) {
  return withTx(async (tx) => {
    const { user: before, admins } = await lockForUserChange(tx, id);
    if (before.isActive === active) return before;
    if (!active) {
      if (id === actor.id) throw new DomainError("users.cannotDeactivateSelf");
      if (before.role === "ADMIN") assertAnotherActiveAdmin(admins, id);
    }
    const user = await tx.user.update({
      where: { id },
      data: { isActive: active, sessionVersion: { increment: 1 } },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: active ? "USER_REACTIVATE" : "USER_DEACTIVATE",
      entity: "user",
      entityId: id,
      reason,
    });
    return user;
  });
}

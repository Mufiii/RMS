import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./tx";

export type AuditEntry = {
  actorId: number | null;
  action: string; // e.g. USER_CREATE, PASSWORD_RESET, ISSUE_CREATE, BACKDATE
  entity: string; // e.g. user, order, payment
  entityId?: string | number | null;
  summary?: Prisma.InputJsonValue;
  reason?: string | null;
};

/** Writes an audit row inside the same transaction as the change it records. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      summary: entry.summary,
      reason: entry.reason ?? null,
    },
  });
}

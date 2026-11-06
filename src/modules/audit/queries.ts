import "server-only";
import { db } from "@/lib/db";

export const AUDIT_PAGE_SIZE = 50;

/** Newest first; `before` is the id of the last row of the previous page. */
export async function listAudit(before?: bigint) {
  const rows = await db.auditLog.findMany({
    where: before ? { id: { lt: before } } : undefined,
    orderBy: { id: "desc" },
    take: AUDIT_PAGE_SIZE + 1,
    include: { actor: { select: { fullName: true, username: true } } },
  });
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore };
}

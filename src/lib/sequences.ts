import type { DocType } from "@/generated/prisma/enums";
import { fiscalYear } from "./dates";
import { formatOrderNo } from "./order-number";
import type { Tx } from "./tx";

/**
 * Takes the next gap-free document number, e.g. "INV/2026-27/0001".
 *
 * Must be called inside the business transaction: the upsert row-locks the
 * (doc_type, fiscal_year) row until commit, and a rollback also rolls back
 * the number, so numbering never has gaps (docs/02-architecture.md §6).
 */
export async function nextDocumentNumber(
  tx: Tx,
  docType: Exclude<DocType, "ORDER">,
  businessDate: string,
  prefix: string,
): Promise<string> {
  const fy = fiscalYear(businessDate);
  const value = await takeNext(tx, docType, fy);
  return `${prefix}/${fy}/${String(value).padStart(4, "0")}`;
}

/**
 * Next order number, e.g. "ORD-0001". One all-time counter (key 'ALL'): if it
 * restarted each year, the first order of April would repeat ORD-0001 and hit
 * the unique index. Same locking and no-gap behaviour as the other documents.
 */
export async function nextOrderNumber(tx: Tx, prefix: string): Promise<string> {
  return formatOrderNo(prefix, await takeNext(tx, "ORDER", ORDER_SEQUENCE_KEY));
}

const ORDER_SEQUENCE_KEY = "ALL";

async function takeNext(tx: Tx, docType: DocType, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "number_sequences" ("doc_type", "fiscal_year", "next_value")
    VALUES (${docType}::"DocType", ${key}, 2)
    ON CONFLICT ("doc_type", "fiscal_year")
    DO UPDATE SET "next_value" = "number_sequences"."next_value" + 1
    RETURNING ("next_value" - 1) AS value`;
  return Number(rows[0].value);
}

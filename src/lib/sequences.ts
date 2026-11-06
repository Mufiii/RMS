import type { DocType } from "@/generated/prisma/enums";
import { fiscalYear } from "./dates";
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
  docType: DocType,
  businessDate: string,
  prefix: string,
): Promise<string> {
  const fy = fiscalYear(businessDate);
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "number_sequences" ("doc_type", "fiscal_year", "next_value")
    VALUES (${docType}::"DocType", ${fy}, 2)
    ON CONFLICT ("doc_type", "fiscal_year")
    DO UPDATE SET "next_value" = "number_sequences"."next_value" + 1
    RETURNING ("next_value" - 1) AS value`;
  const value = Number(rows[0].value);
  return `${prefix}/${fy}/${String(value).padStart(4, "0")}`;
}

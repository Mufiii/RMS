import "server-only";
import { getTranslations } from "next-intl/server";
import type { Cell, ReportTable } from "./table";

/** Columns holding codes (not names typed by people), which are shown translated. */
const ENUM_COLUMNS = new Set(["tracking", "active", "status", "type", "mode"]);

/**
 * Headers and display text for a report in the user's language. The CSV and
 * the screen both use this, so a column is called the same in both.
 */
export async function presenter() {
  const t = await getTranslations("reports");
  return {
    header: (key: string) => (t.has(`col.${key}`) ? t(`col.${key}`) : key),
    /** Codes in enum columns ("open", "cash") and the totals label get translated; names never do. */
    text: (key: string, v: Cell, isTotals = false): Cell => {
      if (isTotals && v === "total") return t("total");
      if (typeof v === "string" && ENUM_COLUMNS.has(key) && t.has(`value.${v}`)) return t(`value.${v}`);
      return v;
    },
  };
}

/** Copy of the table with enum-like text translated (for CSV in the user's language). */
export function translateCells(table: ReportTable, text: (key: string, v: Cell, isTotals?: boolean) => Cell): ReportTable {
  const tr = (r: Record<string, Cell>, isTotals = false) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, text(k, v, isTotals)]));
  return { ...table, rows: table.rows.map((r) => tr(r)), totals: table.totals && tr(table.totals, true) };
}

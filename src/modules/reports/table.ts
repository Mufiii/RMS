/**
 * A report is a plain table that both the screen and the CSV download render
 * from, so the two can never disagree. Pure: no database, no clock.
 */
import { formatDate } from "@/lib/dates";
import { fromPaise } from "@/lib/money";

export type ColumnKind = "text" | "int" | "money" | "date" | "pct";
export type Column = { key: string; kind: ColumnKind };
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type ReportTable = {
  columns: Column[];
  rows: Row[];
  /** Totals for money/int columns, shown as the last line. */
  totals?: Row;
};

export const col = (key: string, kind: ColumnKind = "text"): Column => ({ key, kind });

/** Raw value for CSV: money as plain rupees ("1234.50"), dates as DD-MM-YYYY, percentages with one decimal. */
export function csvValue(kind: ColumnKind, v: Cell): string {
  if (v === null || v === undefined) return "";
  switch (kind) {
    case "money":
      return fromPaise(Number(v));
    case "date":
      return formatDate(String(v));
    case "pct":
      return Number(v).toFixed(1);
    default:
      return String(v);
  }
}

/**
 * One CSV field. Quotes when needed, and neutralises spreadsheet formulas:
 * a text cell starting with = + - @ (or tab/CR) gets a leading apostrophe, so
 * a customer named "=HYPERLINK(…)" can't run anything in Excel.
 */
export function csvField(kind: ColumnKind, v: Cell): string {
  let s = csvValue(kind, v);
  if (kind === "text" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Whole table as CSV, with a UTF-8 BOM so Excel shows Malayalam and ₹ correctly. */
export function toCsv(table: ReportTable, headers: string[]): string {
  const lines = [headers.map((h) => csvField("text", h)).join(",")];
  for (const r of table.rows) lines.push(table.columns.map((c) => csvField(c.kind, r[c.key] ?? null)).join(","));
  if (table.totals) lines.push(table.columns.map((c) => csvField(c.kind, table.totals![c.key] ?? null)).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Sums the money/int columns listed in `keys`. */
export function sumColumns(rows: Row[], keys: string[], first: Row = {}): Row {
  const t: Row = { ...first };
  for (const k of keys) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return t;
}

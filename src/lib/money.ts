/**
 * Money is NUMERIC(12,2) in the database and integer paise in app code,
 * so arithmetic is always exact (docs/01-requirements.md §1).
 */

export type Paise = number;

const AMOUNT = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/** "1234.5" / Decimal / number with ≤2 decimals → 123450 paise. */
export function toPaise(value: string | number | { toString(): string }): Paise {
  const s = typeof value === "string" ? value.trim() : value.toString();
  const negative = s.startsWith("-");
  const m = AMOUNT.exec(negative ? s.slice(1) : s);
  if (!m) throw new Error(`Invalid amount: ${s}`);
  const paise = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return negative ? -paise : paise;
}

/** 123450 → "1234.50" (for writing to a NUMERIC column). */
export function fromPaise(paise: Paise): string {
  if (!Number.isSafeInteger(paise)) throw new Error(`Invalid paise: ${paise}`);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12345600 → "₹1,23,456.00" (Indian grouping). */
export function formatINR(paise: Paise): string {
  return inr.format(paise / 100);
}

/**
 * Billing engine — PURE functions: no database, no clock ("today" is always
 * passed in). docs/01-requirements.md §1, docs/02-architecture.md §7.
 *
 *   days(issueDate, returnDate) = (returnDate − issueDate) + 1   calendar-inclusive, min 1
 *   lineRent(qty, rate, days)   = qty × rate × days               integer paise, exact
 *
 * No Sunday logic, by explicit requirement. Dates are ISO "YYYY-MM-DD"
 * business dates (Asia/Kolkata calendar days).
 */
import { isIsoDate } from "@/lib/dates";
import type { Paise } from "@/lib/money";

const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;
}

/** Calendar days, both ends included: issued 5 Nov, returned 7 Nov = 3; same day = 1. */
export function days(issueDate: string, returnDate: string): number {
  const d = utcDay(returnDate) - utcDay(issueDate);
  if (d < 0) throw new RangeError(`Return date ${returnDate} is before issue date ${issueDate}`);
  return d + 1;
}

/** Rent for one returned batch, in paise. Rates have at most 2 decimals, so no rounding is ever needed. */
export function lineRent(quantity: number, ratePaise: Paise, dayCount: number): Paise {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError("quantity must be a positive integer");
  if (!Number.isInteger(ratePaise) || ratePaise <= 0) throw new RangeError("rate must be positive paise");
  if (!Number.isInteger(dayCount) || dayCount < 1) throw new RangeError("days must be ≥ 1");
  const rent = quantity * ratePaise * dayCount;
  if (!Number.isSafeInteger(rent)) throw new RangeError("rent out of range");
  return rent;
}

/** Rent accrued so far on pieces still out, counted up to `today` (running statements only). */
export function accruedRent(qtyOutstanding: number, ratePaise: Paise, issueDate: string, today: string): Paise {
  if (qtyOutstanding === 0) return 0;
  return lineRent(qtyOutstanding, ratePaise, days(issueDate, today));
}

export type InvoiceTotals = { rentTotal: Paise; damageTotal: Paise; subtotal: Paise; discount: Paise; total: Paise };

/** total = Σ rent + Σ damage − discount; the discount is a fixed amount, 0 ≤ discount ≤ subtotal. */
export function invoiceTotals(lines: { rent: Paise; damage: Paise }[], discount: Paise = 0): InvoiceTotals {
  let rentTotal = 0;
  let damageTotal = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.rent) || l.rent < 0 || !Number.isInteger(l.damage) || l.damage < 0) {
      throw new RangeError("line amounts must be non-negative paise");
    }
    rentTotal += l.rent;
    damageTotal += l.damage;
  }
  const subtotal = rentTotal + damageTotal;
  if (!Number.isSafeInteger(subtotal)) throw new RangeError("total out of range");
  if (!Number.isInteger(discount) || discount < 0) throw new RangeError("discount must be non-negative paise");
  if (discount > subtotal) throw new RangeError("discount exceeds the invoice amount");
  return { rentTotal, damageTotal, subtotal, discount, total: subtotal - discount };
}

/**
 * Running statement of an open order up to `today`: returned batches carry
 * their recorded rent and charges; pieces still out accrue rent to today.
 */
export function statementTotals(
  returned: { rent: Paise; damage: Paise }[],
  out: { qtyOutstanding: number; ratePaise: Paise; issueDate: string }[],
  today: string,
) {
  const accrued = out.map((o) => accruedRent(o.qtyOutstanding, o.ratePaise, o.issueDate, today));
  const returnedTotals = invoiceTotals(returned);
  const accruedTotal = accrued.reduce((s, a) => s + a, 0);
  return {
    accrued,
    returnedRent: returnedTotals.rentTotal,
    accruedRent: accruedTotal,
    damageTotal: returnedTotals.damageTotal,
    total: returnedTotals.subtotal + accruedTotal,
  };
}

/**
 * balance = amount due − Σ money in + Σ refunds. Positive: the customer owes;
 * negative: the shop holds an excess (refundable once the invoice exists).
 */
export function balance(amountDue: Paise, received: Paise[], refunded: Paise[] = []): Paise {
  const sum = (xs: Paise[]) => xs.reduce((s, x) => s + x, 0);
  return amountDue - sum(received) + sum(refunded);
}

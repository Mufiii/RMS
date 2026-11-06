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

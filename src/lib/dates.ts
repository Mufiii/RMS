/**
 * Business dates are calendar days in Asia/Kolkata, represented as ISO
 * strings "YYYY-MM-DD" in app code and as PostgreSQL DATE in the database.
 */

export const BUSINESS_TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in the business time zone. */
export function businessToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** ISO date → Date at UTC midnight (how Prisma represents a DATE column). */
export function toDbDate(iso: string): Date {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  return new Date(`${iso}T00:00:00Z`);
}

/** Date from a DATE column → ISO date. */
export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Indian financial year (April–March) for a business date, e.g.
 * "2026-11-05" → "2026-27", "2027-03-31" → "2026-27", "2027-04-01" → "2027-28".
 */
export function fiscalYear(iso: string): string {
  if (!isIsoDate(iso)) throw new Error(`Invalid date: ${iso}`);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** DD-MM-YYYY for display and print. */
export function formatDate(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Timestamp in the business time zone, DD-MM-YYYY HH:mm. */
export function formatDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}

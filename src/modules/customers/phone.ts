/**
 * Phone numbers are stored as digits only so duplicates are found reliably,
 * whatever way staff type them: "98470 12345", "+91 98470-12345" and
 * "098470 12345" all become "9847012345". Landlines keep their STD code
 * ("0484 2345678" → "04842345678", 11 digits, so the leading 0 stays).
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) digits = digits.slice(1);
  return digits;
}

export function isValidPhone(normalized: string): boolean {
  return /^[0-9]{6,15}$/.test(normalized);
}

/** "9847012345" → "98470 12345" for display; other lengths are shown as stored. */
export function formatPhone(normalized: string): string {
  return /^[6-9]\d{9}$/.test(normalized) ? `${normalized.slice(0, 5)} ${normalized.slice(5)}` : normalized;
}

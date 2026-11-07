import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .optional()
    .transform((s) => (s ? s : null));
const prefix = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9-]{1,10}$/, "validation.prefixInvalid"));

export const PREFIX_FIELDS = ["orderPrefix", "invoicePrefix", "receiptPrefix", "refundPrefix"] as const;

/** Business settings (docs/03 §settings). Prefixes only affect numbers issued from now on. */
export const settingsSchema = z
  .object({
    businessName: z.string().trim().min(1, "validation.required").max(100, "validation.tooLong"),
    businessNameMl: text(100),
    address: text(300),
    addressMl: text(300),
    phones: text(100),
    email: z
      .string()
      .trim()
      .max(100, "validation.tooLong")
      .optional()
      .transform((s) => (s ? s : null))
      .refine((s) => s === null || z.email().safeParse(s).success, "validation.emailInvalid"),
    orderPrefix: prefix,
    invoicePrefix: prefix,
    receiptPrefix: prefix,
    refundPrefix: prefix,
    invoiceTerms: text(1000),
    invoiceTermsMl: text(1000),
    printPaperWidthMm: z.coerce.number().pipe(z.union([z.literal(58), z.literal(80)], { error: "validation.invalid" })),
    longRentalDays: z.coerce.number({ error: "validation.daysInvalid" }).int("validation.daysInvalid").min(1, "validation.daysInvalid").max(365, "validation.daysInvalid"),
  })
  .superRefine((v, ctx) => {
    // Receipts and refunds share one number column, so equal prefixes would collide.
    const seen = new Map<string, string>();
    for (const f of PREFIX_FIELDS) {
      if (seen.has(v[f])) ctx.addIssue({ code: "custom", path: [f], message: "validation.prefixDuplicate" });
      else seen.set(v[f], f);
    }
  });
export type SettingsInput = z.infer<typeof settingsSchema>;

export const LOGO_MAX_BYTES = 300 * 1024;

/** PNG or JPEG, decided from the file's own bytes (never the browser-supplied type). */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

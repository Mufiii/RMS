import { z } from "zod";

const money = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((s) => s === "" || /^\d{1,9}(\.\d{1,2})?$/.test(s), "validation.amountInvalid")
  .transform((s) => (s === "" ? null : s));
const optionalText = z
  .string()
  .trim()
  .max(500, "validation.tooLong")
  .optional()
  .transform((s) => (s ? s : null));

/** Final invoice; the discount fields are only honoured for admins (checked in the service). */
export const createInvoiceSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  discount: money,
  discountReason: optionalText,
});

export const cancelInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "validation.reasonRequired").max(500, "validation.tooLong"),
  /** "reissue": cancel and issue a new invoice (with the discount below) in one step; "reopen": cancel only. */
  mode: z.enum(["reissue", "reopen"]).default("reopen"),
  discount: money,
  discountReason: optionalText,
});

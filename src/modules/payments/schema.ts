import { z } from "zod";

const amount = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((s) => /^\d{1,9}(\.\d{1,2})?$/.test(s), "validation.amountInvalid")
  .refine((s) => Number(s) > 0, "validation.amountPositive");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .optional()
    .transform((s) => (s ? s : null));

export const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"] as const;

/** Money in (advance/payment) or a refund; the type is decided by the server. */
export const moneySchema = z
  .object({
    orderId: z.coerce.number().int().positive(),
    amount,
    mode: z.enum(PAYMENT_MODES, { error: "validation.invalid" }),
    reference: optionalText(100),
    notes: optionalText(500),
  })
  .refine((v) => v.mode !== "CHEQUE" || v.reference, { path: ["reference"], message: "validation.chequeNumberRequired" });
export type MoneyInput = z.infer<typeof moneySchema>;

export const voidPaymentSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "validation.reasonRequired").max(500, "validation.tooLong"),
});

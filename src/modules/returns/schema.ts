import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

const count = z.number().int().min(0).max(100_000).default(0);
const money = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((s) => s === "" || /^\d{1,9}(\.\d{1,2})?$/.test(s), "validation.amountInvalid");
const note = z.string().trim().max(500).optional().default("");

/**
 * One outstanding issue line on the return form: how many come back in each
 * condition, with the charge and note for damaged / lost pieces.
 */
export const returnEntrySchema = z.object({
  issueLineId: z.number().int().positive(),
  good: count,
  damaged: count,
  lost: count,
  damagedAmount: money,
  damagedNote: note,
  lostAmount: money,
  lostNote: note,
});
export type ReturnEntry = z.infer<typeof returnEntrySchema>;

const entriesField = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return [];
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "validation.invalid" });
      return z.NEVER;
    }
  })
  .pipe(z.array(returnEntrySchema, { error: "validation.invalid" }).max(200, "validation.tooMany"));

export const recordReturnSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  date: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s : null))
    .refine((s) => s === null || isIsoDate(s), "validation.dateInvalid"),
  notes: z
    .string()
    .trim()
    .max(500, "validation.tooLong")
    .optional()
    .transform((s) => (s ? s : null)),
  entries: entriesField,
});

export const voidReturnSchema = z.object({
  returnId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "validation.reasonRequired").max(500, "validation.tooLong"),
});

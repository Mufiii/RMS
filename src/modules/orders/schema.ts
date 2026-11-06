import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

// Messages are translation keys under `validation.*`.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .optional()
    .transform((s) => (s ? s : null));

const id = z.coerce.number().int().positive();

/** Empty = today. Only admins may send another date (checked in the service). */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || isIsoDate(s), "validation.dateInvalid");

export const issueLineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100_000).optional(),
  unitIds: z.array(z.number().int().positive()).max(200).optional(),
});
export type IssueLineInput = z.infer<typeof issueLineSchema>;

/** The items editor posts its lines as one JSON field. */
const linesField = z
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
  .pipe(z.array(issueLineSchema, { error: "validation.invalid" }).max(100, "validation.tooMany"));

export const createOrderSchema = z.object({
  customerId: id,
  siteAddress: optionalText(300),
  notes: optionalText(1000),
  date: optionalDate,
  lines: linesField,
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const issueItemsSchema = z.object({
  orderId: id,
  date: optionalDate,
  notes: optionalText(500),
  lines: linesField.refine((l) => l.length > 0, "validation.noItems"),
});

const reason = z.string().trim().min(3, "validation.reasonRequired").max(500, "validation.tooLong");

export const voidLineSchema = z.object({ lineId: id, reason });
export const cancelOrderSchema = z.object({ orderId: id, reason });

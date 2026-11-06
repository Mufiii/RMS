import { z } from "zod";
import { toPaise } from "@/lib/money";
import { MANUAL_MOVEMENTS, UNIT_ACTIONS } from "./stock";

// Messages are translation keys under `validation.*`.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .optional()
    .transform((s) => (s ? s : null));

const id = z.coerce.number().int().positive();

/** Max daily rate ₹10,00,000 — far above anything rented, well inside NUMERIC(12,2). */
export const MAX_RATE_PAISE = 10_00_000_00;

export const rateSchema = z
  .string()
  .trim()
  .min(1, "validation.required")
  .refine((s) => /^\d{1,7}(\.\d{1,2})?$/.test(s), "validation.rateInvalid")
  .transform((s) => toPaise(s))
  .refine((p) => p > 0 && p <= MAX_RATE_PAISE, "validation.rateInvalid");

export const categorySchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(60, "validation.tooLong"),
  nameMl: optionalText(60),
});

/** One serial per line (or comma-separated); blanks ignored. */
export const serialsSchema = z
  .string()
  .optional()
  .transform((s) =>
    (s ?? "")
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .refine((list) => list.every((x) => x.length <= 40), "validation.serialTooLong")
  .refine((list) => list.length <= 200, "validation.tooMany");

const productFields = {
  categoryId: id,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((s) => (s ? s : null))
    .refine((s) => s === null || /^[A-Z0-9][A-Z0-9-]{0,19}$/.test(s), "validation.codeInvalid"),
  name: z.string().trim().min(1, "validation.required").max(100, "validation.tooLong"),
  nameMl: optionalText(100),
  tracking: z.enum(["SERIALISED", "QUANTITY"], { error: "validation.required" }),
  dailyRate: rateSchema,
  description: optionalText(500),
};

export const productSchema = z.object(productFields);
export type ProductInput = z.infer<typeof productSchema>;

/** Create form also takes the opening stock: a count, or serial numbers. */
export const newProductSchema = z
  .object({
    ...productFields,
    openingQty: z.coerce.number({ error: "validation.qtyInvalid" }).int("validation.qtyInvalid").min(0, "validation.qtyInvalid").max(100_000, "validation.qtyInvalid").optional().default(0),
    serials: serialsSchema,
  })
  .refine((p) => p.tracking === "QUANTITY" || p.openingQty === 0, { path: ["openingQty"], message: "validation.qtyInvalid" })
  .refine((p) => p.tracking === "SERIALISED" || p.serials.length === 0, { path: ["serials"], message: "validation.invalid" });
export type NewProductInput = z.infer<typeof newProductSchema>;

const reason = optionalText(500);

export const quantityAdjustSchema = z.object({
  productId: id,
  type: z.enum(MANUAL_MOVEMENTS, { error: "validation.required" }),
  quantity: z.coerce.number({ error: "validation.qtyInvalid" }).int("validation.qtyInvalid").min(1, "validation.qtyInvalid").max(100_000, "validation.qtyInvalid"),
  direction: z.enum(["increase", "decrease"]).optional().default("increase"),
  reason,
});

export const addUnitsSchema = z.object({
  productId: id,
  type: z.enum(["OPENING", "PURCHASE"]),
  serials: serialsSchema.refine((l) => l.length > 0, "validation.required"),
});

export const unitActionSchema = z.object({
  unitId: id,
  action: z.enum(UNIT_ACTIONS as [string, ...string[]], { error: "validation.required" }),
  reason,
});

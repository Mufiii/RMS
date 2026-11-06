import { z } from "zod";
import { isValidPhone, normalizePhone } from "./phone";

export const ID_PROOF_TYPES = ["AADHAAR", "DRIVING_LICENCE", "VOTER_ID", "PAN", "PASSPORT", "OTHER"] as const;
export type IdProofType = (typeof ID_PROOF_TYPES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const phone = z
  .string()
  .transform(normalizePhone)
  .refine((p) => p.length > 0, "validation.required")
  .refine(isValidPhone, "validation.phoneInvalid");

const optionalPhone = z
  .string()
  .optional()
  .transform((s) => (s ? normalizePhone(s) : ""))
  .refine((p) => p === "" || isValidPhone(p), "validation.phoneInvalid")
  .transform((p) => (p === "" ? null : p));

// Messages are translation keys under `validation.*`.
export const customerSchema = z
  .object({
    name: z.string().trim().min(1, "validation.required").max(100, "validation.tooLong"),
    phone,
    altPhone: optionalPhone,
    address: optionalText(500),
    idProofType: z
      .union([z.enum(ID_PROOF_TYPES), z.literal("")])
      .optional()
      .transform((v) => (v ? v : null)),
    idProofNumber: optionalText(50),
    notes: optionalText(1000),
  })
  .refine((c) => !c.idProofNumber || c.idProofType, {
    path: ["idProofType"],
    message: "validation.idProofTypeRequired",
  })
  .refine((c) => !c.altPhone || c.altPhone !== c.phone, {
    path: ["altPhone"],
    message: "validation.altPhoneSame",
  });

export type CustomerInput = z.infer<typeof customerSchema>;

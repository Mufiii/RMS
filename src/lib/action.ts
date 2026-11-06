import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { DomainError } from "./errors";
import { PASSWORD_MIN_LENGTH } from "@/modules/auth/constants";

import type { FormState } from "./form-state";
export type { FormState };

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !/password/i.test(k)) out[k] = v;
  }
  return out;
}

/** Zod error → first translated message per field. */
export async function zodFieldErrors(error: z.ZodError): Promise<Record<string, string>> {
  const t = await getTranslations();
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (out[key]) continue;
    out[key] = t.has(issue.message)
      ? t(issue.message, { min: PASSWORD_MIN_LENGTH })
      : t("validation.invalid");
  }
  return out;
}

/**
 * Converts a thrown error into a translated FormState. Domain errors show
 * their own message; anything else is logged and shown as a generic failure,
 * so raw database errors never reach the user.
 */
export async function errorState(e: unknown, values?: Record<string, string>): Promise<FormState> {
  const t = await getTranslations();
  if (e instanceof DomainError) {
    const key = `errors.${e.code}`;
    return { ok: false, message: t.has(key) ? t(key, e.params) : t("errors.unexpected"), values };
  }
  console.error(e);
  return { ok: false, message: t("errors.unexpected"), values };
}

"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { DomainError } from "@/lib/errors";
import { requireActionPermission } from "@/modules/auth/session";
import { LOGO_MAX_BYTES, settingsSchema } from "./schema";
import { removeLogo, setLogo, updateSettings } from "./service";

function refresh() {
  // Business name, logo and paper width show on every print slip; the threshold on the dashboard.
  revalidatePath("/", "layout");
}

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("settings.write");
    const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const { changed } = await updateSettings(actor, parsed.data);
    refresh();
    const t = await getTranslations("settings");
    return { ok: true, message: changed.length ? t("saved") : t("noChanges"), values, nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function uploadLogoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionPermission("settings.write");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return errorState(new DomainError("settings.logoMissing"));
    // Refuse oversized uploads before reading them into memory.
    if (file.size > LOGO_MAX_BYTES) return errorState(new DomainError("settings.logoTooBig", { max: `${LOGO_MAX_BYTES / 1024} KB` }));
    await setLogo(actor, new Uint8Array(await file.arrayBuffer()));
    refresh();
    return { ok: true, message: (await getTranslations("settings"))("logoSaved"), nonce: Date.now() };
  } catch (e) {
    return errorState(e);
  }
}

export async function removeLogoAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionPermission("settings.write");
    await removeLogo(actor);
    refresh();
    return { ok: true, message: (await getTranslations("settings"))("logoRemoved"), nonce: Date.now() };
  } catch (e) {
    return errorState(e);
  }
}

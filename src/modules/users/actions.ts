"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { createUserSchema, reasonSchema, resetPasswordSchema, updateUserSchema } from "./schema";
import { createUser, resetPassword, setUserActive, updateUser } from "./service";

function parseId(raw: FormDataEntryValue | null): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  return id;
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let newId: number;
  try {
    const actor = await requireActionPermission("user.manage");
    const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    newId = (await createUser(actor, parsed.data)).id;
  } catch (e) {
    return errorState(e, values);
  }
  revalidatePath("/users");
  redirect(`/users/${newId}?created=1`);
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("user.manage");
    const id = parseId(formData.get("id"));
    const parsed = updateUserSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await updateUser(actor, id, parsed.data);
    revalidatePath("/users");
    return { ok: true, message: (await getTranslations("users"))("updated"), values };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionPermission("user.manage");
    const id = parseId(formData.get("id"));
    const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error) };
    await resetPassword(actor, id, parsed.data.password);
    revalidatePath("/users");
    return { ok: true, message: (await getTranslations("users"))("passwordReset") };
  } catch (e) {
    return errorState(e);
  }
}

export async function setUserActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("user.manage");
    const id = parseId(formData.get("id"));
    const active = formData.get("active") === "true";
    const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await setUserActive(actor, id, active, parsed.data.reason);
    revalidatePath("/users");
    const t = await getTranslations("users");
    return { ok: true, message: active ? t("reactivated") : t("deactivated") };
  } catch (e) {
    return errorState(e, values);
  }
}

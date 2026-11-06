"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { errorState, type FormState } from "@/lib/action";
import { homePath } from "@/lib/permissions";
import { changeOwnPassword, login, setOwnLocale } from "./service";
import {
  clearSessionCookie,
  clientIp,
  getCurrentUser,
  setLocaleCookie,
  setSessionCookie,
} from "./session";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const values = { username };
  let destination: string;
  try {
    const { user, claims } = await login(username, password, await clientIp());
    await setSessionCookie(claims);
    await setLocaleCookie(user.locale);
    destination = user.mustChangePassword ? "/change-password" : homePath(user.role);
  } catch (e) {
    return errorState(e, values);
  }
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
  confirmPassword: z.string(),
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: t("validation.required") };
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    return { ok: false, fieldErrors: { confirmPassword: t("auth.passwordsDontMatch") } };
  }
  try {
    const claims = await changeOwnPassword(user.id, currentPassword, newPassword);
    await setSessionCookie(claims);
  } catch (e) {
    return errorState(e);
  }
  redirect(homePath(user.role));
}

export async function setLocaleAction(locale: "en" | "ml"): Promise<void> {
  const value = locale === "ml" ? "ml" : "en";
  const user = await getCurrentUser();
  if (user) await setOwnLocale(user.id, value);
  await setLocaleCookie(value);
}

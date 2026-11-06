"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { recordReturnSchema, voidReturnSchema } from "./schema";
import { recordReturn, voidReturn } from "./service";

function refresh(orderId?: number) {
  revalidatePath("/orders");
  revalidatePath("/products", "layout");
  revalidatePath("/customers", "layout");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function recordReturnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("return.create");
    const parsed = recordReturnSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await recordReturn(actor, parsed.data);
    refresh(parsed.data.orderId);
    return { ok: true, message: (await getTranslations("returns"))("recorded"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function voidReturnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("record.void");
    const parsed = voidReturnSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await voidReturn(actor, parsed.data);
    refresh(Number(formData.get("orderId")) || undefined);
    return { ok: true, message: (await getTranslations("returns"))("voided"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

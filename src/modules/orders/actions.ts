"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { cancelOrderSchema, createOrderSchema, issueItemsSchema, voidLineSchema } from "./schema";
import { cancelOrder, createOrder, issueItems, voidIssueLine } from "./service";

function refresh(orderId?: number) {
  revalidatePath("/orders");
  revalidatePath("/products", "layout");
  revalidatePath("/customers", "layout");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function createOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let id: number;
  try {
    const actor = await requireActionPermission("order.create");
    const parsed = createOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    if (parsed.data.lines.length > 0) await requireActionPermission("issue.create");
    id = (await createOrder(actor, parsed.data)).id;
  } catch (e) {
    return errorState(e, values);
  }
  refresh();
  redirect(`/orders/${id}?saved=created`);
}

export async function issueItemsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("issue.create");
    const parsed = issueItemsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await issueItems(actor, parsed.data);
    refresh(parsed.data.orderId);
    return { ok: true, message: (await getTranslations("orders"))("issued"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function voidLineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("record.void");
    const parsed = voidLineSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await voidIssueLine(actor, parsed.data);
    refresh(Number(formData.get("orderId")) || undefined);
    return { ok: true, message: (await getTranslations("orders"))("lineVoided"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function cancelOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("record.cancel");
    const parsed = cancelOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await cancelOrder(actor, parsed.data);
    refresh(parsed.data.orderId);
    return { ok: true, message: (await getTranslations("orders"))("cancelled"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

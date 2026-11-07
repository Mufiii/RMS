"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { moneySchema, voidPaymentSchema } from "./schema";
import { recordPayment, recordRefund, voidPayment } from "./service";

function refresh(orderId: number) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/payments");
  revalidatePath("/customers", "layout");
}

async function money(kind: "payment" | "refund", formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let saved: { id: number; orderId: number };
  try {
    const actor = await requireActionPermission(kind === "refund" ? "refund.create" : "payment.create");
    const parsed = moneySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    saved = await (kind === "refund" ? recordRefund : recordPayment)(actor, parsed.data);
  } catch (e) {
    return errorState(e, values);
  }
  refresh(saved.orderId);
  // Back on the order, with a link to print the receipt.
  redirect(`/orders/${saved.orderId}?saved=${kind}&receipt=${saved.id}`);
}

export async function recordPaymentAction(_prev: FormState, formData: FormData) {
  return money("payment", formData);
}

export async function recordRefundAction(_prev: FormState, formData: FormData) {
  return money("refund", formData);
}

export async function voidPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("record.void");
    const parsed = voidPaymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await voidPayment(actor, parsed.data);
    refresh(Number(formData.get("orderId")) || 0);
    return { ok: true, message: (await getTranslations("payments"))("voided"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

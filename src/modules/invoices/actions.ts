"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { cancelInvoiceSchema, createInvoiceSchema } from "./schema";
import { cancelInvoice, createInvoice } from "./service";

function refresh(orderId: number) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/invoices", "layout");
  revalidatePath("/customers", "layout");
}

export async function createInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let invoice: { id: number; orderId: number };
  try {
    const actor = await requireActionPermission("invoice.create");
    const parsed = createInvoiceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    if (parsed.data.discount) await requireActionPermission("invoice.discount");
    invoice = await createInvoice(actor, parsed.data);
  } catch (e) {
    return errorState(e, values);
  }
  refresh(invoice.orderId);
  redirect(`/invoices/${invoice.id}?saved=created`);
}

export async function cancelInvoiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let result: { orderId: number; reissuedId: number | null };
  try {
    const actor = await requireActionPermission("record.cancel");
    const parsed = cancelInvoiceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const { invoiceId, reason, mode, discount, discountReason } = parsed.data;
    const { orderId, reissued } = await cancelInvoice(actor, {
      invoiceId,
      reason,
      reissue: mode === "reissue" ? { amount: discount, reason: discountReason } : null,
    });
    result = { orderId, reissuedId: reissued?.id ?? null };
  } catch (e) {
    return errorState(e, values);
  }
  refresh(result.orderId);
  redirect(result.reissuedId ? `/invoices/${result.reissuedId}?saved=reissued` : `/orders/${result.orderId}?saved=invoiceCancelled`);
}

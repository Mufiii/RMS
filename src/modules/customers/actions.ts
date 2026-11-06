"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import type { CustomerFormState } from "./form-state";
import { customerSchema } from "./schema";
import { createCustomer, DuplicatePhoneError, setCustomerActive, updateCustomer } from "./service";

function parseId(raw: FormDataEntryValue | null): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  return id;
}

async function duplicateState(e: DuplicatePhoneError, values: Record<string, string>): Promise<CustomerFormState> {
  const t = await getTranslations("customers");
  return { ok: false, message: t("duplicateWarning"), values, duplicates: e.matches };
}

export async function createCustomerAction(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const values = formValues(formData);
  let id: number;
  try {
    const actor = await requireActionPermission("customer.write");
    const parsed = customerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const confirmDuplicate = formData.get("confirmDuplicate") === "1";
    id = (await createCustomer(actor, parsed.data, { confirmDuplicate })).id;
  } catch (e) {
    if (e instanceof DuplicatePhoneError) return duplicateState(e, values);
    return errorState(e, values);
  }
  revalidatePath("/customers");
  redirect(`/customers/${id}?saved=created`);
}

export async function updateCustomerAction(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const values = formValues(formData);
  let id: number;
  try {
    const actor = await requireActionPermission("customer.write");
    id = parseId(formData.get("id"));
    const parsed = customerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const confirmDuplicate = formData.get("confirmDuplicate") === "1";
    await updateCustomer(actor, id, parsed.data, { confirmDuplicate });
  } catch (e) {
    if (e instanceof DuplicatePhoneError) return duplicateState(e, values);
    return errorState(e, values);
  }
  revalidatePath("/customers");
  redirect(`/customers/${id}?saved=updated`);
}

const toggleSchema = z.object({
  reason: z.string().trim().max(500, "validation.tooLong").optional(),
});

export async function setCustomerActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("customer.write");
    const id = parseId(formData.get("id"));
    const active = formData.get("active") === "true";
    const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await setCustomerActive(actor, id, active, parsed.data.reason || null);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    const t = await getTranslations("customers");
    return { ok: true, message: active ? t("reactivated") : t("deactivated") };
  } catch (e) {
    return errorState(e, values);
  }
}

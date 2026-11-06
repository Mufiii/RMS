"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { categorySchema, newProductSchema, productSchema } from "@/modules/inventory/schema";
import { createCategory, createProduct, setCategoryActive, setProductActive, updateCategory, updateProduct } from "./service";

const idOf = (raw: FormDataEntryValue | null) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid id");
  return id;
};

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("product.write");
    const parsed = categorySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const rawId = formData.get("id");
    if (rawId) await updateCategory(actor, idOf(rawId), parsed.data);
    else await createCategory(actor, parsed.data);
    revalidatePath("/products", "layout");
    const t = await getTranslations("categories");
    return { ok: true, message: rawId ? t("updated") : t("created"), nonce: Date.now() };
  } catch (e) {
    return errorState(e, values);
  }
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const actor = await requireActionPermission("product.write");
  await setCategoryActive(actor, idOf(formData.get("id")), formData.get("active") === "true");
  revalidatePath("/products", "layout");
}

// ------------------------------------------------------------------ products

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let id: number;
  try {
    const actor = await requireActionPermission("product.write");
    const parsed = newProductSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    id = (await createProduct(actor, parsed.data)).id;
  } catch (e) {
    return errorState(e, values);
  }
  revalidatePath("/products");
  redirect(`/products/${id}?saved=created`);
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  let id: number;
  try {
    id = idOf(formData.get("id"));
    const parsed = productSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    // Changing the rate needs rate.write as well (both are admin-only today).
    const actor = await requireActionPermission("product.write");
    await requireActionPermission("rate.write");
    await updateProduct(actor, id, parsed.data);
  } catch (e) {
    return errorState(e, values);
  }
  revalidatePath("/products");
  redirect(`/products/${id}?saved=updated`);
}

const toggleSchema = z.object({ reason: z.string().trim().max(500, "validation.tooLong").optional() });

export async function toggleProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("product.write");
    const id = idOf(formData.get("id"));
    const active = formData.get("active") === "true";
    const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await setProductActive(actor, id, active, parsed.data.reason || null);
    revalidatePath("/products", "layout");
    const t = await getTranslations("products");
    return { ok: true, message: active ? t("reactivated") : t("deactivated") };
  } catch (e) {
    return errorState(e, values);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorState, formValues, zodFieldErrors, type FormState } from "@/lib/action";
import { requireActionPermission } from "@/modules/auth/session";
import { addUnitsSchema, quantityAdjustSchema, unitActionSchema } from "./schema";
import { addUnits, adjustQuantity, unitAction } from "./service";
import type { UnitAction } from "./stock";

async function done(productId: number, key: "adjusted" | "unitsAdded" | "unitUpdated", count?: number): Promise<FormState> {
  revalidatePath("/products", "layout");
  revalidatePath(`/products/${productId}`);
  const t = await getTranslations("stock");
  return { ok: true, message: t(key, { count: count ?? 1 }), nonce: Date.now() };
}

export async function adjustQuantityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("stock.adjust");
    const parsed = quantityAdjustSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    await adjustQuantity(actor, parsed.data);
    return done(parsed.data.productId, "adjusted");
  } catch (e) {
    return errorState(e, values);
  }
}

export async function addUnitsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("stock.adjust");
    const parsed = addUnitsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const units = await addUnits(actor, parsed.data);
    return done(parsed.data.productId, "unitsAdded", units.length);
  } catch (e) {
    return errorState(e, values);
  }
}

export async function unitActionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  try {
    const actor = await requireActionPermission("stock.adjust");
    const parsed = unitActionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: await zodFieldErrors(parsed.error), values };
    const m = await unitAction(actor, { ...parsed.data, action: parsed.data.action as UnitAction });
    return done(m.productId, "unitUpdated");
  } catch (e) {
    return errorState(e, values);
  }
}

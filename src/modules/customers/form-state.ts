import type { FormState } from "@/lib/form-state";

export type DuplicateView = { id: number; name: string; phone: string; isActive: boolean };

/** Customer form state: adds the duplicate-phone matches the user must confirm. */
export type CustomerFormState = FormState & { duplicates?: DuplicateView[] };

export const initialCustomerFormState: CustomerFormState = { ok: false };

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { createCustomerAction, updateCustomerAction } from "@/modules/customers/actions";
import { type CustomerFormState, initialCustomerFormState } from "@/modules/customers/form-state";
import { formatPhone } from "@/modules/customers/phone";
import { ID_PROOF_TYPES } from "@/modules/customers/schema";

export type CustomerFormDefaults = {
  id?: number;
  name: string;
  phone: string;
  altPhone: string;
  address: string;
  idProofType: string;
  idProofNumber: string;
  notes: string;
};

function TextArea({ label, name, defaultValue, error }: { label: string; name: string; defaultValue: string; error?: string }) {
  const id = `f-${name}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} defaultValue={defaultValue} rows={2} aria-invalid={error ? true : undefined} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function CustomerForm({ defaults }: { defaults: CustomerFormDefaults }) {
  const t = useTranslations();
  const isEdit = defaults.id != null;
  const [state, action] = useActionState<CustomerFormState, FormData>(
    isEdit ? updateCustomerAction : createCustomerAction,
    initialCustomerFormState,
  );
  // After an error, keep what the user typed; otherwise show the saved values.
  const v = { ...defaults, ...(state.values ?? {}) };
  const err = state.fieldErrors ?? {};
  const dups = state.duplicates ?? [];

  return (
    <Card className="max-w-2xl">
      <CardContent>
        {/* key resets uncontrolled inputs to the echoed values after each submit */}
        <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
          {isEdit && <input type="hidden" name="id" value={defaults.id} />}

          {dups.length > 0 ? (
            <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-start gap-2 font-medium text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {state.message}
              </p>
              <ul className="mt-2 space-y-1 pl-6">
                {dups.map((d) => (
                  <li key={d.id}>
                    <Link href={`/customers/${d.id}`} target="_blank" className="underline underline-offset-4">
                      #{d.id} {d.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {formatPhone(d.phone)}
                      {!d.isActive && ` · ${t("customers.inactiveBadge")}`}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2 pl-6">
                <input type="checkbox" name="confirmDuplicate" value="1" className="size-4" />
                {t("customers.duplicateConfirm")}
              </label>
            </div>
          ) : (
            <FormMessage message={state.message} />
          )}

          <Field label={t("customers.name")} name="name" required defaultValue={v.name} error={err.name} autoFocus={!isEdit} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("customers.phone")}
              name="phone"
              type="tel"
              inputMode="tel"
              required
              defaultValue={v.phone}
              error={err.phone}
            />
            <Field
              label={t("customers.altPhone")}
              name="altPhone"
              type="tel"
              inputMode="tel"
              defaultValue={v.altPhone}
              error={err.altPhone}
            />
          </div>
          <TextArea label={t("customers.address")} name="address" defaultValue={v.address} error={err.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("customers.idProofType")}
              name="idProofType"
              defaultValue={v.idProofType}
              error={err.idProofType}
              options={[
                { value: "", label: t("customers.idProofNone") },
                ...ID_PROOF_TYPES.map((p) => ({ value: p, label: t(`customers.idProof.${p}`) })),
              ]}
            />
            <Field
              label={t("customers.idProofNumber")}
              name="idProofNumber"
              defaultValue={v.idProofNumber}
              error={err.idProofNumber}
              autoComplete="off"
            />
          </div>
          <TextArea label={t("customers.notes")} name="notes" defaultValue={v.notes} error={err.notes} />

          <div className="flex gap-2">
            <SubmitButton>{isEdit ? t("common.save") : t("common.create")}</SubmitButton>
            <Link
              href={isEdit ? `/customers/${defaults.id}` : "/customers"}
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-10" })}
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

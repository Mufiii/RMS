"use client";

import Link from "next/link";
import { useActionState, useState, useId } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { createProductAction, updateProductAction } from "@/modules/products/actions";

export type ProductFormDefaults = {
  id?: number;
  categoryId: string;
  code: string;
  name: string;
  nameMl: string;
  tracking: "SERIALISED" | "QUANTITY";
  dailyRate: string;
  description: string;
};

function TextArea({
  label,
  name,
  defaultValue,
  error,
  hint,
  rows = 2,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  rows?: number;
}) {
  const id = `f-${name}-${useId()}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} defaultValue={defaultValue} rows={rows} aria-invalid={error ? true : undefined} />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ProductForm({
  defaults,
  categories,
  trackingLocked = false,
}: {
  defaults: ProductFormDefaults;
  categories: { id: number; label: string }[];
  trackingLocked?: boolean;
}) {
  const t = useTranslations();
  const isEdit = defaults.id != null;
  const [state, action] = useActionState(isEdit ? updateProductAction : createProductAction, initialFormState);
  const v = { ...defaults, ...(state.values ?? {}) } as ProductFormDefaults & { openingQty?: string; serials?: string };
  const err = state.fieldErrors ?? {};
  const [tracking, setTracking] = useState<string>(v.tracking);

  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
          {isEdit && <input type="hidden" name="id" value={defaults.id} />}
          <FormMessage message={state.message} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t("products.category")}
              name="categoryId"
              required
              defaultValue={v.categoryId}
              error={err.categoryId && t("validation.required")}
              options={[{ value: "", label: t("products.chooseCategory") }, ...categories.map((c) => ({ value: String(c.id), label: c.label }))]}
            />
            <Field
              label={t("products.code")}
              name="code"
              defaultValue={v.code}
              error={err.code}
              hint={t("products.codeHint")}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("products.name")} name="name" required defaultValue={v.name} error={err.name} />
            <Field label={t("products.nameMl")} name="nameMl" defaultValue={v.nameMl} error={err.nameMl} lang="ml" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <SelectField
                label={t("products.tracking")}
                name="tracking"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                disabled={trackingLocked}
                options={[
                  { value: "QUANTITY", label: t("products.trackingType.QUANTITY") },
                  { value: "SERIALISED", label: t("products.trackingType.SERIALISED") },
                ]}
              />
              {trackingLocked && (
                <>
                  <input type="hidden" name="tracking" value={tracking} />
                  <p className="text-xs text-muted-foreground">{t("products.trackingLockedHint")}</p>
                </>
              )}
            </div>
            <Field
              label={t("products.dailyRate")}
              name="dailyRate"
              inputMode="decimal"
              required
              defaultValue={v.dailyRate}
              error={err.dailyRate}
              hint={isEdit ? t("products.rateHint") : undefined}
            />
          </div>

          {!isEdit &&
            (tracking === "QUANTITY" ? (
              <Field
                label={t("products.openingQty")}
                name="openingQty"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                defaultValue={v.openingQty ?? "0"}
                error={err.openingQty}
                hint={t("products.openingQtyHint")}
              />
            ) : (
              <TextArea
                label={t("products.serials")}
                name="serials"
                rows={4}
                defaultValue={v.serials}
                error={err.serials}
                hint={t("products.serialsHint")}
              />
            ))}

          <TextArea label={t("products.description")} name="description" defaultValue={v.description} error={err.description} />

          <div className="flex gap-2">
            <SubmitButton>{isEdit ? t("common.save") : t("common.create")}</SubmitButton>
            <Link
              href={isEdit ? `/products/${defaults.id}` : "/products"}
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

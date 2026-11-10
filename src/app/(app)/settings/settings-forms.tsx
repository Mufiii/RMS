"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Label } from "@/components/ui/label";
import { initialFormState } from "@/lib/form-state";
import { formatOrderNo } from "@/lib/order-number";
import { removeLogoAction, updateSettingsAction, uploadLogoAction } from "@/modules/settings/actions";

export type SettingsValues = {
  businessName: string;
  businessNameMl: string | null;
  address: string | null;
  addressMl: string | null;
  phones: string | null;
  email: string | null;
  orderPrefix: string;
  invoicePrefix: string;
  receiptPrefix: string;
  refundPrefix: string;
  invoiceTerms: string | null;
  invoiceTermsMl: string | null;
  printPaperWidthMm: number;
  longRentalDays: number;
};

function TextArea({ label, name, defaultValue, error, maxLength }: { label: string; name: string; defaultValue?: string; error?: string; maxLength: number }) {
  const id = `f-${name}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SettingsForm({ initial, fiscalYear }: { initial: SettingsValues; fiscalYear: string }) {
  const t = useTranslations("settings");
  const [state, action] = useActionState(updateSettingsAction, initialFormState);
  const err = state.fieldErrors ?? {};
  // After a save or a failed save, show what was submitted; otherwise the stored values.
  const v = (k: keyof SettingsValues) => state.values?.[k] ?? String(initial[k] ?? "");
  const [prefixes, setPrefixes] = useState({
    orderPrefix: v("orderPrefix"),
    invoicePrefix: v("invoicePrefix"),
    receiptPrefix: v("receiptPrefix"),
    refundPrefix: v("refundPrefix"),
  });
  const example = (k: keyof typeof prefixes) =>
    k === "orderPrefix"
      ? formatOrderNo(prefixes[k].toUpperCase(), 1)
      : `${(prefixes[k] || "…").toUpperCase()}/${fiscalYear}/0001`;

  return (
    <form action={action} className="grid gap-4">
      <FormMessage message={state.message} ok={state.ok} />

      <Card>
        <CardHeader>
          <CardTitle>{t("businessTitle")}</CardTitle>
          <CardDescription>{t("businessHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("businessName")} name="businessName" required maxLength={100} defaultValue={v("businessName")} error={err.businessName} />
          <Field label={t("businessNameMl")} name="businessNameMl" maxLength={100} defaultValue={v("businessNameMl")} error={err.businessNameMl} />
          <TextArea label={t("address")} name="address" maxLength={300} defaultValue={v("address")} error={err.address} />
          <TextArea label={t("addressMl")} name="addressMl" maxLength={300} defaultValue={v("addressMl")} error={err.addressMl} />
          <Field label={t("phones")} name="phones" maxLength={100} defaultValue={v("phones")} error={err.phones} hint={t("phonesHint")} />
          <Field label={t("email")} name="email" type="email" maxLength={100} defaultValue={v("email")} error={err.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("numbersTitle")}</CardTitle>
          <CardDescription>{t("numbersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {(["orderPrefix", "invoicePrefix", "receiptPrefix", "refundPrefix"] as const).map((k) => (
            <Field
              key={k}
              label={t(k)}
              name={k}
              required
              maxLength={10}
              pattern="[A-Za-z0-9\-]{1,10}"
              className="uppercase"
              value={prefixes[k]}
              onChange={(e) => setPrefixes((p) => ({ ...p, [k]: e.target.value.toUpperCase() }))}
              error={err[k]}
              hint={<span className="font-mono">{example(k)}</span>}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("printTitle")}</CardTitle>
          <CardDescription>{t("printHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("paperWidth")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {[80, 58].map((w) => (
                <label key={w} className="flex items-center gap-2">
                  <input type="radio" name="printPaperWidthMm" value={w} defaultChecked={v("printPaperWidthMm") === String(w)} className="size-4" />
                  {t(w === 80 ? "paper80" : "paper58")}
                </label>
              ))}
            </div>
            {err.printPaperWidthMm && <p className="text-sm text-destructive">{err.printPaperWidthMm}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea label={t("invoiceTerms")} name="invoiceTerms" maxLength={1000} defaultValue={v("invoiceTerms")} error={err.invoiceTerms} />
            <TextArea label={t("invoiceTermsMl")} name="invoiceTermsMl" maxLength={1000} defaultValue={v("invoiceTermsMl")} error={err.invoiceTermsMl} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label={t("longRentalDays")}
            name="longRentalDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            required
            defaultValue={v("longRentalDays")}
            error={err.longRentalDays}
            hint={t("longRentalHint")}
            className="max-w-48"
          />
        </CardContent>
      </Card>

      <SubmitButton className="justify-self-start" size="lg">
        {t("save")}
      </SubmitButton>
    </form>
  );
}

export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const t = useTranslations("settings");
  const [upload, uploadAction] = useActionState(uploadLogoAction, initialFormState);
  const [remove, removeAction] = useActionState(removeLogoAction, initialFormState);
  const last = (remove.nonce ?? 0) > (upload.nonce ?? 0) ? remove : upload;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logoTitle")}</CardTitle>
        <CardDescription>{t("logoHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormMessage message={last.message} ok={last.ok} />
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stored upload of unknown size; next/image would need dimensions
          <img src={logoUrl} alt={t("logoAlt")} className="max-h-24 max-w-60 rounded border bg-white object-contain p-2" data-testid="logo-preview" />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noLogo")}</p>
        )}
        <form key={upload.nonce ?? "u"} action={uploadAction} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="f-logo">{t("chooseLogo")}</Label>
            <input id="f-logo" name="logo" type="file" accept="image/png,image/jpeg" required className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5" />
          </div>
          <SubmitButton variant="outline">{t("uploadLogo")}</SubmitButton>
        </form>
        {logoUrl && (
          <form action={removeAction}>
            <SubmitButton variant="ghost" className="text-destructive">
              {t("removeLogo")}
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

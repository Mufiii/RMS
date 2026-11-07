"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { cancelInvoiceAction, createInvoiceAction } from "@/modules/invoices/actions";

function DiscountFields({ err, values }: { err: Record<string, string>; values?: Record<string, string> }) {
  const t = useTranslations("invoices");
  return (
    <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
      <Field
        label={t("discount")}
        name="discount"
        inputMode="decimal"
        pattern="\d{1,9}(\.\d{1,2})?"
        defaultValue={values?.discount}
        error={err.discount}
        hint={t("discountHint")}
      />
      <Field label={t("discountReason")} name="discountReason" maxLength={500} defaultValue={values?.discountReason} error={err.discountReason} />
    </div>
  );
}

export function GenerateInvoiceForm({ orderId, total, canDiscount }: { orderId: number; total: string; canDiscount: boolean }) {
  const t = useTranslations("invoices");
  const [state, action] = useActionState(createInvoiceAction, initialFormState);
  const err = state.fieldErrors ?? {};
  return (
    <Card className="border-emerald-500/40 lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("generateTitle")}</CardTitle>
        <CardDescription>{t("generateHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          <p className="text-sm">
            {t("total")}: <b className="tabular-nums">{total}</b>
          </p>
          {canDiscount && <DiscountFields err={err} values={state.values} />}
          <SubmitButton className="justify-self-start">{t("generate")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function CancelInvoiceForm({ invoiceId }: { invoiceId: number }) {
  const t = useTranslations("invoices");
  const [state, action] = useActionState(cancelInvoiceAction, initialFormState);
  const err = state.fieldErrors ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cancelTitle")}</CardTitle>
        <CardDescription>{t("cancelHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} defaultValue={state.values?.reason} error={err.reason} />
          <DiscountFields err={err} values={state.values} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="mode" value="reissue" variant="destructive">
              {t("reissue")}
            </SubmitButton>
            <SubmitButton name="mode" value="reopen" variant="outline">
              {t("reopen")}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

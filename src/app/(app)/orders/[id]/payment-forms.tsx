"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { recordPaymentAction, recordRefundAction, voidPaymentAction } from "@/modules/payments/actions";
import { PAYMENT_MODES } from "@/modules/payments/schema";

function MoneyFields({ state }: { state: FormState }) {
  const t = useTranslations("payments");
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label={t("amount")}
        name="amount"
        inputMode="decimal"
        required
        pattern="\d{1,9}(\.\d{1,2})?"
        defaultValue={v.amount}
        error={err.amount}
      />
      <SelectField
        label={t("modeLabel")}
        name="mode"
        defaultValue={v.mode ?? "CASH"}
        error={err.mode}
        options={PAYMENT_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
      />
      <Field label={t("reference")} name="reference" maxLength={100} defaultValue={v.reference} error={err.reference} />
      <Field label={t("notes")} name="notes" maxLength={500} defaultValue={v.notes} error={err.notes} />
    </div>
  );
}

/** Advance (no invoice yet) or payment against the final invoice; the server decides which. */
export function PaymentForm({ orderId, isAdvance, due }: { orderId: number; isAdvance: boolean; due: string | null }) {
  const t = useTranslations("payments");
  const [state, action] = useActionState(recordPaymentAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAdvance ? t("recordAdvance") : t("recordPayment")}</CardTitle>
        <CardDescription>{isAdvance ? t("advanceHint") : t("dueHint", { due: due ?? "" })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          <MoneyFields state={state} />
          <SubmitButton className="justify-self-start">{t("save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function RefundForm({ orderId, excess }: { orderId: number; excess: string }) {
  const t = useTranslations("payments");
  const [state, action] = useActionState(recordRefundAction, initialFormState);
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle>{t("refundTitle")}</CardTitle>
        <CardDescription>{t("refundHint", { excess })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          <MoneyFields state={state} />
          <SubmitButton className="justify-self-start">{t("refund")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function VoidPaymentForm({ orderId, payments }: { orderId: number; payments: { id: number; label: string }[] }) {
  const t = useTranslations("payments");
  const [state, action] = useActionState(voidPaymentAction, initialFormState);
  if (payments.length === 0 && !state.message) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("voidTitle")}</CardTitle>
        <CardDescription>{t("voidHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          {payments.length > 0 && (
            <>
              <SelectField label={t("choosePayment")} name="paymentId" options={payments.map((p) => ({ value: String(p.id), label: p.label }))} />
              <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} error={state.fieldErrors?.reason} />
              <SubmitButton variant="destructive" className="justify-self-start">
                {t("void")}
              </SubmitButton>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { cancelOrderAction, issueItemsAction, voidLineAction } from "@/modules/orders/actions";
import { type EditorProduct, ItemsEditor } from "../items-editor";

export function IssueForm({
  orderId,
  products,
  canBackdate,
  today,
  minDate,
}: {
  orderId: number;
  products: EditorProduct[];
  canBackdate: boolean;
  today: string;
  minDate: string;
}) {
  const t = useTranslations("orders");
  const [state, action] = useActionState(issueItemsAction, initialFormState);
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("issueTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Remount after success so the editor starts empty again. */}
        <form key={state.nonce ?? "form"} action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          <ItemsEditor products={products} error={err.lines} />
          <Field label={t("issueNotes")} name="notes" maxLength={500} defaultValue={v.notes} error={err.notes} />
          {canBackdate && (
            <Field
              label={t("date")}
              name="date"
              type="date"
              min={minDate}
              max={today}
              defaultValue={v.date ?? today}
              error={err.date}
              hint={t("dateHint")}
              className="max-w-xs"
            />
          )}
          <SubmitButton className="justify-self-start">{t("issue")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function VoidLineForm({ orderId, lines }: { orderId: number; lines: { id: number; label: string }[] }) {
  const t = useTranslations("orders");
  const [state, action] = useActionState(voidLineAction, initialFormState);
  if (lines.length === 0 && !state.message) return null;
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
          {lines.length > 0 && (
            <>
              <SelectField label={t("chooseLine")} name="lineId" options={lines.map((l) => ({ value: String(l.id), label: l.label }))} />
              <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} error={state.fieldErrors?.reason} />
              <SubmitButton variant="destructive" className="justify-self-start">
                {t("voidLine")}
              </SubmitButton>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function CancelOrderForm({ orderId }: { orderId: number }) {
  const t = useTranslations("orders");
  const [state, action] = useActionState(cancelOrderAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cancelTitle")}</CardTitle>
        <CardDescription>{t("cancelHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field label={t("reason")} name="reason" required minLength={3} maxLength={500} error={state.fieldErrors?.reason} />
          <SubmitButton variant="destructive" className="justify-self-start">
            {t("cancel")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

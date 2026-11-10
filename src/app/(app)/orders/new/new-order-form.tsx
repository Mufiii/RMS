"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { createOrderAction } from "@/modules/orders/actions";
import { type EditorProduct, ItemsEditor } from "../items-editor";

export function NewOrderForm({
  customer,
  products,
  canBackdate,
  today,
}: {
  customer: { id: number; name: string; phone: string; address: string | null };
  products: EditorProduct[];
  canBackdate: boolean;
  today: string;
}) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const [state, action] = useActionState(createOrderAction, initialFormState);
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  return (
    <Card className="max-w-3xl">
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="customerId" value={customer.id} />
          <FormMessage message={state.message} />

          <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3">
            <div>
              <div className="text-xs text-muted-foreground">{t("customer")}</div>
              <div className="font-medium">
                #{customer.id} {customer.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {customer.phone}
                {customer.address ? ` · ${customer.address}` : ""}
              </div>
            </div>
            <Link href="/orders/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("change")}
            </Link>
          </div>

          <ItemsEditor products={products} error={err.lines} />

          <Field label={t("siteAddress")} name="siteAddress" defaultValue={v.siteAddress} error={err.siteAddress} maxLength={300} />
          <Field label={t("notes")} name="notes" defaultValue={v.notes} error={err.notes} maxLength={1000} />
          {canBackdate && (
            <Field
              label={t("date")}
              name="date"
              type="date"
              max={today}
              defaultValue={v.date ?? today}
              error={err.date}
              hint={t("dateHint")}
              className="max-w-xs"
            />
          )}

          <div className="flex gap-2">
            <SubmitButton>{t("createAndIssue")}</SubmitButton>
            <Link href="/orders" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10" })}>
              {tc("cancel")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

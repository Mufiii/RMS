"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { setCustomerActiveAction } from "@/modules/customers/actions";

export function ToggleCustomerForm({ customerId, isActive }: { customerId: number; isActive: boolean }) {
  const t = useTranslations("customers");
  const [state, action] = useActionState(setCustomerActiveAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isActive ? t("deactivate") : t("reactivate")}</CardTitle>
        <CardDescription>{isActive ? t("deactivateHint") : t("reactivateHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={customerId} />
          <input type="hidden" name="active" value={isActive ? "false" : "true"} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field label={t("reasonOptional")} name="reason" maxLength={500} error={state.fieldErrors?.reason} />
          <SubmitButton variant={isActive ? "destructive" : "outline"} className="justify-self-start">
            {isActive ? t("deactivate") : t("reactivate")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

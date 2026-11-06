"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { changePasswordAction, logoutAction } from "@/modules/auth/actions";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.changePasswordTitle")}</CardTitle>
        {forced && <CardDescription>{t("auth.changePasswordHint")}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={action} className="grid gap-4">
          <FormMessage message={state.message} />
          <Field
            label={t("auth.currentPassword")}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            label={t("auth.newPassword")}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint={t("validation.passwordLength", { min: 8 })}
          />
          <Field
            label={t("auth.confirmPassword")}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            error={state.fieldErrors?.confirmPassword}
          />
          <SubmitButton className="w-full">{t("auth.changePassword")}</SubmitButton>
        </form>
        <form action={logoutAction}>
          <button type="submit" className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline">
            {t("nav.logout")}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

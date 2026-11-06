"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { loginAction } from "@/modules/auth/actions";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("loginTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage message={state.message} />
          <Field
            label={t("username")}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            defaultValue={state.values?.username}
            autoFocus
          />
          <Field label={t("password")} name="password" type="password" autoComplete="current-password" required />
          <SubmitButton className="w-full">{t("signIn")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

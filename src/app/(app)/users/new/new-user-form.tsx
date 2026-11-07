"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { createUserAction } from "@/modules/users/actions";

export function NewUserForm() {
  const t = useTranslations();
  const [state, action] = useActionState(createUserAction, initialFormState);
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  return (
    <Card className="max-w-3xl">
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormMessage message={state.message} />
          <Field label={t("users.fullName")} name="fullName" required defaultValue={v.fullName} error={err.fullName} />
          <Field
            label={t("users.username")}
            name="username"
            required
            autoCapitalize="none"
            autoComplete="off"
            defaultValue={v.username}
            error={err.username}
          />
          <SelectField
            label={t("users.role")}
            name="role"
            defaultValue={v.role ?? "STAFF"}
            error={err.role}
            options={[
              { value: "STAFF", label: t("roles.STAFF") },
              { value: "ADMIN", label: t("roles.ADMIN") },
            ]}
          />
          <Field
            label={t("users.initialPassword")}
            name="password"
            type="text"
            autoComplete="off"
            required
            minLength={8}
            error={err.password}
            hint={t("users.initialPasswordHint")}
          />
          <div className="flex gap-2">
            <SubmitButton>{t("common.create")}</SubmitButton>
            <Link href="/users" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10" })}>
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

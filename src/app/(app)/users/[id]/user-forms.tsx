"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage, SelectField, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { resetPasswordAction, setUserActiveAction, updateUserAction } from "@/modules/users/actions";

export function EditUserForm({
  user,
  isSelf,
}: {
  user: { id: number; fullName: string; role: "ADMIN" | "STAFF" };
  isSelf: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(updateUserAction, initialFormState);
  const v = state.values ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.editTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={user.id} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field
            label={t("users.fullName")}
            name="fullName"
            required
            defaultValue={v.fullName ?? user.fullName}
            error={state.fieldErrors?.fullName}
          />
          <SelectField
            label={t("users.role")}
            name="role"
            defaultValue={v.role ?? user.role}
            // An admin cannot remove their own admin role (the server enforces this too).
            disabled={isSelf}
            options={[
              { value: "STAFF", label: t("roles.STAFF") },
              { value: "ADMIN", label: t("roles.ADMIN") },
            ]}
          />
          {isSelf && <input type="hidden" name="role" value={user.role} />}
          <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ userId }: { userId: number }) {
  const t = useTranslations();
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.resetPassword")}</CardTitle>
        <CardDescription>{t("users.resetPasswordHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={userId} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field
            label={t("users.temporaryPassword")}
            name="password"
            type="text"
            autoComplete="off"
            required
            minLength={8}
            error={state.fieldErrors?.password}
          />
          <SubmitButton variant="outline" className="justify-self-start">
            {t("users.resetPassword")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function ToggleActiveForm({ userId, isActive }: { userId: number; isActive: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(setUserActiveAction, initialFormState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isActive ? t("users.deactivate") : t("users.reactivate")}</CardTitle>
        <CardDescription>{isActive ? t("users.deactivateHint") : t("users.reactivateHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="id" value={userId} />
          <input type="hidden" name="active" value={isActive ? "false" : "true"} />
          <FormMessage message={state.message} ok={state.ok} />
          <Field
            label={t("common.reason")}
            name="reason"
            required
            minLength={3}
            defaultValue={state.ok ? "" : state.values?.reason}
            error={state.fieldErrors?.reason}
          />
          <SubmitButton variant={isActive ? "destructive" : "outline"} className="justify-self-start">
            {isActive ? t("users.deactivate") : t("users.reactivate")}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

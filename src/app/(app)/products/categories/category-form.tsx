"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form-state";
import { saveCategoryAction } from "@/modules/products/actions";

/** Inline add (no `category`) or rename (with `category`) form. */
export function CategoryForm({ category }: { category?: { id: number; name: string; nameMl: string } }) {
  const t = useTranslations("categories");
  const [state, action] = useActionState(saveCategoryAction, initialFormState);
  const v = state.ok && !category ? {} : (state.values ?? {});
  const err = state.fieldErrors ?? {};
  return (
    <form key={state.nonce ?? "form"} action={action} className="grid gap-2">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="flex flex-wrap gap-2">
        <Input
          name="name"
          required
          aria-label={t("name")}
          placeholder={t("name")}
          defaultValue={v.name ?? category?.name ?? ""}
          aria-invalid={err.name ? true : undefined}
          className="h-10 min-w-40 flex-1"
        />
        <Input
          name="nameMl"
          aria-label={t("nameMl")}
          placeholder={t("nameMl")}
          defaultValue={v.nameMl ?? category?.nameMl ?? ""}
          lang="ml"
          className="h-10 min-w-40 flex-1"
        />
        <SubmitButton variant={category ? "outline" : "default"}>{category ? t("rename") : t("add")}</SubmitButton>
      </div>
      {err.name && <p className="text-sm text-destructive">{err.name}</p>}
      <FormMessage message={state.message} ok={state.ok} />
    </form>
  );
}

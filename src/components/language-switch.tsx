"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { setLocaleAction } from "@/modules/auth/actions";
import { cn } from "@/lib/utils";

/** EN / മലയാളം toggle. Saves to the user's profile (if signed in) and a cookie. */
export function LanguageSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: "en" | "ml") =>
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  return (
    <div className={cn("inline-flex rounded-lg border bg-background p-0.5 text-sm", className)} aria-busy={pending}>
      {(
        [
          ["en", "English"],
          ["ml", "മലയാളം"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={locale === value}
          disabled={pending}
          className={cn(
            "rounded-md px-3 py-1.5 transition-colors",
            locale === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { setLocaleAction } from "@/modules/auth/actions";
import { cn } from "@/lib/utils";

/** EN / മലയാളം toggle. Saves to the user's profile (if signed in) and a cookie. */
export function LanguageSwitch({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: "en" | "ml") =>
    start(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "inline-flex rounded-lg p-0.5 text-sm",
        dark ? "bg-sidebar-accent" : "border bg-card",
        className,
      )}
      aria-busy={pending}
    >
      {(
        [
          ["en", "English"],
          ["ml", "മലയാളം"],
        ] as const
      ).map(([value, label]) => {
        const on = locale === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={on}
            disabled={pending}
            className={cn(
              "min-h-8 flex-1 rounded-md px-3 py-1 transition-colors duration-150",
              on && (dark ? "bg-white font-medium text-sidebar" : "bg-primary font-medium text-primary-foreground"),
              !on && (dark ? "text-sidebar-foreground hover:text-white" : "text-muted-foreground hover:text-foreground"),
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

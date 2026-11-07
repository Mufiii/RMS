import Link from "next/link";
import { cn } from "@/lib/utils";

/** Segmented link tabs for a list filter (All / Active / Inactive …). Works without JavaScript. */
export function FilterTabs({
  label,
  tabs,
  className,
}: {
  label: string;
  tabs: { key: string; label: string; href: string; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm", className)}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors duration-150",
            t.active
              ? "bg-card text-primary shadow-[0_1px_2px_oklch(0.2_0.02_262/0.12)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t.active ? "bg-accent" : "bg-background")}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const NOTICE_TONES = {
  success: { icon: CircleCheck, cls: "border-(--dash-green)/25 bg-(--dash-green)/8 text-(--dash-green)" },
  info: { icon: Info, cls: "border-border bg-card text-foreground [&>svg]:text-primary" },
  warning: { icon: TriangleAlert, cls: "border-(--dash-amber)/30 bg-(--dash-amber)/10 text-[color-mix(in_oklch,var(--dash-amber),black_30%)]" },
  error: { icon: CircleAlert, cls: "border-destructive/25 bg-destructive/8 text-destructive" },
} as const;
export type NoticeTone = keyof typeof NOTICE_TONES;

/**
 * Inline message banner ("Saved", "This order is closed", "Stock doesn't match").
 * A <p> with phrasing content only, so links and buttons can sit inside it.
 */
export function Notice({
  tone,
  children,
  action,
  className,
  role,
  ...props
}: { tone: NoticeTone; children: ReactNode; action?: ReactNode } & Omit<ComponentProps<"p">, "children">) {
  const { icon: Icon, cls } = NOTICE_TONES[tone];
  return (
    <p
      role={role ?? (tone === "error" || tone === "warning" ? "alert" : "status")}
      className={cn("mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm", cls, className)}
      {...props}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-medium">{children}</span>
      {action && <span className="flex flex-wrap items-center gap-2">{action}</span>}
    </p>
  );
}

import { Ban, CircleCheck, CircleDot } from "lucide-react";
import { Pill, type Tone } from "@/components/stat-tile";
import { cn } from "@/lib/utils";

const STYLE: Record<string, { tone: Tone; icon: typeof CircleDot }> = {
  OPEN: { tone: "blue", icon: CircleDot },
  CLOSED: { tone: "green", icon: CircleCheck },
  CANCELLED: { tone: "muted", icon: Ban },
};

/** Order status with an icon, so it never relies on colour alone. */
export function OrderStatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  const s = STYLE[status] ?? STYLE.CANCELLED!;
  const Icon = s.icon;
  return (
    <Pill tone={s.tone} className={className}>
      <Icon aria-hidden />
      {label}
    </Pill>
  );
}

const STAGE_STYLE: Record<string, string> = {
  out: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  partReturned: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  readyToBill: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  unpaid: "bg-destructive/10 text-destructive",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  refundDue: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  cancelled: "bg-muted text-muted-foreground line-through",
};

/** The derived stage (what to do next), as opposed to the stored Open / Closed / Cancelled. */
export function OrderStageBadge({ stage, label, className }: { stage: string; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", STAGE_STYLE[stage], className)}>
      {label}
    </span>
  );
}

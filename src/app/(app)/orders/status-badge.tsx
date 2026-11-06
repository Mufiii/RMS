import { cn } from "@/lib/utils";

const STYLE: Record<string, string> = {
  OPEN: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CLOSED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

export function OrderStatusBadge({ status, label, className }: { status: string; label: string; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", STYLE[status], className)}>{label}</span>;
}

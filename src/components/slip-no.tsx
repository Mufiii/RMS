import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A document number (order, invoice, receipt, customer no.) set like the
 * stamped number on a paper slip: blue, tabular, in a quiet outlined chip.
 */
export function SlipNo({ children, className, muted }: { children: ReactNode; className?: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-px text-[13px] font-semibold tracking-tight whitespace-nowrap tabular-nums",
        muted ? "border-border text-muted-foreground line-through decoration-1" : "border-primary/25 bg-accent/60 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

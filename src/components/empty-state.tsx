import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What a page is for when it has nothing yet, and the button to start. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-primary">
        <Icon className="size-7" />
      </span>
      <p className="text-base font-semibold text-balance">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-pretty text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

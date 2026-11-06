import type { ReactNode } from "react";

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title, step, message }: { title: string; step: number; message: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
        <p>{message}</p>
        <p className="mt-1 text-xs">Step {step}</p>
      </div>
    </>
  );
}

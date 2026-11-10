import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * The page's top bar: title (and optional subtitle) on the left, the page's
 * actions on the right. It bleeds to the edges of <main> and sticks to the top
 * on desktop, so every page shares the same frame and right edge.
 */
export function PageHeader({
  title,
  actions,
  children,
  back,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** A way back to the parent list, shown small above the title. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="z-20 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b bg-card/95 px-4 py-4 backdrop-blur-sm md:sticky md:top-0 md:-mx-8 md:mb-6 md:min-h-[4.5rem] md:px-8 md:py-3">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-0.5 inline-flex items-center gap-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance md:text-[1.375rem]">{title}</h1>
        {children && <div className="mt-0.5 text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title, step, message }: { title: string; step: number; message: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
        <p>{message}</p>
        <p className="mt-1 text-xs">Step {step}</p>
      </div>
    </>
  );
}

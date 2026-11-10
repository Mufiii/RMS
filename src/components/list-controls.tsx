import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** GET search box for a list page; keeps the other filters as hidden fields. */
export function SearchForm({
  action,
  defaultValue,
  placeholder,
  label,
  hidden = {},
  className,
}: {
  action: string;
  defaultValue: string;
  placeholder: string;
  label: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <form role="search" action={action} className={cn("flex flex-1 gap-2", className)}>
      {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <div className="relative flex-1 lg:max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={label}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <Button type="submit" variant="outline" size="lg">
        <span className="sr-only sm:not-sr-only">{label}</span>
        <Search className="sm:hidden" aria-hidden />
      </Button>
    </form>
  );
}

/** Toolbar row on top of a list card: search on the left, filters on the right. */
export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">{children}</div>;
}

/** Footer of a list card: a summary on the left, previous / next on the right. */
export function ListPagination({
  summary,
  prevHref,
  nextHref,
  pageLabel,
  labels,
}: {
  summary: ReactNode;
  prevHref: string | null;
  nextHref: string | null;
  pageLabel?: string;
  labels: { prev: string; next: string };
}) {
  return (
    <nav className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm" aria-label="pagination">
      <span className="text-muted-foreground">{summary}</span>
      {(prevHref || nextHref) && (
        <div className="flex items-center gap-2">
          <PageLink href={prevHref}>
            <ChevronLeft />
            {labels.prev}
          </PageLink>
          {pageLabel && <span className="hidden text-muted-foreground sm:inline">{pageLabel}</span>}
          <PageLink href={nextHref}>
            {labels.next}
            <ChevronRight />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({ href, children }: { href: string | null; children: ReactNode }) {
  const cls = buttonVariants({ variant: "outline", size: "sm" });
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span aria-disabled className={cn(cls, "pointer-events-none opacity-50")}>
      {children}
    </span>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Phone, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { type CustomerStatusFilter, searchCustomers } from "@/modules/customers/queries";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requirePagePermission("customer.read");
  const t = await getTranslations("customers");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const statusRaw = one(sp.status);
  const status: CustomerStatusFilter = statusRaw === "inactive" || statusRaw === "all" ? statusRaw : "active";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const { rows, total, pages } = await searchCustomers(q, status, page);

  const href = (p: { page?: number; status?: CustomerStatusFilter }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = p.status ?? status;
    if (s !== "active") params.set("status", s);
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/customers/new" className={buttonVariants({ size: "lg" })}>
            <Plus />
            {t("new")}
          </Link>
        }
      />

      <form role="search" action="/customers" className="mb-3 flex gap-2">
        {status !== "active" && <input type="hidden" name="status" value={status} />}
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="h-10 max-w-md"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="lg" className="h-10">
          <Search />
          <span className="sr-only sm:not-sr-only">{t("search")}</span>
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(["active", "inactive", "all"] as const).map((s) => (
          <Link
            key={s}
            href={href({ status: s })}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1",
              status === s ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(s === "active" ? "filterActive" : s === "inactive" ? "filterInactive" : "filterAll")}
          </Link>
        ))}
        <span className="ml-auto text-muted-foreground">{t("results", { count: total })}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          <p>{q ? t("noMatch", { q }) : t("empty")}</p>
          <Link
            href={/^[\d\s+()-]{6,}$/.test(q) ? `/customers/new?phone=${encodeURIComponent(q)}` : "/customers/new"}
            className={buttonVariants({ variant: "outline", className: "mt-4" })}
          >
            <Plus />
            {t("new")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((c) => (
            <li key={c.id} className={cn("flex items-center gap-3 px-4 py-3", !c.isActive && "opacity-60")}>
              <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">#{c.id}</span>
                  <span className="truncate font-medium">{c.name}</span>
                  {!c.isActive && <Badge variant="destructive">{t("inactiveBadge")}</Badge>}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {formatPhone(c.phone)}
                  {c.altPhone ? ` · ${formatPhone(c.altPhone)}` : ""}
                  {c.address ? ` · ${c.address}` : ""}
                </div>
              </Link>
              <a
                href={`tel:${c.phone}`}
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                aria-label={`${t("call")} ${c.name}`}
              >
                <Phone />
              </a>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="pagination">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "outline" })}>
              {t("prev")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">{t("page", { page, pages })}</span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline" })}>
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

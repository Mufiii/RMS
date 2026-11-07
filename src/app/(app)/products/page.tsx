import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck, Plus, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { available, countersOf } from "@/modules/inventory/client-safe";
import { listCategories, listProducts } from "@/modules/products/queries";
import { ProductFilters } from "./product-filters";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const me = await requirePagePermission("product.read");
  const t = await getTranslations("products");
  const ml = (await getLocale()) === "ml";
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const categoryId = Number.parseInt(one(sp.category), 10) || null;
  const includeInactive = one(sp.inactive) === "1";
  const [products, categories] = await Promise.all([
    listProducts({ q, categoryId, includeInactive }),
    listCategories(false),
  ]);
  const isAdmin = can(me.role, "product.write");
  const selected = categories.find((c) => c.id === categoryId);
  const category = selected ? { label: ml && selected.nameMl ? selected.nameMl : selected.name } : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          isAdmin && (
            <>
              <Link href="/products/categories" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Tags />
                {t("categoriesLink")}
              </Link>
              {can(me.role, "stock.adjust") && (
                <Link href="/products/reconcile" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  <ClipboardCheck />
                  {t("reconcileLink")}
                </Link>
              )}
              <Link href="/products/new" className={buttonVariants({ size: "lg" })}>
                <Plus />
                {t("new")}
              </Link>
            </>
          )
        }
      />

      <ProductFilters
        q={q}
        categoryId={categoryId}
        includeInactive={includeInactive}
        categories={categories.map((c) => ({ id: c.id, label: ml && c.nameMl ? c.nameMl : c.name }))}
        resultsLabel={t("results", { count: products.length })}
      />

      {products.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-10 text-center text-muted-foreground" data-testid="no-products">
          <p>
            {!q && !categoryId && !includeInactive
              ? t("empty")
              : q && category
                ? t("noMatchIn", { q, category: category.label })
                : category
                  ? t("noneInCategory", { category: category.label })
                  : t("noMatchQ", { q })}
          </p>
          {(q || categoryId) && (
            <div className="flex flex-wrap justify-center gap-2">
              {q && categoryId && (
                <Link href={`/products?q=${encodeURIComponent(q)}${includeInactive ? "&inactive=1" : ""}`} className={buttonVariants({ variant: "outline" })}>
                  {t("searchAllCategories")}
                </Link>
              )}
              {!includeInactive && (
                <Link
                  href={`/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(categoryId ? { category: String(categoryId) } : {}), inactive: "1" })}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  {t("includeInactive")}
                </Link>
              )}
              <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
                {t("clearFilters")}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-[1fr_8rem_repeat(4,5rem)] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>{t("name")}</span>
            <span className="text-right">{t("dailyRate")}</span>
            <span className="text-right">{t("owned")}</span>
            <span className="text-right">{t("out")}</span>
            <span className="text-right">{t("repair")}</span>
            <span className="text-right">{t("available")}</span>
          </div>
          <ul className="divide-y">
            {products.map((p) => {
              const c = countersOf(p);
              const avail = available(c);
              return (
                <li key={p.id} className={cn(!p.isActive && "opacity-60")}>
                  <Link
                    href={`/products/${p.id}`}
                    className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 px-4 py-3 hover:bg-muted/40 md:grid-cols-[1fr_8rem_repeat(4,5rem)] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{ml && p.nameMl ? p.nameMl : p.name}</span>
                        {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
                        {!p.isActive && <Badge variant="destructive">{t("inactiveBadge")}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ml && p.category.nameMl ? p.category.nameMl : p.category.name} · {t(`trackingShort.${p.tracking}`)}
                      </div>
                    </div>
                    <span className="text-right text-sm tabular-nums">{t("perDay", { rate: formatINR(toPaise(p.dailyRate)) })}</span>
                    {/* Mobile: compact counts line */}
                    <span className="col-span-2 text-xs text-muted-foreground md:hidden">
                      {t("owned")} {c.owned} · {t("out")} {c.out} · {t("repair")} {c.repair} ·{" "}
                      <b className={cn("text-foreground", avail === 0 && "text-destructive")}>
                        {t("available")} {avail}
                      </b>
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{c.owned}</span>
                    <span className="hidden text-right tabular-nums md:block">{c.out}</span>
                    <span className="hidden text-right tabular-nums md:block">{c.repair}</span>
                    <span className={cn("hidden text-right font-semibold tabular-nums md:block", avail === 0 && "text-destructive")}>
                      {avail}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck, Plus, Search, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { available, countersOf } from "@/modules/inventory/client-safe";
import { listCategories, listProducts } from "@/modules/products/queries";

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

      <form role="search" action="/products" className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="h-10 max-w-xs"
          autoComplete="off"
        />
        <select
          name="category"
          defaultValue={categoryId ?? ""}
          aria-label={t("category")}
          className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {ml && c.nameMl ? c.nameMl : c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} className="size-4" />
          {t("showInactive")}
        </label>
        <Button type="submit" variant="outline" size="lg" className="h-10">
          <Search />
          <span className="sr-only sm:not-sr-only">{t("search")}</span>
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{t("results", { count: products.length })}</span>
      </form>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {q || categoryId ? t("noMatch") : t("empty")}
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

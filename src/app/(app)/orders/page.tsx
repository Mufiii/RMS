import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { formatDate, fromDbDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { listOrders, type OrderStatusFilter } from "@/modules/orders/queries";
import { OrderStatusBadge } from "./status-badge";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FILTERS: OrderStatusFilter[] = ["OPEN", "CLOSED", "CANCELLED", "ALL"];

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  await requirePagePermission("order.create");
  const t = await getTranslations("orders");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const statusRaw = one(sp.status).toUpperCase() as OrderStatusFilter;
  const status: OrderStatusFilter = FILTERS.includes(statusRaw) ? statusRaw : "OPEN";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const { rows, total, pages } = await listOrders(q, status, page);

  const href = (p: { page?: number; status?: OrderStatusFilter }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = p.status ?? status;
    if (s !== "OPEN") params.set("status", s.toLowerCase());
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const qs = params.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link href="/orders/new" className={buttonVariants({ size: "lg" })}>
            <Plus />
            {t("new")}
          </Link>
        }
      />

      <form role="search" action="/orders" className="mb-3 flex gap-2">
        {status !== "OPEN" && <input type="hidden" name="status" value={status.toLowerCase()} />}
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
        {FILTERS.map((s) => (
          <Link
            key={s}
            href={href({ status: s })}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1",
              status === s ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "ALL" ? t("filterAll") : t(`statusName.${s}`)}
          </Link>
        ))}
        <span className="ml-auto text-muted-foreground">{t("results", { count: total })}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{q ? t("noMatch") : t("empty")}</div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 hover:bg-muted/40">
                <span className="font-medium tabular-nums">{o.orderNo}</span>
                <OrderStatusBadge status={o.status} label={t(`statusName.${o.status}`)} />
                <span className="truncate">
                  {o.customer.name} <span className="text-sm text-muted-foreground">· {formatPhone(o.customer.phone)}</span>
                </span>
                <span className="text-right text-sm text-muted-foreground tabular-nums">{formatDate(fromDbDate(o.openedOn))}</span>
                <span className="col-span-2 text-sm text-muted-foreground">
                  {o.status === "OPEN" ? (
                    <Badge variant={o.piecesOut > 0 ? "secondary" : "outline"}>{t("piecesOut", { count: o.piecesOut })}</Badge>
                  ) : (
                    o.siteAddress
                  )}
                </span>
              </Link>
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

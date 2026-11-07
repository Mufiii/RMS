import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClipboardList, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FilterTabs } from "@/components/filter-tabs";
import { ListPagination, ListToolbar, SearchForm } from "@/components/list-controls";
import { PageHeader } from "@/components/page-header";
import { QuickActions } from "@/components/quick-actions";
import { SlipNo } from "@/components/slip-no";
import { formatDate, fromDbDate } from "@/lib/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { listOrders, type OrderStatusFilter } from "@/modules/orders/queries";
import { OrderStatusBadge } from "./status-badge";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FILTERS: OrderStatusFilter[] = ["ALL", "OPEN", "CLOSED", "CANCELLED"];

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requirePagePermission("order.create");
  const t = await getTranslations("orders");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const statusRaw = one(sp.status).toUpperCase() as OrderStatusFilter;
  const status: OrderStatusFilter = FILTERS.includes(statusRaw) ? statusRaw : "ALL";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const { rows, total, pages } = await listOrders(q, status, page);

  const href = (p: { page?: number; status?: OrderStatusFilter }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = p.status ?? status;
    if (s !== "ALL") params.set("status", s.toLowerCase());
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

      <div className="grid gap-5">
        {/* Staff land here: the day's jobs one click away. */}
        {user.role === "STAFF" && <QuickActions role={user.role} skip={["newOrder"]} />}

        <Card className="gap-0 py-0">
          <ListToolbar>
            <SearchForm
              action="/orders"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              label={t("search")}
              hidden={{ status: status !== "ALL" ? status.toLowerCase() : undefined }}
            />
            <FilterTabs
              label={t("status")}
              tabs={FILTERS.map((s) => ({
                key: s,
                label: s === "ALL" ? t("filterAll") : t(`statusName.${s}`),
                href: href({ status: s }),
                active: status === s,
              }))}
            />
          </ListToolbar>

          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={q ? t("noMatch") : t("empty")}
            />
          ) : (
            <Table data-testid="order-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("orderNo")}</TableHead>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("openedOn")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("itemsOutTitle")}</TableHead>
                  <TableHead className="text-right">{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/orders/${o.id}`} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <SlipNo>{o.orderNo}</SlipNo>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate font-medium">{o.customer.name}</div>
                      <div className="text-[13px] text-muted-foreground">{formatPhone(o.customer.phone)}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(fromDbDate(o.openedOn))}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {o.status === "OPEN" ? (
                        <span className={o.piecesOut > 0 ? "font-medium" : "text-muted-foreground"}>{t("piecesOut", { count: o.piecesOut })}</span>
                      ) : (
                        <span className="block max-w-72 truncate text-muted-foreground">{o.siteAddress}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <OrderStatusBadge status={o.status} label={t(`statusName.${o.status}`)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {rows.length > 0 && (
            <ListPagination
              summary={t("results", { count: total })}
              prevHref={page > 1 ? href({ page: page - 1 }) : null}
              nextHref={page < pages ? href({ page: page + 1 }) : null}
              pageLabel={pages > 1 ? t("page", { page, pages }) : undefined}
              labels={{ prev: t("prev"), next: t("next") }}
            />
          )}
        </Card>
      </div>
    </>
  );
}

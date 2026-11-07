import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleMinus, ClipboardList, IndianRupee, Phone, Plus, UserCheck, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initials } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";
import { FilterTabs } from "@/components/filter-tabs";
import { ListPagination, ListToolbar, SearchForm } from "@/components/list-controls";
import { PageHeader } from "@/components/page-header";
import { Pill, StatTile } from "@/components/stat-tile";
import { businessToday } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import {
  CUSTOMER_PAGE_SIZE,
  type CustomerStatusFilter,
  customerSummary,
  searchCustomers,
} from "@/modules/customers/queries";
import { CustomerRowActions } from "./row-actions";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requirePagePermission("customer.read");
  const t = await getTranslations("customers");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const statusRaw = one(sp.status);
  const status: CustomerStatusFilter = statusRaw === "active" || statusRaw === "inactive" ? statusRaw : "all";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const today = businessToday();
  const [summary, { rows, total, pages }] = await Promise.all([
    customerSummary(today),
    searchCustomers(q, status, page, today),
  ]);
  const canDelete = can(user.role, "customer.delete");

  const href = (p: { page?: number; status?: CustomerStatusFilter }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const s = p.status ?? status;
    if (s !== "all") params.set("status", s);
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const qs = params.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };
  const from = (page - 1) * CUSTOMER_PAGE_SIZE + 1;
  const to = from + rows.length - 1;

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

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatTile compact testId="card-customers" tone="blue" icon={Users} label={t("cardTotal")} value={String(summary.customers)} />
          <StatTile
            compact
            testId="card-active"
            tone="green"
            icon={UserCheck}
            label={t("cardActive")}
            value={String(summary.active)}
            detail={t("cardInactive", { count: summary.customers - summary.active })}
          />
          <StatTile
            compact
            testId="card-rentals"
            tone="violet"
            icon={ClipboardList}
            label={t("cardRentals")}
            value={String(summary.rentals)}
            detail={t("cardRentalsHint")}
          />
          <StatTile
            compact
            testId="card-outstanding"
            tone="red"
            icon={IndianRupee}
            label={t("cardOutstanding")}
            value={formatINR(summary.outstanding)}
            detail={t("cardOwing", { count: summary.customersOwing })}
          />
        </div>

        <Card className="gap-0 py-0">
          <ListToolbar>
            <SearchForm
              action="/customers"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              label={t("search")}
              hidden={{ status: status !== "all" ? status : undefined }}
            />
            <FilterTabs
              label={t("status")}
              tabs={(["all", "active", "inactive"] as const).map((s) => ({
                key: s,
                label: t(s === "active" ? "filterActive" : s === "inactive" ? "filterInactive" : "filterAll"),
                href: href({ status: s }),
                active: status === s,
              }))}
            />
          </ListToolbar>

          {rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? t("noMatch", { q }) : t("empty")}
              action={
                <Link
                  href={/^[\d\s+()-]{6,}$/.test(q) ? `/customers/new?phone=${encodeURIComponent(q)}` : "/customers/new"}
                  className={buttonVariants({ size: "lg", variant: q ? "outline" : "default" })}
                >
                  <Plus />
                  {t("new")}
                </Link>
              }
            />
          ) : (
            <Table data-testid="customer-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("colContact")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("colRentals")}</TableHead>
                  <TableHead className="text-right">{t("colOutstanding")}</TableHead>
                  <TableHead className="w-14">
                    <span className="sr-only">{t("colActions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            "hidden size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold sm:grid",
                            c.isActive ? "bg-accent text-primary" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/customers/${c.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                            {c.name}
                          </Link>
                          <span className="text-[13px] text-muted-foreground tabular-nums">
                            #{c.id}
                            <span className="md:hidden"> · {formatPhone(c.phone)}</span>
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary hover:underline">
                        <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                        {formatPhone(c.phone)}
                      </a>
                      {c.altPhone && <div className="pl-5 text-[13px] text-muted-foreground tabular-nums">{formatPhone(c.altPhone)}</div>}
                    </TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <Pill tone="green">
                          <CircleCheck aria-hidden />
                          {t("active")}
                        </Pill>
                      ) : (
                        <Pill tone="muted">
                          <CircleMinus aria-hidden />
                          {t("inactive")}
                        </Pill>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">{c.rentals}</TableCell>
                    <TableCell className={cn("text-right", c.outstanding > 0 ? "font-semibold text-(--dash-red)" : "text-muted-foreground")}>
                      {formatINR(c.outstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      <CustomerRowActions customer={c} canDelete={canDelete} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {rows.length > 0 && (
            <ListPagination
              summary={t("showing", { from, to, total })}
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

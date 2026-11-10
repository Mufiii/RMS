import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatDate, fromDbDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { listOrders, type OrderStatusFilter } from "@/modules/orders/queries";
import { OrderRow } from "./order-row";
import { OrderStageBadge } from "./status-badge";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FILTERS: OrderStatusFilter[] = ["OPEN", "CLOSED", "CANCELLED", "ALL"];

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const me = await requirePagePermission("order.create");
  const t = await getTranslations("orders");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const statusRaw = one(sp.status).toUpperCase() as OrderStatusFilter;
  const status: OrderStatusFilter = FILTERS.includes(statusRaw) ? statusRaw : "OPEN";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const { rows, total, pages, threshold } = await listOrders(q, status, page);
  const canCancel = can(me.role, "record.cancel");
  const canReturn = can(me.role, "return.create");
  const canPay = can(me.role, "payment.create");
  const canBill = can(me.role, "invoice.create");
  const canPrint = can(me.role, "statement.print");

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
        <div className=" border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orderNo")}</TableHead>
                <TableHead>{t("customer")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("orderDate")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("items")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t("daysOut")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("amount")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const open = o.status === "OPEN";
                const items = o.totalItems === 0 ? "—" : o.piecesOut === 0 ? t("allBack") : t("itemsOut", { out: o.piecesOut, total: o.totalItems });
                const late = o.daysOut !== null && o.daysOut >= threshold;
                const shortcuts = [
                  ...(open && canReturn && o.piecesOut > 0 ? [{ key: "return", label: t("recordReturn"), href: `/orders/${o.id}#return` }] : []),
                  ...(o.stage === "readyToBill" && canBill ? [{ key: "invoice", label: t("generateInvoice"), href: `/orders/${o.id}#invoice` }] : []),
                  ...(canPay && o.status !== "CANCELLED" && (open || (o.balance ?? 0) > 0) ? [{ key: "pay", label: t("takePayment"), href: `/orders/${o.id}#payment` }] : []),
                  ...(open && canPrint && o.totalItems > 0 ? [{ key: "statement", label: t("printStatement"), href: `/print/statement/${o.id}`, external: true }] : []),
                  ...(o.invoiceId && canPrint ? [{ key: "print-invoice", label: t("printInvoice"), href: `/print/invoice/${o.invoiceId}`, external: true }] : []),
                  { key: "call", label: t("callCustomer"), href: `tel:${o.customer.phone}`, external: true },
                ];
                return (
                  <OrderRow key={o.id} href={`/orders/${o.id}`} orderId={o.id} orderNo={o.orderNo} canCancel={canCancel && open} shortcuts={shortcuts}>
                    <TableCell className="font-medium tabular-nums">
                      <Link href={`/orders/${o.id}`} className="underline-offset-4 hover:underline">
                        {o.orderNo}
                      </Link>
                      <div className="text-xs font-normal text-muted-foreground sm:hidden">
                        {formatDate(fromDbDate(o.openedOn))} · {items}
                        {o.amount !== null && <> · {formatINR(o.amount)}</>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate">{o.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{formatPhone(o.customer.phone)}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{formatDate(fromDbDate(o.openedOn))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{items}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums md:table-cell", late && "font-semibold text-destructive")}>
                      {o.daysOut === null ? <span className="text-muted-foreground">—</span> : t("daysN", { count: o.daysOut })}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {o.amount === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {formatINR(o.amount)}
                          {!o.invoiced && <div className="text-xs text-muted-foreground">{t("soFar")}</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.balance === null || (o.balance === 0 && !o.invoiced) ? (
                        <span className="text-muted-foreground">—</span>
                      ) : o.balance > 0 ? (
                        <span className={cn("font-medium", o.invoiced ? "text-destructive" : "text-muted-foreground")}>{t("balanceDue", { amount: formatINR(o.balance) })}</span>
                      ) : o.balance < 0 ? (
                        <span className="font-medium text-amber-700 dark:text-amber-400">{t("balanceExcess", { amount: formatINR(-o.balance) })}</span>
                      ) : (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">{t("balancePaid")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <OrderStageBadge stage={o.stage} label={t(`stage.${o.stage}`)} />
                    </TableCell>
                  </OrderRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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

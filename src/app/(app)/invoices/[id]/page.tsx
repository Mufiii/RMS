import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatDate, formatDateTime, fromDbDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { getInvoice } from "@/modules/invoices/queries";
import { CancelInvoiceForm } from "../../orders/[id]/invoice-forms";

/** A final invoice, rendered only from its stored snapshot. */
export default async function InvoicePage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const me = await requirePagePermission("invoice.create");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const { saved } = await searchParams;
  const t = await getTranslations("invoices");
  const tr = await getTranslations("returns");
  const ml = (await getLocale()) === "ml";
  const cancelled = inv.status === "CANCELLED";
  const subtotal = toPaise(inv.rentTotal) + toPaise(inv.damageTotal);

  return (
    <>
      <Link href={`/orders/${inv.order.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {inv.orderNo}
      </Link>
      <PageHeader
        title={inv.invoiceNo}
        actions={
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium",
              cancelled ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {t(`statusName.${inv.status}`)}
          </span>
        }
      >
        {t("date")} {formatDate(fromDbDate(inv.invoiceDate))}
      </PageHeader>

      {(saved === "created" || saved === "reissued") && (
        <p role="status" className="mb-4 max-w-3xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {t(saved)}
        </p>
      )}
      {cancelled && (
        <p className="mb-4 max-w-3xl rounded-lg bg-muted px-3 py-2 text-sm" data-testid="cancelled-notice">
          {t("cancelledBy", {
            name: inv.cancelledBy?.fullName ?? "—",
            date: inv.cancelledAt ? formatDateTime(inv.cancelledAt) : "",
            reason: inv.cancelReason ?? "",
          })}
        </p>
      )}

      <div className="grid max-w-3xl gap-4">
        <Card className={cn(cancelled && "opacity-70")}>
          <CardContent className="grid gap-4 text-sm">
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">{t("customer")}</dt>
              <dd>
                <Link href={`/customers/${inv.order.customerId}`} className="font-medium underline-offset-4 hover:underline">
                  {inv.customerName}
                </Link>{" "}
                · {formatPhone(inv.customerPhone)}
                {inv.customerAddress && <div className="text-muted-foreground">{inv.customerAddress}</div>}
              </dd>
              {inv.siteAddress && (
                <>
                  <dt className="text-muted-foreground">{t("site")}</dt>
                  <dd>{inv.siteAddress}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("order")}</dt>
              <dd>{inv.orderNo}</dd>
            </dl>

            <ol className="divide-y border-y" data-testid="invoice-lines">
              {inv.lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                  <span className="font-medium">
                    {ml && l.productNameMl ? l.productNameMl : l.productName}
                    {l.serialNo && <span className="ml-1 text-muted-foreground">{l.serialNo}</span>}
                    {l.condition !== "GOOD" && (
                      <span
                        className={cn(
                          "ml-2 rounded px-1.5 text-xs font-normal",
                          l.condition === "DAMAGED" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {tr(`condition.${l.condition}`)}
                      </span>
                    )}
                  </span>
                  <span className="text-right tabular-nums">{formatINR(toPaise(l.rentAmount))}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(fromDbDate(l.issueDate))} → {formatDate(fromDbDate(l.returnDate))} · {l.quantity} × {formatINR(toPaise(l.dailyRate))} ×{" "}
                    {tr("days", { count: l.days })}
                  </span>
                  <span />
                  {toPaise(l.damageAmount) > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {t("charge")}
                        {l.damageNote && ` — “${l.damageNote}”`}
                      </span>
                      <span className="text-right tabular-nums">{formatINR(toPaise(l.damageAmount))}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>

            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums" data-testid="invoice-totals">
              <dt>{t("rent")}</dt>
              <dd className="text-right">{formatINR(toPaise(inv.rentTotal))}</dd>
              <dt>{t("damageTotal")}</dt>
              <dd className="text-right">{formatINR(toPaise(inv.damageTotal))}</dd>
              {toPaise(inv.discountAmount) > 0 && (
                <>
                  <dt>{t("subtotal")}</dt>
                  <dd className="text-right">{formatINR(subtotal)}</dd>
                  <dt>
                    {t("discountLine")} <span className="text-muted-foreground">— “{inv.discountReason}”</span>
                  </dt>
                  <dd className="text-right">− {formatINR(toPaise(inv.discountAmount))}</dd>
                </>
              )}
              <dt className="border-t pt-1 font-semibold">{t("total")}</dt>
              <dd className="border-t pt-1 text-right text-base font-semibold">{formatINR(toPaise(inv.total))}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("createdBy", { name: inv.createdBy.fullName, date: formatDateTime(inv.createdAt) })}
              {!cancelled && <> · {t("paymentsSoon")}</>}
            </p>
          </CardContent>
        </Card>

        {!cancelled && can(me.role, "record.cancel") && <CancelInvoiceForm invoiceId={inv.id} />}
      </div>
    </>
  );
}

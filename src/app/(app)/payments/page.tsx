import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, IndianRupee, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SlipNo } from "@/components/slip-no";
import { StatTile } from "@/components/stat-tile";
import { businessToday, formatDate, isIsoDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { paymentsOn } from "@/modules/payments/queries";

/** The day's collections: every receipt and refund entered on a date, with totals per mode. */
export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  await requirePagePermission("payment.create");
  const t = await getTranslations("payments");
  const today = businessToday();
  const raw = (await searchParams).date;
  const date = typeof raw === "string" && isIsoDate(raw) && raw <= today ? raw : today;
  const day = await paymentsOn(date);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <form className="flex items-center gap-2" method="get">
            <label className="sr-only" htmlFor="pay-date">
              {t("date")}
            </label>
            <Input id="pay-date" type="date" name="date" defaultValue={date} max={today} className="w-44" />
            <Button type="submit" variant="outline" size="lg">
              <CalendarDays />
              {t("show")}
            </Button>
          </form>
        }
      >
        {t("dayTitle", { date: formatDate(date) })}
      </PageHeader>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatTile compact testId="pay-in" tone="green" icon={ArrowDownLeft} label={t("totalIn")} value={formatINR(day.received)} />
          <StatTile compact testId="pay-out" tone="red" icon={ArrowUpRight} label={t("totalOut")} value={formatINR(day.refunded)} />
          <StatTile compact testId="pay-net" tone="blue" icon={IndianRupee} label={t("net")} value={formatINR(day.net)} />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("byMode")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 text-sm tabular-nums" data-testid="day-totals">
              <dt />
              <dd className="text-right text-xs text-muted-foreground">{t("totalIn")}</dd>
              <dd className="text-right text-xs text-muted-foreground">{t("totalOut")}</dd>
              {day.byMode.map(([mode, m]) => (
                <div key={mode} className="contents">
                  <dt>{t(`mode.${mode}`)}</dt>
                  <dd className="text-right">{formatINR(m.in)}</dd>
                  <dd className="text-right">{m.out ? formatINR(m.out) : "—"}</dd>
                </div>
              ))}
              <dt className="border-t pt-1" />
              <dd className="border-t pt-1 text-right font-semibold">{formatINR(day.received)}</dd>
              <dd className="border-t pt-1 text-right font-semibold">{formatINR(day.refunded)}</dd>
            </dl>
            <p className="mt-3 border-t pt-3 text-right text-base font-semibold tabular-nums">
              {t("net")}: {formatINR(day.net)}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("entries")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {day.rows.length === 0 ? (
              <EmptyState icon={Wallet} title={t("dayNone")} className="py-8" />
            ) : (
              <ul className="divide-y border-t text-sm" data-testid="day-payments">
                {day.rows.map((p) => (
                  <li key={p.id} className={cn("grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-5 py-3", p.status === "VOIDED" && "text-muted-foreground")}>
                    <span className={cn(p.status === "VOIDED" && "line-through")}>
                      <Link href={`/print/receipt/${p.id}`} target="_blank" className="focus-visible:outline-none">
                        <SlipNo muted={p.status === "VOIDED"}>{p.receiptNo}</SlipNo>
                      </Link>{" "}
                      · {t(`type.${p.type}`)} · {t(`mode.${p.mode}`)}
                    </span>
                    <span className={cn("text-right font-semibold tabular-nums", p.type === "REFUND" && "text-(--dash-red)")}>
                      {p.type === "REFUND" ? "− " : ""}
                      {formatINR(toPaise(p.amount))}
                    </span>
                    <span className="col-span-2 text-[13px] text-muted-foreground">
                      <Link href={`/customers/${p.customer.id}`} className="underline-offset-4 hover:underline">
                        {p.customer.name}
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/orders/${p.order.id}`} className="underline-offset-4 hover:underline">
                        {p.order.orderNo}
                      </Link>{" "}
                      · {p.receivedBy.fullName}
                      {p.status === "VOIDED" && <> · {t("voidedBy", { name: p.voidedBy?.fullName ?? "—", reason: p.voidReason ?? "" })}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}

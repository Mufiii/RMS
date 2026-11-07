import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { businessToday, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { dashboard } from "@/modules/reports/dashboard";

function Tile({ label, value, detail, href, testId }: { label: string; value: string; detail?: ReactNode; href: string; testId: string }) {
  return (
    <Link href={href} className="group" data-testid={testId}>
      <Card className="h-full transition-colors group-hover:border-foreground/30">
        <CardContent className="grid gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}

/** Owner's end-of-day view (admin only): what is out, what came in today, what is owed, who to call. */
export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const t = await getTranslations("dashboard");
  const ml = (await getLocale()) === "ml";
  const today = businessToday();
  const d = await dashboard(today);
  const maxDay = Math.max(1, ...d.week.map((w) => Math.abs(w.net)));

  return (
    <>
      <PageHeader title={t("title")}>{t("asOf", { date: formatDate(today) })}</PageHeader>

      <div className="grid max-w-5xl gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile testId="tile-out" label={t("piecesOut")} value={String(d.piecesOut)} detail={t("openOrders", { count: d.openOrders })} href="/orders?status=OPEN" />
          <Tile
            testId="tile-today"
            label={t("todayNet")}
            value={formatINR(d.today.net)}
            detail={t("todayDetail", { count: d.today.count, refunded: formatINR(d.today.refunded) })}
            href="/payments"
          />
          <Tile
            testId="tile-billed"
            label={t("billedDue")}
            value={formatINR(d.billedDue)}
            detail={
              <>
                {t("customersOwing", { count: d.customersOwing })}
                {d.creditHeld > 0 && <> · {t("creditHeld", { amount: formatINR(d.creditHeld) })}</>}
              </>
            }
            href="/reports?r=customers"
          />
          <Tile testId="tile-open" label={t("openSoFar")} value={formatINR(d.openSoFar)} detail={t("openSoFarHint")} href="/reports?r=customers" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("longTitle", { days: d.threshold })}</CardTitle>
            <CardDescription>{t("longHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {d.longRentals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("longNone", { days: d.threshold })}</p>
            ) : (
              <ul className="divide-y text-sm" data-testid="long-rentals">
                {d.longRentals.map((l) => (
                  <li key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 py-2">
                    <span>
                      <Link href={`/customers/${l.customer.id}`} className="font-medium underline-offset-4 hover:underline">
                        {l.customer.name}
                      </Link>{" "}
                      <span className="text-muted-foreground">·</span>{" "}
                      {ml && l.product.nameMl ? l.product.nameMl : l.product.name}
                      {l.serialNo ? ` ${l.serialNo}` : ` × ${l.qty}`}
                    </span>
                    <span className="text-right font-semibold tabular-nums">{t("days", { count: l.days })}</span>
                    <span className="text-xs text-muted-foreground">
                      <Link href={`/orders/${l.order.id}`} className="underline-offset-4 hover:underline">
                        {l.order.orderNo}
                      </Link>{" "}
                      · {t("since", { date: formatDate(l.issueDate) })} · {t("rentSoFar", { amount: formatINR(l.accrued) })}
                    </span>
                    <a href={`tel:${l.customer.phone}`} className="inline-flex items-center gap-1 justify-self-end text-xs underline-offset-4 hover:underline">
                      <Phone className="size-3" />
                      {formatPhone(l.customer.phone)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("weekTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Plain bars rather than a chart library: seven numbers, readable on a phone, no JS. */}
            <ul className="grid gap-1.5 text-sm" data-testid="week">
              {d.week.map((w) => (
                <li key={w.date} className="grid grid-cols-[6.5rem_1fr_7rem] items-center gap-3">
                  <span className={cn("tabular-nums", w.date === today ? "font-semibold" : "text-muted-foreground")}>{formatDate(w.date)}</span>
                  <span className="h-2.5 rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", w.net < 0 ? "bg-amber-500" : "bg-emerald-600 dark:bg-emerald-500")}
                      style={{ width: `${(Math.abs(w.net) / maxDay) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{formatINR(w.net)}</span>
                </li>
              ))}
            </ul>
            <Link href="/reports?r=collections" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
              {t("reportsLink")}
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

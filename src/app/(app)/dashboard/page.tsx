import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Boxes, Clock, IndianRupee, Phone, ReceiptText } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { SlipNo } from "@/components/slip-no";
import { Pill, StatTile as Tile, type Tone } from "@/components/stat-tile";
import { businessToday, formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { dashboard, type RentalState } from "@/modules/reports/dashboard";
import { CollectionsBars, StockDonut, type Slice } from "./charts";

const STATE_TONE: Record<RentalState, Tone> = { out: "blue", partReturned: "violet", returned: "green", tooLong: "red" };
const MODE_TONE: Record<string, Tone> = { CASH: "green", UPI: "violet", BANK_TRANSFER: "blue", CHEQUE: "amber" };

function ViewAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <CardAction>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-(--dash-blue) underline-offset-4 hover:underline">
        {children}
        <ArrowRight className="size-3.5" />
      </Link>
    </CardAction>
  );
}

/** Owner's end-of-day view (admin only): what is out, what came in, what is owed, who to call. */
export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const t = await getTranslations("dashboard");
  const tMode = await getTranslations("payments.mode");
  const tType = await getTranslations("payments.type");
  const ml = (await getLocale()) === "ml";
  const today = businessToday();
  const d = await dashboard(today);
  const productName = (p: { name: string; nameMl: string | null }) => (ml && p.nameMl ? p.nameMl : p.name);

  const slices: Slice[] = [
    { key: "available", label: t("stock.available"), value: d.stock.available, color: "var(--dash-green)" },
    { key: "onRent", label: t("stock.onRent"), value: d.stock.onRent, color: "var(--dash-blue)" },
    { key: "tooLong", label: t("stock.tooLong", { days: d.threshold }), value: d.stock.tooLong, color: "var(--dash-red)" },
    { key: "repair", label: t("stock.repair"), value: d.stock.repair, color: "var(--dash-amber)" },
  ];
  const monthFmt = new Intl.DateTimeFormat(ml ? "ml-IN" : "en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  const months = d.months.map((m) => ({ ...m, label: monthFmt.format(new Date(`${m.month}-01T00:00:00Z`)) }));
  const pct = (n: number) => (d.stock.owned > 0 ? Math.round((n / d.stock.owned) * 100) : 0);

  return (
    <>
      <PageHeader title={t("title")}>
        {t("asOf", { date: formatDate(today) })}
      </PageHeader>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Tile compact testId="tile-out" tone="blue" icon={Boxes} label={t("piecesOut")} value={String(d.piecesOut)} detail={t("openOrders", { count: d.openOrders })} href="/orders?status=OPEN" />
          <Tile
            compact
            testId="tile-today"
            tone="green"
            icon={IndianRupee}
            label={t("todayNet")}
            value={formatINR(d.today.net)}
            detail={t("todayDetail", { count: d.today.count, refunded: formatINR(d.today.refunded) })}
            href="/payments"
          />
          <Tile
            compact
            testId="tile-billed"
            tone="red"
            icon={ReceiptText}
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
          <Tile compact testId="tile-open" tone="amber" icon={Clock} label={t("openSoFar")} value={formatINR(d.openSoFar)} detail={t("openSoFarHint")} href="/reports?r=customers" />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2" data-testid="stock">
            <CardHeader>
              <CardTitle>{t("stockTitle")}</CardTitle>
              <CardDescription>{t("stockHint")}</CardDescription>
              <ViewAll href="/reports?r=inventory">{t("viewAll")}</ViewAll>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
              <StockDonut slices={slices} total={d.stock.owned} totalLabel={t("stockTotal")} />
              <ul className="grid w-full gap-2.5 text-sm">
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2" data-testid={`stock-${s.key}`}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.value}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(s.value)}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3" data-testid="trend">
            <CardHeader>
              <CardTitle>{t("trendTitle")}</CardTitle>
              <CardDescription>{t("trendHint")}</CardDescription>
              <ViewAll href="/reports?r=collections">{t("reportsLink")}</ViewAll>
            </CardHeader>
            <CardContent>
              <CollectionsBars data={months} seriesLabel={t("collected")} />
              {/* The numbers, for screen readers and tests. */}
              <ul className="sr-only" data-testid="months">
                {months.map((m) => (
                  <li key={m.month}>
                    {m.label}: {formatINR(m.net)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("longTitle", { days: d.threshold })}</CardTitle>
              <CardDescription>{t("longHint")}</CardDescription>
              <ViewAll href="/orders?status=OPEN">{t("viewAll")}</ViewAll>
            </CardHeader>
            <CardContent className="px-0">
              {d.longRentals.length === 0 ? (
                <p className="px-5 text-sm text-muted-foreground">{t("longNone", { days: d.threshold })}</p>
              ) : (
                <Table data-testid="long-rentals" className="border-t">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("col.order")}</TableHead>
                      <TableHead>{t("col.customer")}</TableHead>
                      <TableHead>{t("col.item")}</TableHead>
                      <TableHead>{t("col.since")}</TableHead>
                      <TableHead className="text-right">{t("col.out")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.longRentals.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Link href={`/orders/${l.order.id}`} className="focus-visible:outline-none">
                            <SlipNo>{l.order.orderNo}</SlipNo>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/customers/${l.customer.id}`} className="font-medium underline-offset-4 hover:underline">
                            {l.customer.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {productName(l.product)}
                          {l.serialNo ? ` ${l.serialNo}` : ` × ${l.qty}`}
                          <div className="text-xs text-muted-foreground">{t("rentSoFar", { amount: formatINR(l.accrued) })}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDate(l.issueDate)}</TableCell>
                        <TableCell className="text-right font-semibold text-(--dash-red) tabular-nums">{t("days", { count: l.days })}</TableCell>
                        <TableCell className="text-right">
                          <a
                            href={`tel:${l.customer.phone}`}
                            className="inline-flex items-center gap-1 rounded-md bg-(--dash-blue)/12 px-2 py-1 text-xs font-medium text-(--dash-blue) hover:bg-(--dash-blue)/20"
                            title={t("call")}
                          >
                            <Phone className="size-3" />
                            {formatPhone(l.customer.phone)}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("recentPaymentsTitle")}</CardTitle>
              <ViewAll href="/payments">{t("viewAll")}</ViewAll>
            </CardHeader>
            <CardContent className="px-0">
              {d.recentPayments.length === 0 ? (
                <p className="px-5 text-sm text-muted-foreground">{t("noPayments")}</p>
              ) : (
                <Table data-testid="recent-payments" className="border-t">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("col.receipt")}</TableHead>
                      <TableHead>{t("col.customer")}</TableHead>
                      <TableHead>{t("col.date")}</TableHead>
                      <TableHead>{t("col.mode")}</TableHead>
                      <TableHead className="text-right">{t("col.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentPayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link href={`/print/receipt/${p.id}`} target="_blank" className="focus-visible:outline-none">
                            <SlipNo>{p.receiptNo}</SlipNo>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/customers/${p.customer.id}`} className="font-medium underline-offset-4 hover:underline">
                            {p.customer.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{tType(p.type)}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDate(p.paymentDate)}</TableCell>
                        <TableCell>
                          <Pill tone={MODE_TONE[p.mode]}>{tMode(p.mode)}</Pill>
                        </TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", p.type === "REFUND" && "text-(--dash-red)")}>
                          {p.type === "REFUND" ? "−" : ""}
                          {formatINR(p.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentRentalsTitle")}</CardTitle>
            <ViewAll href="/orders">{t("viewAll")}</ViewAll>
          </CardHeader>
          <CardContent className="px-0">
            {d.recentRentals.length === 0 ? (
              <p className="px-5 text-sm text-muted-foreground">{t("noRentals")}</p>
            ) : (
              <Table data-testid="recent-rentals" className="border-t">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("col.order")}</TableHead>
                    <TableHead>{t("col.customer")}</TableHead>
                    <TableHead>{t("col.item")}</TableHead>
                    <TableHead>{t("col.from")}</TableHead>
                    <TableHead>{t("col.to")}</TableHead>
                    <TableHead className="text-right">{t("col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.recentRentals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/orders/${r.order.id}`} className="focus-visible:outline-none">
                          <SlipNo>{r.order.orderNo}</SlipNo>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/customers/${r.customer.id}`} className="font-medium underline-offset-4 hover:underline">
                          {r.customer.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {productName(r.product)}
                        {r.serialNo ? ` ${r.serialNo}` : ` × ${r.qty}`}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(r.issueDate)}</TableCell>
                      <TableCell className="tabular-nums">{r.returnDate ? formatDate(r.returnDate) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Pill tone={STATE_TONE[r.state]}>{t(`state.${r.state}`)}</Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDown, ArrowRight, ArrowUp, Boxes, FileText, IndianRupee, Phone, TrendingUp, Users } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { SlipNo } from "@/components/slip-no";
import { Pill, StatTile as Tile, type Tone } from "@/components/stat-tile";
import { businessToday, formatDate } from "@/lib/dates";
import { compactINR, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { dashboard, type RentalState } from "@/modules/reports/dashboard";
import { CollectionsBars, Donut, type Slice } from "./charts";
import { RefreshButton } from "./refresh-button";

const STATE_TONE: Record<RentalState, Tone> = { out: "blue", partReturned: "violet", returned: "muted", tooLong: "red" };
const ITEM_COLORS = ["var(--dash-blue)", "var(--dash-amber)", "var(--dash-red)", "var(--dash-green)"];
const OTHERS_COLOR = "var(--muted-foreground)";

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

/** Owner's end-of-day view (admin only): what is out, what came in, what is owed, what is overdue. */
export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const t = await getTranslations("dashboard");
  const ml = (await getLocale()) === "ml";
  const today = businessToday();
  const d = await dashboard(today);
  const productName = (p: { name: string; nameMl: string | null }) => (ml && p.nameMl ? p.nameMl : p.name);
  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  // Rental status: every piece you own, by where it is now. "Out too long" = out at least the Settings threshold.
  const statusSlices: Slice[] = [
    { key: "available", label: t("stock.available"), value: d.stock.available, color: "var(--dash-green)" },
    { key: "onRent", label: t("stock.onRent"), value: d.stock.onRent, color: "var(--dash-blue)" },
    { key: "tooLong", label: t("stock.tooLong", { days: d.threshold }), value: d.stock.tooLong, color: "var(--dash-red)" },
    { key: "repair", label: t("stock.repair"), value: d.stock.repair, color: "var(--dash-amber)" },
  ];

  // Revenue by item: billed rent + damage, before discounts. Top items, the rest in Others.
  const { items, others, total, discount } = d.revenueByItem;
  const itemSlices: Slice[] = [
    ...items.map((x, i) => ({ key: `item-${i}`, label: ml && x.nameMl ? x.nameMl : x.name, value: x.amount, color: ITEM_COLORS[i] })),
    ...(others > 0 ? [{ key: "others", label: t("itemOthers"), value: others, color: OTHERS_COLOR }] : []),
  ];

  const monthFmt = new Intl.DateTimeFormat(ml ? "ml-IN" : "en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
  const months = d.months.map((m) => ({ ...m, label: monthFmt.format(new Date(`${m.month}-01T00:00:00Z`)) }));
  const mtd = d.monthToDate;
  const overdueRows = d.longRentals.slice(0, 6);

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <RefreshButton label={t("refresh")} />
            <Link href="/reports" className="inline-flex items-center gap-1 text-sm font-medium text-(--dash-blue) underline-offset-4 hover:underline">
              {t("reportsLink")}
              <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      >
        {t("asOf", { date: formatDate(today) })}
      </PageHeader>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <Tile
            compact
            testId="tile-items"
            tone="blue"
            icon={Boxes}
            label={t("rentalItemsTitle")}
            value={String(d.stock.owned)}
            detail={
              <>
                {t("itemsAvailable", { count: d.stock.available })}
                <br />
                {t("itemsOnRent", { count: d.stock.onRent })}
                <br />
                {t("openRentSub", { amount: formatINR(d.openSoFar) })}
              </>
            }
            href="/products"
          />
          <Tile
            compact
            testId="tile-customers"
            tone="green"
            icon={Users}
            label={t("customersTitle")}
            value={String(d.customers.active)}
            detail={t("newThisMonth", { count: d.customers.newThisMonth })}
            href="/customers"
          />
          <Tile
            compact
            testId="tile-active"
            tone="violet"
            icon={FileText}
            label={t("activeRentalsTitle")}
            value={String(d.openOrders)}
            detail={
              <>
                <span className={cn(d.overdueOrders > 0 && "font-medium text-(--dash-red)")}>{t("overdueOrders", { count: d.overdueOrders })}</span>
                <br />
                {t("dueFrom", { amount: formatINR(d.billedDue) })}
              </>
            }
            href="/orders?status=OPEN"
          />
          <Tile
            compact
            testId="tile-today"
            tone="amber"
            icon={IndianRupee}
            label={t("todayTitle")}
            value={formatINR(d.today.net)}
            detail={
              <>
                {t("todayInvoices", { count: d.today.invoices.count })}
                <br />
                {t("todayBilled", { billed: formatINR(d.today.invoices.billed) })}
                {d.today.refunded > 0 && (
                  <>
                    <br />
                    {t("refunded", { amount: formatINR(d.today.refunded) })}
                  </>
                )}
              </>
            }
            href="/payments"
          />
          <Tile
            compact
            testId="tile-month"
            tone="red"
            icon={TrendingUp}
            label={t("monthTitle")}
            value={formatINR(mtd.current)}
            detail={
              mtd.changePct === null ? (
                t("noLastMonth")
              ) : (
                <>
                  <span className={cn("inline-flex items-center gap-1 font-medium", mtd.changePct >= 0 ? "text-(--dash-green)" : "text-(--dash-red)")}>
                    {mtd.changePct >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    {Math.abs(mtd.changePct)}%
                  </span>
                  <br />
                  {t("vsLastMonth")}
                </>
              )
            }
            href="/reports?r=collections"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card data-testid="stock">
            <CardHeader>
              <CardTitle>{t("statusTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
              <Donut slices={statusSlices} center={String(d.stock.owned)} centerLabel={t("stockTotal")} emptyLabel="0" />
              <ul className="grid w-full gap-2.5 text-sm">
                {statusSlices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2" data-testid={`stock-${s.key}`}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-medium tabular-nums">{s.value}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(s.value, d.stock.owned)}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card data-testid="trend">
            <CardHeader>
              <CardTitle>{t("trendTitle")}</CardTitle>
              <CardDescription>{t("trendHint")}</CardDescription>
              <CardAction>
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{t("trendChip")}</span>
              </CardAction>
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

          <Card data-testid="by-item">
            <CardHeader>
              <CardTitle>{t("itemTitle")}</CardTitle>
              <CardDescription>{t("itemHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
              <Donut slices={itemSlices} center={compactINR(total)} centerLabel={t("itemCenter")} emptyLabel="—" />
              <ul className="grid w-full gap-2.5 text-sm" data-testid="revenue-by-item">
                {itemSlices.length === 0 && <li className="text-muted-foreground">{t("itemNone")}</li>}
                {itemSlices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="font-medium tabular-nums">{compactINR(s.value)}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{pct(s.value, total)}%</span>
                  </li>
                ))}
                {discount > 0 && <li className="pt-1 text-xs text-muted-foreground">{t("itemDiscount", { amount: formatINR(discount) })}</li>}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
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

          <Card>
            <CardHeader>
              <CardTitle>{t("overdueTitle")}</CardTitle>
              <CardDescription>{t("overdueHint", { days: d.threshold })}</CardDescription>
              <ViewAll href="/orders?status=OPEN">{t("viewAll")}</ViewAll>
            </CardHeader>
            <CardContent className="px-0">
              {overdueRows.length === 0 ? (
                <p className="px-5 text-sm text-muted-foreground">{t("longNone", { days: d.threshold })}</p>
              ) : (
                <Table data-testid="long-rentals" className="border-t">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("col.order")}</TableHead>
                      <TableHead>{t("col.customer")}</TableHead>
                      <TableHead>{t("col.item")}</TableHead>
                      <TableHead>{t("col.outSince")}</TableHead>
                      <TableHead className="text-right">{t("col.daysOut")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueRows.map((l) => (
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
                            title={formatPhone(l.customer.phone)}
                          >
                            <Phone className="size-3" />
                            {t("call")}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader title={t("title")}>{t("dayTitle", { date: formatDate(date) })}</PageHeader>

      <form className="mb-4 flex max-w-md items-end gap-2" method="get">
        <label className="grid flex-1 gap-1.5 text-sm font-medium">
          {t("date")}
          <Input type="date" name="date" defaultValue={date} max={today} className="h-10" />
        </label>
        <Button type="submit" variant="outline" size="lg">
          {t("show")}
        </Button>
      </form>

      <div className="grid max-w-4xl gap-4">
        <Card>
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
            <p className="mt-2 text-right text-base font-semibold tabular-nums">
              {t("net")}: {formatINR(day.net)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            {day.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dayNone")}</p>
            ) : (
              <ul className="divide-y text-sm" data-testid="day-payments">
                {day.rows.map((p) => (
                  <li key={p.id} className={cn("grid grid-cols-[1fr_auto] gap-x-3 py-2", p.status === "VOIDED" && "text-muted-foreground")}>
                    <span className={cn(p.status === "VOIDED" && "line-through")}>
                      <Link href={`/print/receipt/${p.id}`} target="_blank" className="font-medium underline-offset-4 hover:underline">
                        {p.receiptNo}
                      </Link>{" "}
                      · {t(`type.${p.type}`)} · {t(`mode.${p.mode}`)}
                    </span>
                    <span className="text-right tabular-nums">
                      {p.type === "REFUND" ? "− " : ""}
                      {formatINR(toPaise(p.amount))}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">
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
    </>
  );
}

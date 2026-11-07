import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintLinks } from "@/components/print-links";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { Statement } from "@/modules/invoices/statement";

/** "How much do I owe so far?" — rent on returned batches plus rent accrued to today on what is still out. */
export async function StatementCard({
  statement: s,
  orderId,
  received,
  refunded,
}: {
  statement: Statement;
  orderId: number;
  received: number;
  refunded: number;
}) {
  const t = await getTranslations("invoices");
  const tr = await getTranslations("returns");
  const tp = await getTranslations("payments");
  const balance = s.total - received + refunded;
  const ml = (await getLocale()) === "ml";
  const name = (p: { name: string; nameMl: string | null }, serial: string | null) => `${ml && p.nameMl ? p.nameMl : p.name}${serial ? ` ${serial}` : ""}`;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("statementTitle")}</CardTitle>
        <CardDescription>{t("statementAsOf", { date: formatDate(s.today) })}</CardDescription>
        <CardAction>
          <PrintLinks doc="statement" id={orderId} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm" data-testid="statement">
        {s.out.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-muted-foreground">{t("stillOut")}</h3>
            <ul className="mt-1 divide-y">
              {s.out.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>
                    {name(o.product, o.serialNo)}
                    {!o.serialNo && ` × ${o.qtyOutstanding}`} <span className="text-muted-foreground">· {t("since", { date: formatDate(o.issueDate) })}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="text-muted-foreground">
                      {o.qtyOutstanding} × {formatINR(o.ratePaise)} × {tr("days", { count: o.daysSoFar })} ={" "}
                    </span>
                    {formatINR(o.accrued)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {s.returned.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-muted-foreground">{t("returnedBatches")}</h3>
            <ul className="mt-1 divide-y">
              {s.returned.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>
                    {name(r.product, r.serialNo)}
                    {!r.serialNo && ` × ${r.quantity}`}{" "}
                    <span className="text-muted-foreground">
                      · {formatDate(r.issueDate)} → {formatDate(r.returnDate)}
                      {r.condition !== "GOOD" && ` · ${tr(`condition.${r.condition}`)}`}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="text-muted-foreground">{tr("days", { count: r.days })} · </span>
                    {formatINR(r.rent)}
                    {r.damage > 0 && <span className="text-muted-foreground"> + {formatINR(r.damage)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-3 tabular-nums" data-testid="statement-totals">
          <dt>{t("returnedRent")}</dt>
          <dd className="text-right">{formatINR(s.returnedRent)}</dd>
          <dt>{t("accruedRent")}</dt>
          <dd className="text-right">{formatINR(s.accruedRent)}</dd>
          <dt>{t("damageTotal")}</dt>
          <dd className="text-right">{formatINR(s.damageTotal)}</dd>
          <dt className="font-semibold">{t("totalSoFar")}</dt>
          <dd className="text-right text-base font-semibold">{formatINR(s.total)}</dd>
          <dt>{tp("received")}</dt>
          <dd className="text-right">− {formatINR(received)}</dd>
          {refunded > 0 && (
            <>
              <dt>{tp("refunded")}</dt>
              <dd className="text-right">+ {formatINR(refunded)}</dd>
            </>
          )}
          <dt className="border-t pt-1 font-semibold">{balance < 0 ? tp("excess") : tp("balance")}</dt>
          <dd className="border-t pt-1 text-right text-base font-semibold">{formatINR(Math.abs(balance))}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

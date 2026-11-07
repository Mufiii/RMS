import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, fromDbDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { orderPayments } from "@/modules/payments/queries";

type Payments = Awaited<ReturnType<typeof orderPayments>>;

/** Money on the order: what is due, every payment and refund, and the balance. */
export async function PaymentsCard({
  payments,
  due,
  invoiced,
  received,
  refunded,
  balance,
}: {
  payments: Payments;
  due: number;
  invoiced: boolean;
  received: number;
  refunded: number;
  balance: number;
}) {
  const t = await getTranslations("payments");
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("paymentsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {payments.length === 0 ? (
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="divide-y" data-testid="payments">
            {payments.map((p) => (
              <li key={p.id} className={cn("grid grid-cols-[1fr_auto] gap-x-3 py-2", p.status === "VOIDED" && "text-muted-foreground")}>
                <span className={cn(p.status === "VOIDED" && "line-through")}>
                  <Link href={`/print/receipt/${p.id}`} target="_blank" className="font-medium underline-offset-4 hover:underline">
                    {p.receiptNo}
                  </Link>{" "}
                  · {t(`type.${p.type}`)} · {t(`mode.${p.mode}`)}
                  {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                </span>
                <span className={cn("text-right tabular-nums", p.type === "REFUND" && "text-amber-700 dark:text-amber-400", p.status === "VOIDED" && "line-through")}>
                  {p.type === "REFUND" ? "− " : ""}
                  {formatINR(toPaise(p.amount))}
                </span>
                <span className="col-span-2 text-xs text-muted-foreground">
                  {formatDate(fromDbDate(p.paymentDate))} · {p.receivedBy.fullName}
                  {p.notes && <> · “{p.notes}”</>}
                  {p.status === "VOIDED" && <> · {t("voidedBy", { name: p.voidedBy?.fullName ?? "—", reason: p.voidReason ?? "" })}</>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-3 tabular-nums" data-testid="money-summary">
          <dt>{invoiced ? t("billed") : t("soFar")}</dt>
          <dd className="text-right">{formatINR(due)}</dd>
          <dt>{t("received")}</dt>
          <dd className="text-right">{formatINR(received)}</dd>
          {refunded > 0 && (
            <>
              <dt>{t("refunded")}</dt>
              <dd className="text-right">{formatINR(refunded)}</dd>
            </>
          )}
          <dt className="font-semibold">{balance < 0 ? t("excess") : t("balance")}</dt>
          <dd className={cn("text-right text-base font-semibold", balance < 0 && "text-amber-700 dark:text-amber-400")}>
            {balance === 0 && invoiced ? t("settled") : formatINR(Math.abs(balance))}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { businessToday, formatDate, formatDateTime, fromDbDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { orderInvoices } from "@/modules/invoices/queries";
import { buildStatement } from "@/modules/invoices/statement";
import { getOrder, issuableProducts, orderAuditTrail } from "@/modules/orders/queries";
import { OrderStatusBadge } from "../status-badge";
import { CancelOrderForm, IssueForm, VoidLineForm } from "./order-forms";
import { GenerateInvoiceForm } from "./invoice-forms";
import { ReturnForm, VoidReturnForm } from "./return-form";
import { StatementCard } from "./statement-card";

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const me = await requirePagePermission("order.create");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  const isOpen = order.status === "OPEN";
  const [trail, invoices, products] = await Promise.all([
    orderAuditTrail(id),
    orderInvoices(id),
    isOpen && can(me.role, "issue.create") ? issuableProducts() : Promise.resolve([]),
  ]);
  const { saved } = await searchParams;
  const t = await getTranslations("orders");
  const ti = await getTranslations("invoices");
  const ml = (await getLocale()) === "ml";

  const name = (p: { name: string; nameMl: string | null }) => (ml && p.nameMl ? p.nameMl : p.name);
  const allLines = order.issues.flatMap((i) => i.lines.map((l) => ({ ...l, issueDate: fromDbDate(i.issueDate) })));
  const out = allLines.filter((l) => l.status === "ACTIVE" && l.qtyReturned < l.quantity);
  const voidable = allLines.filter((l) => l.status === "ACTIVE" && l.qtyReturned === 0);
  const lineLabel = (l: (typeof allLines)[number]) =>
    `${name(l.product)}${l.unit ? ` ${l.unit.serialNo}` : ` × ${l.quantity}`} · ${formatDate(l.issueDate)}`;
  const isAdmin = can(me.role, "record.void");
  const tr = await getTranslations("returns");
  const activeLines = allLines.filter((l) => l.status === "ACTIVE");
  const allReturned = isOpen && activeLines.length > 0 && out.length === 0;
  const statement = isOpen && activeLines.length > 0 ? buildStatement(order, businessToday()) : null;
  const liveInvoice = invoices.find((i) => i.status === "ISSUED");
  const returnable = out.map((l) => ({
    id: l.id,
    label: `${name(l.product)}${l.unit ? ` ${l.unit.serialNo}` : ""}`,
    serial: l.unit?.serialNo ?? null,
    outstanding: l.quantity - l.qtyReturned,
    issuedOn: formatDate(l.issueDate),
  }));
  const voidableReturns = order.returns
    .filter((r) => r.status === "ACTIVE")
    .map((r) => ({
      id: r.id,
      label: `#${r.id} · ${formatDate(fromDbDate(r.returnDate))} · ${r.lines
        .map((l) => `${name(l.issueLine.product)}${l.issueLine.unit ? ` ${l.issueLine.unit.serialNo}` : ` × ${l.quantity}`}`)
        .join(", ")}`,
    }));

  return (
    <>
      <Link href="/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader title={order.orderNo} actions={<OrderStatusBadge status={order.status} label={t(`statusName.${order.status}`)} className="h-8 px-3 text-sm" />}>
        <Link href={`/customers/${order.customer.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          #{order.customer.id} {order.customer.name}
        </Link>{" "}
        · {formatPhone(order.customer.phone)} · {t("openedOn")} {formatDate(fromDbDate(order.openedOn))}
        {order.siteAddress && <div>{order.siteAddress}</div>}
      </PageHeader>

      {saved === "created" && (
        <p role="status" className="mb-4 max-w-5xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {t("createdOrder")}
        </p>
      )}
      {order.status === "CANCELLED" && (
        <p className="mb-4 max-w-5xl rounded-lg bg-muted px-3 py-2 text-sm">
          {t("cancelledBy", {
            name: order.cancelledBy?.fullName ?? "—",
            date: order.cancelledAt ? formatDateTime(order.cancelledAt) : "",
            reason: order.cancelReason ?? "",
          })}
        </p>
      )}

      {saved === "invoiceCancelled" && (
        <p role="status" className="mb-4 max-w-5xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {ti("cancelledNotice")}
        </p>
      )}
      {order.status === "CLOSED" && liveInvoice && (
        <p className="mb-4 max-w-5xl rounded-lg bg-muted px-3 py-2 text-sm" data-testid="closed-notice">
          {ti.rich("closedWith", {
            no: liveInvoice.invoiceNo,
            total: formatINR(toPaise(liveInvoice.total)),
            link: (chunks) => (
              <Link href={`/invoices/${liveInvoice.id}`} className="font-medium underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      {allReturned && (
        <p role="status" className="mb-4 max-w-5xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {tr("allReturned")}
        </p>
      )}

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("itemsOutTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {out.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("nothingOut")}</p>
            ) : (
              <ul className="divide-y text-sm" data-testid="items-out">
                {out.map((l) => (
                  <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                    <span className="font-medium">
                      {name(l.product)}
                      {l.unit && <span className="ml-1 text-muted-foreground">{l.unit.serialNo}</span>}
                    </span>
                    <span className="text-right tabular-nums">
                      {t("outstanding")}: <b>{l.quantity - l.qtyReturned}</b>
                      {l.qtyReturned > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({t("returned")} {l.qtyReturned}/{l.quantity})
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">
                      {t("issuedOn")} {formatDate(l.issueDate)} · {t("perDay", { rate: formatINR(toPaise(l.dailyRate)) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {allReturned && statement && can(me.role, "invoice.create") && (
          <GenerateInvoiceForm orderId={order.id} total={formatINR(statement.total)} canDiscount={can(me.role, "invoice.discount")} />
        )}

        {statement && can(me.role, "statement.print") && <StatementCard statement={statement} />}

        {isOpen && can(me.role, "return.create") && returnable.length > 0 && (
          <ReturnForm orderId={order.id} lines={returnable} canBackdate={can(me.role, "date.backdate")} today={businessToday()} />
        )}

        {invoices.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{ti("invoicesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm" data-testid="order-invoices">
                {invoices.map((i) => (
                  <li key={i.id} className={cn("flex flex-wrap justify-between gap-x-3 py-2", i.status === "CANCELLED" && "text-muted-foreground")}>
                    <span>
                      <Link href={`/invoices/${i.id}`} className={cn("font-medium underline-offset-4 hover:underline", i.status === "CANCELLED" && "line-through")}>
                        {i.invoiceNo}
                      </Link>{" "}
                      · {formatDate(fromDbDate(i.invoiceDate))} · {ti(`statusName.${i.status}`)}
                      {i.cancelReason && <> — “{i.cancelReason}”</>}
                    </span>
                    <span className="tabular-nums">{formatINR(toPaise(i.total))}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{tr("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm" data-testid="returns-history">
            {order.returns.length === 0 && <p className="text-muted-foreground">{tr("noReturns")}</p>}
            {order.returns.map((r) => (
              <section key={r.id} className={cn(r.status === "VOIDED" && "text-muted-foreground")}>
                <h3 className="text-xs text-muted-foreground">
                  #{r.id} · {tr("returnBy", { date: formatDate(fromDbDate(r.returnDate)), name: r.receivedBy.fullName })}
                  {r.isBackdated && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-amber-800 dark:text-amber-300">{tr("backdated")}</span>}
                </h3>
                <ul className={cn("mt-1 space-y-1", r.status === "VOIDED" && "line-through")}>
                  {r.lines.map((l) => (
                    <li key={l.id} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {name(l.issueLine.product)}
                        {l.issueLine.unit ? ` ${l.issueLine.unit.serialNo}` : ` × ${l.quantity}`}{" "}
                        <span
                          className={cn(
                            "rounded px-1.5 text-xs",
                            l.condition === "GOOD" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                            l.condition === "DAMAGED" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                            l.condition === "LOST" && "bg-destructive/10 text-destructive",
                          )}
                        >
                          {tr(`condition.${l.condition}`)}
                        </span>
                        {l.damageNote && <span className="text-muted-foreground"> — “{l.damageNote}”</span>}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {tr("days", { count: l.days })} · {tr("rent", { amount: formatINR(toPaise(l.rentAmount)) })}
                        {toPaise(l.damageAmount) > 0 && <> · {tr("chargeAmount", { amount: formatINR(toPaise(l.damageAmount)) })}</>}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.notes && <p className="text-muted-foreground">“{r.notes}”</p>}
                {r.status === "VOIDED" && (
                  <p className="text-xs">{tr("voidedBy", { name: r.voidedBy?.fullName ?? "—", reason: r.voidReason ?? "" })}</p>
                )}
              </section>
            ))}
          </CardContent>
        </Card>

        {isOpen && can(me.role, "issue.create") && (
          <IssueForm
            orderId={order.id}
            products={products}
            canBackdate={can(me.role, "date.backdate")}
            today={businessToday()}
            minDate={fromDbDate(order.openedOn)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {order.issues.length === 0 && <p className="text-muted-foreground">{t("nothingOut")}</p>}
            {order.issues.map((issue) => (
              <section key={issue.id}>
                <h3 className="text-xs text-muted-foreground">
                  {t("issueBy", { date: formatDate(fromDbDate(issue.issueDate)), name: issue.issuedBy.fullName })}
                  {issue.isBackdated && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-amber-800 dark:text-amber-300">{t("backdated")}</span>}
                </h3>
                {issue.notes && <p className="text-muted-foreground">“{issue.notes}”</p>}
                <ul className="mt-1 space-y-1">
                  {issue.lines.map((l) => (
                    <li key={l.id} className={cn(l.status === "VOIDED" && "text-muted-foreground")}>
                      <span className={cn(l.status === "VOIDED" && "line-through")}>
                        {name(l.product)}
                        {l.unit ? ` ${l.unit.serialNo}` : ` × ${l.quantity}`} · {formatINR(toPaise(l.dailyRate))}
                      </span>
                      {l.status === "VOIDED" && (
                        <div className="text-xs">
                          {t("voided")} — {t("voidedBy", { name: l.voidedBy?.fullName ?? "—", reason: l.voidReason ?? "" })}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("changesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {trail.map((a) => (
                <li key={String(a.id)}>
                  <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span> · <code className="text-xs">{a.action}</code> ·{" "}
                  {a.actor?.fullName ?? "—"}
                  {a.reason && <span className="text-muted-foreground"> — “{a.reason}”</span>}
                </li>
              ))}
            </ul>
            {order.notes && <p className="mt-3 text-sm whitespace-pre-line">{order.notes}</p>}
            <p className="mt-3 text-xs text-muted-foreground">{t("createdBy", { name: order.createdBy.fullName })}</p>
          </CardContent>
        </Card>

        {isOpen && isAdmin && <VoidReturnForm orderId={order.id} returns={voidableReturns} />}
        {isOpen && isAdmin && <VoidLineForm orderId={order.id} lines={voidable.map((l) => ({ id: l.id, label: lineLabel(l) }))} />}
        {isOpen && can(me.role, "record.cancel") && <CancelOrderForm orderId={order.id} />}
      </div>
    </>
  );
}

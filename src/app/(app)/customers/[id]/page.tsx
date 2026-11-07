import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Pencil, Phone, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { businessToday, formatDate, formatDateTime, fromDbDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { orderBalances } from "@/modules/payments/queries";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { customerAuditTrail, getCustomer } from "@/modules/customers/queries";
import { customerItemsOut, customerOrders } from "@/modules/orders/queries";
import { OrderStatusBadge } from "../../orders/status-badge";
import { ToggleCustomerForm } from "./toggle-form";

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const me = await requirePagePermission("customer.read");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [c, trail, orders, itemsOut, owed] = await Promise.all([
    getCustomer(id),
    customerAuditTrail(id),
    customerOrders(id),
    customerItemsOut(id),
    orderBalances(id, businessToday()),
  ]);
  if (!c) notFound();
  const { saved } = await searchParams;
  const t = await getTranslations("customers");
  const to = await getTranslations("orders");
  const ml = (await getLocale()) === "ml";
  const canWrite = can(me.role, "customer.write");

  const row = (label: string, value: ReactNode) =>
    value ? (
      <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="min-w-0 break-words whitespace-pre-line">{value}</dd>
      </div>
    ) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/customers", label: t("title") }}
        title={c.name}
        actions={
          <>
            <a href={`tel:${c.phone}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Phone />
              {t("call")}
            </a>
            {canWrite && (
              <Link href={`/customers/${c.id}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Pencil />
                {t("edit")}
              </Link>
            )}
            {c.isActive && can(me.role, "order.create") && (
              <Link href={`/orders/new?customer=${c.id}`} className={buttonVariants({ size: "lg" })}>
                <Plus />
                {t("newOrder")}
              </Link>
            )}
          </>
        }
      >
        <span className="tabular-nums">#{c.id}</span>
        <Badge variant={c.isActive ? "outline" : "destructive"} className="ml-2">
          {c.isActive ? t("active") : t("inactive")}
        </Badge>
      </PageHeader>

      {(saved === "created" || saved === "updated") && (
        <Notice tone="success">{saved === "created" ? t("created") : t("updated")}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {row(t("phone"), formatPhone(c.phone))}
              {row(t("altPhone"), c.altPhone && formatPhone(c.altPhone))}
              {row(t("address"), c.address)}
              {row(
                t("idProofType"),
                c.idProofType && `${t(`idProof.${c.idProofType}` as "idProof.OTHER")}${c.idProofNumber ? ` · ${c.idProofNumber}` : ""}`,
              )}
              {row(t("notes"), c.notes)}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("createdBy", { name: c.createdBy.fullName, date: formatDateTime(c.createdAt) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <section data-testid="customer-outstanding">
              <h3 className="font-medium">{t("outstandingTitle")}</h3>
              {owed.billedDue === 0 && owed.creditHeld === 0 && owed.openSoFar === 0 ? (
                <p className="text-muted-foreground">{t("outstandingNone")}</p>
              ) : (
                <>
                  <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 tabular-nums">
                    {owed.billedDue > 0 && (
                      <>
                        <dt>{t("outstandingBilled")}</dt>
                        <dd className="text-right font-semibold">{formatINR(owed.billedDue)}</dd>
                      </>
                    )}
                    {owed.openSoFar !== 0 && (
                      <>
                        <dt>{t("outstandingOpen")}</dt>
                        <dd className="text-right">{formatINR(owed.openSoFar)}</dd>
                      </>
                    )}
                    {owed.creditHeld > 0 && (
                      <>
                        <dt>{t("outstandingCredit")}</dt>
                        <dd className="text-right text-amber-700 dark:text-amber-400">{formatINR(owed.creditHeld)}</dd>
                      </>
                    )}
                  </dl>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {owed.rows
                      .filter((r) => r.balance !== 0)
                      .map((r) => (
                        <li key={r.id} className="flex justify-between gap-3">
                          <Link href={`/orders/${r.id}`} className="underline-offset-4 hover:underline">
                            {r.orderNo}
                            {r.invoice && ` · ${r.invoice.invoiceNo}`}
                          </Link>
                          <span className="tabular-nums">{formatINR(r.balance)}</span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </section>
            <section data-testid="customer-items-out">
              <h3 className="font-medium">{t("itemsOutTitle")}</h3>
              {itemsOut.length === 0 ? (
                <p className="text-muted-foreground">{t("itemsOutEmpty")}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {itemsOut.map((l) => (
                    <li key={l.id} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {ml && l.product.nameMl ? l.product.nameMl : l.product.name}
                        {l.unit ? ` ${l.unit.serialNo}` : ` × ${l.quantity - l.qtyReturned}`}
                      </span>
                      <span className="text-muted-foreground">
                        <Link href={`/orders/${l.order.id}`} className="underline-offset-4 hover:underline">
                          {l.order.orderNo}
                        </Link>{" "}
                        · {formatDate(fromDbDate(l.issue.issueDate))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section data-testid="customer-orders">
              <h3 className="font-medium">{t("ordersTitle")}</h3>
              {orders.length === 0 ? (
                <p className="text-muted-foreground">{t("ordersEmpty")}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3">
                      <Link href={`/orders/${o.id}`} className="font-medium tabular-nums underline-offset-4 hover:underline">
                        {o.orderNo}
                      </Link>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {formatDate(fromDbDate(o.openedOn))}
                        {o.status === "OPEN" && <span>· {to("piecesOut", { count: o.piecesOut })}</span>}
                        <OrderStatusBadge status={o.status} label={to(`statusName.${o.status}`)} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("changesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {trail.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {trail.map((a) => (
                  <li key={String(a.id)}>
                    <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span> ·{" "}
                    <code className="text-xs">{a.action}</code> · {a.actor?.fullName ?? "—"}
                    {a.reason && <span className="text-muted-foreground"> — “{a.reason}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {canWrite && <ToggleCustomerForm customerId={c.id} isActive={c.isActive} />}
      </div>
    </>
  );
}

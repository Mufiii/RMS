import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { customerAuditTrail, getCustomer } from "@/modules/customers/queries";
import { ToggleCustomerForm } from "./toggle-form";

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const me = await requirePagePermission("customer.read");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [c, trail] = await Promise.all([getCustomer(id), customerAuditTrail(id)]);
  if (!c) notFound();
  const { saved } = await searchParams;
  const t = await getTranslations("customers");
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
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("title")}
      </Link>
      <PageHeader
        title={c.name}
        actions={
          <>
            <a href={`tel:${c.phone}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Phone />
              {t("call")}
            </a>
            {canWrite && (
              <Link href={`/customers/${c.id}/edit`} className={buttonVariants({ size: "lg" })}>
                <Pencil />
                {t("edit")}
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
        <p role="status" className="mb-4 max-w-2xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {saved === "created" ? t("created") : t("updated")}
        </p>
      )}

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
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
            {[
              [t("outstandingTitle"), t("outstandingSoon")],
              [t("itemsOutTitle"), t("itemsOutSoon")],
              [t("ordersTitle"), t("ordersSoon")],
            ].map(([title, soon]) => (
              <section key={title}>
                <h3 className="font-medium">{title}</h3>
                <p className="text-muted-foreground">{soon}</p>
              </section>
            ))}
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

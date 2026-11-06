import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { available, countersOf } from "@/modules/inventory/client-safe";
import { getProduct, productAuditTrail, productMovements } from "@/modules/products/queries";
import { AddUnitsForm, AdjustQuantityForm, ToggleProductForm, UnitActionForm } from "./stock-forms";

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  RENTED: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  UNDER_REPAIR: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  LOST: "bg-destructive/10 text-destructive",
  RETIRED: "bg-muted text-muted-foreground",
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const me = await requirePagePermission("product.read");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [p, movements, trail] = await Promise.all([getProduct(id), productMovements(id), productAuditTrail(id)]);
  if (!p) notFound();
  const { saved } = await searchParams;
  const t = await getTranslations();
  const ml = (await getLocale()) === "ml";
  const c = countersOf(p);
  const avail = available(c);
  const canEdit = can(me.role, "product.write");
  const canAdjust = can(me.role, "stock.adjust");

  const tiles = [
    { label: t("products.owned"), value: c.owned },
    { label: t("products.out"), value: c.out },
    { label: t("products.repair"), value: c.repair },
    { label: t("products.available"), value: avail, strong: true },
  ];

  return (
    <>
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("products.title")}
      </Link>
      <PageHeader
        title={ml && p.nameMl ? p.nameMl : p.name}
        actions={
          canEdit && (
            <Link href={`/products/${p.id}/edit`} className={buttonVariants({ size: "lg" })}>
              <Pencil />
              {t("products.edit")}
            </Link>
          )
        }
      >
        {p.code && <span className="mr-2 tabular-nums">{p.code}</span>}
        <span className="mr-2">
          {ml && p.category.nameMl ? p.category.nameMl : p.category.name} · {t(`products.trackingShort.${p.tracking}`)}
        </span>
        <Badge variant={p.isActive ? "outline" : "destructive"}>
          {p.isActive ? t("customers.active") : t("products.inactiveBadge")}
        </Badge>
      </PageHeader>

      {(saved === "created" || saved === "updated") && (
        <p role="status" className="mb-4 max-w-3xl rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {saved === "created" ? t("products.created") : t("products.updated")}
        </p>
      )}

      <div className="mb-4 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">{tile.label}</div>
            <div className={cn("text-2xl tabular-nums", tile.strong && "font-semibold", tile.strong && tile.value === 0 && "text-destructive")}>
              {tile.value}
            </div>
          </div>
        ))}
        <div className="col-span-2 rounded-xl border p-3 sm:col-span-1">
          <div className="text-xs text-muted-foreground">{t("products.dailyRate")}</div>
          <div className="text-2xl tabular-nums">{formatINR(toPaise(p.dailyRate))}</div>
        </div>
      </div>

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        {p.tracking === "SERIALISED" && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {t("products.units")} ({p.units.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.units.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("products.noUnits")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {p.units.map((u) => (
                    <li key={u.id} className={cn("rounded-lg px-2.5 py-1 text-sm", STATUS_STYLE[u.status])}>
                      <span className="font-medium">{u.serialNo}</span>{" "}
                      <span className="text-xs">· {t(`products.unitStatus.${u.status}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {canAdjust && p.tracking === "QUANTITY" && <AdjustQuantityForm productId={p.id} />}
        {canAdjust && p.tracking === "SERIALISED" && (
          <>
            <AddUnitsForm productId={p.id} />
            <UnitActionForm units={p.units.map((u) => ({ id: u.id, serialNo: u.serialNo, status: u.status }))} />
          </>
        )}

        <Card className={cn(!canAdjust && "lg:col-span-2")}>
          <CardHeader>
            <CardTitle>{t("products.historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("products.noHistory")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                    <span>
                      {t(`stock.move.${m.type}`)}
                      {m.unit && <span className="text-muted-foreground"> · {m.unit.serialNo}</span>}
                    </span>
                    <span className="text-right tabular-nums">
                      {m.deltaOwned !== 0 && (
                        <span className={m.deltaOwned > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
                          {t("products.owned")} {signed(m.deltaOwned)}
                        </span>
                      )}
                      {m.deltaOwned !== 0 && m.deltaRepair !== 0 && " · "}
                      {m.deltaRepair !== 0 && (
                        <span className="text-amber-700 dark:text-amber-400">
                          {t("products.repair")} {signed(m.deltaRepair)}
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)} · {m.createdBy.fullName}
                      {m.reason && <> — “{m.reason}”</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("products.details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {p.nameMl && !ml && <p lang="ml">{p.nameMl}</p>}
            {ml && <p>{p.name}</p>}
            {p.description && <p className="whitespace-pre-line text-muted-foreground">{p.description}</p>}
            <div>
              <h3 className="mb-1 font-medium">{t("products.changesTitle")}</h3>
              {trail.length === 0 ? (
                <p className="text-muted-foreground">{t("products.noChanges")}</p>
              ) : (
                <ul className="space-y-1">
                  {trail.map((a) => (
                    <li key={String(a.id)}>
                      <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span> ·{" "}
                      <code className="text-xs">{a.action}</code> · {a.actor?.fullName ?? "—"}
                      {a.action === "RATE_CHANGE" && a.summary && typeof a.summary === "object" && "before" in a.summary && (
                        <span className="text-muted-foreground">
                          {" "}
                          ₹{String((a.summary as { before: string }).before)} → ₹{String((a.summary as { after: string }).after)}
                        </span>
                      )}
                      {a.reason && <span className="text-muted-foreground"> — “{a.reason}”</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {canEdit && <ToggleProductForm productId={p.id} isActive={p.isActive} />}
      </div>
    </>
  );
}

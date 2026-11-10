import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { requirePagePermission } from "@/modules/auth/session";
import { reconcile } from "@/modules/inventory/service";
import type { Counters } from "@/modules/inventory/client-safe";

const fmt = (c: Counters | null) => (c ? `${c.owned} / ${c.out} / ${c.repair}` : "—");

export default async function ReconcilePage() {
  await requirePagePermission("stock.adjust");
  const t = await getTranslations();
  const rows = await reconcile();
  const bad = rows.filter((r) => !r.ok);

  return (
    <>
      <PageHeader title={t("stock.reconcileTitle")} back={{ href: "/products", label: t("products.title") }}>{t("stock.reconcileIntro")}</PageHeader>

      {bad.length === 0 ? (
        <Notice tone="success">{t("stock.reconcileAllOk", { count: rows.length })}</Notice>
      ) : (
        <Notice tone="error">{t("stock.reconcileProblems", { count: bad.length })}</Notice>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.2_0.02_262/0.05)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("products.name")}</TableHead>
              <TableHead className="text-right">
                {t("stock.stored")}
                <div className="font-normal text-muted-foreground">
                  {t("products.owned")} / {t("products.out")} / {t("products.repair")}
                </div>
              </TableHead>
              <TableHead className="text-right">{t("stock.fromLedger")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("stock.fromUnits")}</TableHead>
              <TableHead>{t("stock.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.productId} className={r.ok ? undefined : "bg-destructive/5"}>
                <TableCell>
                  <Link href={`/products/${r.productId}`} className="underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.stored)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.fromLedger)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{fmt(r.fromUnits)}</TableCell>
                <TableCell className={r.ok ? "text-emerald-700 dark:text-emerald-400" : "font-medium text-destructive"}>
                  {r.ok ? t("stock.ok") : t("stock.mismatch")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

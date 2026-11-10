import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { businessToday, formatDate, isIsoDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/modules/auth/session";
import { presenter } from "@/modules/reports/present";
import { parseRange, RANGED, REPORTS, runReport, type ReportName } from "@/modules/reports/queries";
import type { Cell, ColumnKind } from "@/modules/reports/table";

const NUMERIC: ReadonlySet<ColumnKind> = new Set(["int", "money", "pct"]);

function show(kind: ColumnKind, v: Cell, text: (v: Cell) => Cell = (x) => x) {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "money") return formatINR(Number(v));
  if (kind === "date") return formatDate(String(v));
  if (kind === "pct") return `${Number(v).toFixed(1)}%`;
  return String(kind === "text" ? text(v) : v);
}

/** Admin reports: one table per report, the same data as its CSV download. */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requirePagePermission("report.view");
  const t = await getTranslations("reports");
  const sp = await searchParams;
  const name: ReportName = (REPORTS as readonly string[]).includes(String(sp.r)) ? (sp.r as ReportName) : "inventory";
  const today = businessToday();
  const range = parseRange(sp, today, isIsoDate);
  const ranged = RANGED.has(name);
  const table = await runReport(name, range, today);
  const p = await presenter();
  const qs = new URLSearchParams(ranged ? { from: range.from, to: range.to } : {}).toString();

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <a href={`/api/reports/${name}${qs ? `?${qs}` : ""}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <FileDown />
            {t("csv")}
          </a>
        }
      >
        {t(`hint.${name}`)}
      </PageHeader>

      <nav className="mb-4 flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("title")}>
        {REPORTS.map((r) => (
          <Link
            key={r}
            href={`/reports?r=${r}${RANGED.has(r) && qs ? `&${qs}` : ""}`}
            aria-current={r === name ? "page" : undefined}
            className={cn(
              "inline-flex min-h-8 items-center rounded-md px-3 py-1 font-medium transition-colors duration-150",
              r === name ? "bg-card text-primary shadow-[0_1px_2px_oklch(0.2_0.02_262/0.12)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`tabs.${r}`)}
          </Link>
        ))}
      </nav>

      {ranged && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="r" value={name} />
          <label className="grid gap-1.5 text-sm font-medium">
            {t("from")}
            <Input type="date" name="from" defaultValue={range.from} max={today} className="w-44" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t("to")}
            <Input type="date" name="to" defaultValue={range.to} max={today} className="w-44" />
          </label>
          <Button type="submit" variant="outline" size="lg">
            {t("show")}
          </Button>
        </form>
      )}

      <Card className="max-w-full py-0">
        <CardContent className="overflow-x-auto px-0">
          {table.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full min-w-max text-sm" data-testid="report">
              <thead>
                <tr className="border-b bg-muted/60 text-left text-xs tracking-wide text-muted-foreground uppercase">
                  {table.columns.map((c) => (
                    <th key={c.key} scope="col" className={cn("px-3 py-2.5 font-semibold whitespace-nowrap first:pl-5 last:pr-5", NUMERIC.has(c.kind) && "text-right")}>
                      {p.header(c.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className={cn("border-b last:border-0", r.status === "voided" && "text-muted-foreground line-through")}>
                    {table.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-1.5 whitespace-nowrap", NUMERIC.has(c.kind) && "text-right tabular-nums")}>
                        {show(c.kind, r[c.key] ?? null, (v) => p.text(c.key, v))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.totals && (
                <tfoot>
                  <tr className="border-t-2 font-semibold" data-testid="report-totals">
                    {table.columns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-2 whitespace-nowrap", NUMERIC.has(c.kind) && "text-right tabular-nums")}>
                        {table.totals![c.key] === undefined || table.totals![c.key] === null ? "" : show(c.kind, table.totals![c.key], (v) => p.text(c.key, v, true))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <p className="mt-2 px-4 text-xs text-muted-foreground">
            {t("rows", { count: table.rows.length })}
            {ranged && ` · ${formatDate(range.from)} → ${formatDate(range.to)}`}
          </p>
        </CardContent>
      </Card>
    </>
  );
}

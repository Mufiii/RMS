import type { NextRequest } from "next/server";
import { businessToday, isIsoDate } from "@/lib/dates";
import { ForbiddenError } from "@/lib/errors";
import { requireActionPermission } from "@/modules/auth/session";
import { presenter, translateCells } from "@/modules/reports/present";
import { parseRange, RANGED, REPORTS, runReport, type ReportName } from "@/modules/reports/queries";
import { toCsv } from "@/modules/reports/table";

/** GET /api/reports/{name}?from=&to= → the report as CSV (opens in Excel / Google Sheets). Admin only. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/reports/[report]">) {
  const { report } = await ctx.params;
  if (!(REPORTS as readonly string[]).includes(report)) return new Response("Not found", { status: 404 });
  try {
    await requireActionPermission("report.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  const name = report as ReportName;
  const today = businessToday();
  const range = parseRange(Object.fromEntries(req.nextUrl.searchParams), today, isIsoDate);
  const table = await runReport(name, range, today);
  const p = await presenter();
  const csv = toCsv(translateCells(table, p.text), table.columns.map((c) => p.header(c.key)));
  const file = RANGED.has(name) ? `${name}_${range.from}_to_${range.to}.csv` : `${name}_${today}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

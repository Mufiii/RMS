import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { listAudit } from "@/modules/audit/queries";

function parseBefore(raw: string | string[] | undefined): bigint | undefined {
  if (typeof raw !== "string" || !/^\d{1,18}$/.test(raw)) return undefined;
  return BigInt(raw);
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePagePermission("audit.view");
  const t = await getTranslations("audit");
  const { before } = await searchParams;
  const { rows, hasMore } = await listAudit(parseBefore(before));

  return (
    <>
      <PageHeader title={t("title")} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("who")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("record")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell>{r.actor?.fullName ?? t("system")}</TableCell>
                  <TableCell>
                    <code className="text-xs">{r.action}</code>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {r.entity}
                    {r.entityId ? ` #${r.entityId}` : ""}
                  </TableCell>
                  <TableCell className="hidden max-w-md lg:table-cell">
                    {r.reason && <div className="text-sm">“{r.reason}”</div>}
                    {r.summary != null && (
                      <code className="block truncate text-xs text-muted-foreground" title={JSON.stringify(r.summary)}>
                        {JSON.stringify(r.summary)}
                      </code>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {hasMore && (
        <div className="mt-4">
          <Link href={`/audit?before=${rows[rows.length - 1].id}`} className={buttonVariants({ variant: "outline" })}>
            {t("older")}
          </Link>
        </div>
      )}
    </>
  );
}

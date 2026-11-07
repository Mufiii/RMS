import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CircleCheck, CircleMinus, Plus, ShieldCheck, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/stat-tile";
import { formatDateTime } from "@/lib/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { listUsers } from "@/modules/users/queries";

export default async function UsersPage() {
  const me = await requirePagePermission("user.manage");
  const t = await getTranslations();
  const users = await listUsers();

  return (
    <>
      <PageHeader
        title={t("users.title")}
        actions={
          <Link href="/users/new" className={buttonVariants({ size: "lg" })}>
            <Plus />
            {t("users.new")}
          </Link>
        }
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("users.fullName")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("users.username")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead>{t("users.status")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("users.lastLogin")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                <TableCell>
                  <Link href={`/users/${u.id}`} className="font-medium hover:text-primary hover:underline">
                    {u.fullName}
                  </Link>
                  {u.id === me.id && <span className="ml-1 text-xs text-muted-foreground">({t("users.you")})</span>}
                  <div className="text-xs text-muted-foreground sm:hidden">{u.username}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{u.username}</TableCell>
                <TableCell>
                  <Pill tone={u.role === "ADMIN" ? "blue" : "muted"}>
                    {u.role === "ADMIN" ? <ShieldCheck aria-hidden /> : <UserRound aria-hidden />}
                    {t(`roles.${u.role}`)}
                  </Pill>
                </TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Pill tone="green">
                      <CircleCheck aria-hidden />
                      {t("users.active")}
                    </Pill>
                  ) : (
                    <Pill tone="muted">
                      <CircleMinus aria-hidden />
                      {t("users.inactive")}
                    </Pill>
                  )}
                  {u.mustChangePassword && u.isActive && (
                    <div className="mt-1 text-xs text-(--dash-amber)">{t("users.mustChange")}</div>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t("common.never")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

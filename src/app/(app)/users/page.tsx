import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
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
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
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
                  <Link href={`/users/${u.id}`} className="font-medium underline-offset-4 hover:underline">
                    {u.fullName}
                  </Link>
                  {u.id === me.id && <span className="ml-1 text-xs text-muted-foreground">({t("users.you")})</span>}
                  <div className="text-xs text-muted-foreground sm:hidden">{u.username}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{u.username}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{t(`roles.${u.role}`)}</Badge>
                </TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge variant="outline">{t("users.active")}</Badge>
                  ) : (
                    <Badge variant="destructive">{t("users.inactive")}</Badge>
                  )}
                  {u.mustChangePassword && u.isActive && (
                    <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("users.mustChange")}</div>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t("common.never")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { getUser } from "@/modules/users/queries";
import { EditUserForm, ResetPasswordForm, ToggleActiveForm } from "./user-forms";

export default async function UserDetailPage({ params, searchParams }: PageProps<"/users/[id]">) {
  const me = await requirePagePermission("user.manage");
  const { id: rawId } = await params;
  const { created } = await searchParams;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const user = await getUser(id);
  if (!user) notFound();
  const t = await getTranslations();
  const isSelf = user.id === me.id;

  return (
    <>
      <Link href="/users" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("users.title")}
      </Link>
      <PageHeader title={user.fullName}>
        <span className="mr-2">{user.username}</span>
        <Badge variant={user.isActive ? "outline" : "destructive"}>
          {user.isActive ? t("users.active") : t("users.inactive")}
        </Badge>
        <span className="ml-2">
          {t("users.lastLogin")}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t("common.never")}
        </span>
      </PageHeader>

      {created && (
        <p role="status" className="mb-4 max-w-lg rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {t("users.created")}
        </p>
      )}

      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <EditUserForm user={{ id: user.id, fullName: user.fullName, role: user.role }} isSelf={isSelf} />
        <div className="grid content-start gap-4">
          <ResetPasswordForm userId={user.id} />
          {!isSelf && <ToggleActiveForm userId={user.id} isActive={user.isActive} />}
        </div>
      </div>
    </>
  );
}

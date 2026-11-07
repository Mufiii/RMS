import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { Pill } from "@/components/stat-tile";
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
      <PageHeader back={{ href: "/users", label: t("users.title") }} title={user.fullName}>
        <span className="mr-2">{user.username}</span>
        <Pill tone={user.isActive ? "green" : "muted"}>{user.isActive ? t("users.active") : t("users.inactive")}</Pill>
        <span className="ml-2">
          {t("users.lastLogin")}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t("common.never")}
        </span>
      </PageHeader>

      {created && (
        <Notice tone="success" className="max-w-3xl">{t("users.created")}</Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <EditUserForm user={{ id: user.id, fullName: user.fullName, role: user.role }} isSelf={isSelf} />
        <div className="grid content-start gap-4">
          <ResetPasswordForm userId={user.id} />
          {!isSelf && <ToggleActiveForm userId={user.id} isActive={user.isActive} />}
        </div>
      </div>
    </>
  );
}

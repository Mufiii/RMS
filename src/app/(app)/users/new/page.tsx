import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { NewUserForm } from "./new-user-form";

export default async function NewUserPage() {
  await requirePagePermission("user.manage");
  const t = await getTranslations("users");
  return (
    <>
      <PageHeader title={t("new")} />
      <NewUserForm />
    </>
  );
}

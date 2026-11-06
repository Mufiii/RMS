import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function DashboardPage() {
  await requirePagePermission("dashboard.view");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.dashboard")} step={8} message={t("common.comingSoon")} />;
}

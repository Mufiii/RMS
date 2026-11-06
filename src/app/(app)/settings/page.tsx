import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function SettingsPage() {
  await requirePagePermission("settings.write");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.settings")} step={9} message={t("common.comingSoon")} />;
}

import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function CustomersPage() {
  await requirePagePermission("customer.read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.customers")} step={2} message={t("common.comingSoon")} />;
}

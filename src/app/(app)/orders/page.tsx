import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function OrdersPage() {
  await requirePagePermission("order.create");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.orders")} step={4} message={t("common.comingSoon")} />;
}

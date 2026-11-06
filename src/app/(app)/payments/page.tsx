import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function PaymentsPage() {
  await requirePagePermission("payment.create");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.payments")} step={7} message={t("common.comingSoon")} />;
}

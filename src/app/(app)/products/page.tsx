import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";

export default async function ProductsPage() {
  await requirePagePermission("product.read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.products")} step={3} message={t("common.comingSoon")} />;
}

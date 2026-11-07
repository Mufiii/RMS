import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { businessToday, fiscalYear, formatDateTime } from "@/lib/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { LogoForm, SettingsForm } from "./settings-forms";

/** Business settings (admin only): what prints on slips, document numbers, the long-rental threshold, the logo. */
export default async function SettingsPage() {
  await requirePagePermission("settings.write");
  const t = await getTranslations("settings");
  const s = await db.settings.findUnique({
    where: { id: 1 },
    include: { updatedBy: { select: { fullName: true } } },
    omit: { logoData: true },
  });
  if (!s) throw new Error("Settings row missing: run the seed (docs/04-deployment.md)");

  return (
    <>
      <PageHeader title={t("title")}>
        {t("subtitle")}
        {s.updatedBy && <div className="text-xs">{t("lastChange", { name: s.updatedBy.fullName, date: formatDateTime(s.updatedAt) })}</div>}
      </PageHeader>
      <div className="grid max-w-4xl gap-4">
        <SettingsForm
          fiscalYear={fiscalYear(businessToday())}
          initial={{
            businessName: s.businessName,
            businessNameMl: s.businessNameMl,
            address: s.address,
            addressMl: s.addressMl,
            phones: s.phones,
            email: s.email,
            orderPrefix: s.orderPrefix,
            invoicePrefix: s.invoicePrefix,
            receiptPrefix: s.receiptPrefix,
            refundPrefix: s.refundPrefix,
            invoiceTerms: s.invoiceTerms,
            invoiceTermsMl: s.invoiceTermsMl,
            printPaperWidthMm: s.printPaperWidthMm,
            longRentalDays: s.longRentalDays,
          }}
        />
        <LogoForm logoUrl={s.logoMime ? `/api/logo?v=${s.logoUpdatedAt?.getTime() ?? 0}` : null} />
      </div>
    </>
  );
}

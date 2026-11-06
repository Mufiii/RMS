import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { CustomerForm } from "../customer-form";

export default async function NewCustomerPage({ searchParams }: PageProps<"/customers/new">) {
  await requirePagePermission("customer.write");
  const t = await getTranslations("customers");
  // Prefill the phone when coming from a search that found nobody, e.g. /customers/new?phone=98470...
  const { phone } = await searchParams;
  return (
    <>
      <PageHeader title={t("new")} />
      <CustomerForm
        defaults={{
          name: "",
          phone: typeof phone === "string" ? phone.slice(0, 20) : "",
          altPhone: "",
          address: "",
          idProofType: "",
          idProofNumber: "",
          notes: "",
        }}
      />
    </>
  );
}

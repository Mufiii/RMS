import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { getCustomer } from "@/modules/customers/queries";
import { CustomerForm } from "../../customer-form";

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  await requirePagePermission("customer.write");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const c = await getCustomer(id);
  if (!c) notFound();
  const t = await getTranslations("customers");
  return (
    <>
      <PageHeader title={`${t("edit")} · #${c.id}`} back={{ href: `/customers/${c.id}`, label: c.name }} />
      <CustomerForm
        defaults={{
          id: c.id,
          name: c.name,
          phone: c.phone,
          altPhone: c.altPhone ?? "",
          address: c.address ?? "",
          idProofType: c.idProofType ?? "",
          idProofNumber: c.idProofNumber ?? "",
          notes: c.notes ?? "",
        }}
      />
    </>
  );
}

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { getProduct, listCategories, productHasStockHistory } from "@/modules/products/queries";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  await requirePagePermission("product.write");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [p, categories, hasHistory] = await Promise.all([getProduct(id), listCategories(false), productHasStockHistory(id)]);
  if (!p) notFound();
  const t = await getTranslations("products");
  const ml = (await getLocale()) === "ml";
  // Keep the current category selectable even if it was deactivated since.
  const options = categories.some((c) => c.id === p.categoryId) ? categories : [...categories, { ...p.category, _count: { products: 0 } }];
  return (
    <>
      <PageHeader title={`${t("edit")} · ${p.name}`} back={{ href: `/products/${p.id}`, label: p.name }} />
      <ProductForm
        trackingLocked={hasHistory}
        categories={options.map((c) => ({ id: c.id, label: ml && c.nameMl ? c.nameMl : c.name }))}
        defaults={{
          id: p.id,
          categoryId: String(p.categoryId),
          code: p.code ?? "",
          name: p.name,
          nameMl: p.nameMl ?? "",
          tracking: p.tracking,
          dailyRate: p.dailyRate.toFixed(2),
          description: p.description ?? "",
        }}
      />
    </>
  );
}

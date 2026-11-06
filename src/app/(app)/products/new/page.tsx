import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requirePagePermission } from "@/modules/auth/session";
import { listCategories } from "@/modules/products/queries";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  await requirePagePermission("product.write");
  const t = await getTranslations();
  const ml = (await getLocale()) === "ml";
  const categories = await listCategories(false);
  return (
    <>
      <PageHeader title={t("products.new")} />
      {categories.length === 0 ? (
        <div className="max-w-2xl rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p>{t("categories.empty")}</p>
          <Link href="/products/categories" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
            {t("categories.new")}
          </Link>
        </div>
      ) : (
        <ProductForm
          categories={categories.map((c) => ({ id: c.id, label: ml && c.nameMl ? c.nameMl : c.name }))}
          defaults={{
            categoryId: categories.length === 1 ? String(categories[0].id) : "",
            code: "",
            name: "",
            nameMl: "",
            tracking: "QUANTITY",
            dailyRate: "",
            description: "",
          }}
        />
      )}
    </>
  );
}

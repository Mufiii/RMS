import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Tags } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
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
      <PageHeader title={t("products.new")} back={{ href: "/products", label: t("products.title") }} />
      {categories.length === 0 ? (
        <Card className="max-w-3xl py-0">
          <EmptyState
            icon={Tags}
            title={t("categories.empty")}
            action={
              <Link href="/products/categories" className={buttonVariants({ size: "lg" })}>
                {t("categories.new")}
              </Link>
            }
          />
        </Card>
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

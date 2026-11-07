import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { toggleCategoryAction } from "@/modules/products/actions";
import { listCategories } from "@/modules/products/queries";
import { CategoryForm } from "./category-form";

export default async function CategoriesPage() {
  await requirePagePermission("product.write");
  const t = await getTranslations("categories");
  const categories = await listCategories(true);

  return (
    <>
      <PageHeader title={t("title")} back={{ href: "/products", label: (await getTranslations("products"))("title") }} />

      <div className="grid max-w-3xl gap-4">
        <CategoryForm />
        {categories.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_oklch(0.2_0.02_262/0.05)]">
            {categories.map((c) => (
              <li key={c.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className={c.isActive ? undefined : "opacity-60"}>
                  <CategoryForm category={{ id: c.id, name: c.name, nameMl: c.nameMl ?? "" }} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("products")}: {c._count.products}
                    {!c.isActive && (
                      <Badge variant="destructive" className="ml-2">
                        {t("inactive")}
                      </Badge>
                    )}
                  </p>
                </div>
                <form action={toggleCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.isActive ? "false" : "true"} />
                  <Button type="submit" variant={c.isActive ? "ghost" : "outline"} size="sm">
                    {c.isActive ? t("deactivate") : t("reactivate")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

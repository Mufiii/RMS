import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
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
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {(await getTranslations("products"))("title")}
      </Link>
      <PageHeader title={t("title")} />

      <div className="grid max-w-3xl gap-4">
        <CategoryForm />
        {categories.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {categories.map((c) => (
              <li key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
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

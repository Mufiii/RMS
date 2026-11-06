import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">403</p>
      <h1 className="text-xl font-semibold">{t("forbiddenTitle")}</h1>
      <p className="max-w-sm text-muted-foreground">{t("forbiddenBody")}</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("goHome")}
      </Link>
    </main>
  );
}

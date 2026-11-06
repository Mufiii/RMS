import { getTranslations } from "next-intl/server";
import { LanguageSwitch } from "@/components/language-switch";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("app");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("name")}</h1>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <LanguageSwitch />
    </main>
  );
}

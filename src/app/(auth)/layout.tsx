import { getTranslations } from "next-intl/server";
import { ClipboardList, Languages, ReceiptText } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitch } from "@/components/language-switch";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations();
  const points = [
    { icon: ClipboardList, text: t("auth.panelOrders") },
    { icon: ReceiptText, text: t("auth.panelMoney") },
    { icon: Languages, text: t("auth.panelLanguage") },
  ];
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel: the same ink-black as the app's sidebar. */}
      <aside className="flex flex-col justify-between gap-8 bg-sidebar px-6 py-6 text-sidebar-foreground lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <BrandMark name={t("app.name")} size="lg" />
          <div>
            <p className="text-lg leading-tight font-semibold text-white">{t("app.name")}</p>
            <p className="text-sm text-sidebar-muted">{t("app.tagline")}</p>
          </div>
        </div>
        <ul className="hidden gap-5 lg:grid">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-4 text-[15px]">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-white">
                <Icon className="size-5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <LanguageSwitch tone="dark" className="hidden w-fit lg:inline-flex" />
      </aside>

      <main className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
        <LanguageSwitch className="lg:hidden" />
      </main>
    </div>
  );
}

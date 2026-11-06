import { getTranslations } from "next-intl/server";
import { can } from "@/lib/permissions";
import { requireUser } from "@/modules/auth/session";
import { AppNav, type NavItem } from "./app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations();

  // Order matters: the first four are the mobile bottom-bar items.
  const all: (NavItem & { show: boolean })[] = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: "dashboard", show: can(user.role, "dashboard.view") },
    { href: "/orders", label: t("nav.orders"), icon: "orders", show: can(user.role, "order.create") },
    { href: "/customers", label: t("nav.customers"), icon: "customers", show: can(user.role, "customer.read") },
    { href: "/products", label: t("nav.products"), icon: "products", show: can(user.role, "product.read") },
    { href: "/payments", label: t("nav.payments"), icon: "payments", show: can(user.role, "payment.create") },
    { href: "/reports", label: t("nav.reports"), icon: "reports", show: can(user.role, "report.view") },
    { href: "/users", label: t("nav.users"), icon: "users", show: can(user.role, "user.manage") },
    { href: "/audit", label: t("nav.audit"), icon: "audit", show: can(user.role, "audit.view") },
    { href: "/settings", label: t("nav.settings"), icon: "settings", show: can(user.role, "settings.write") },
  ];
  const items = all.filter((i) => i.show).map(({ show: _s, ...i }) => i);

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <AppNav
        items={items}
        userName={user.fullName}
        roleLabel={t(`roles.${user.role}`)}
        appName={t("app.name")}
        labels={{ logout: t("nav.logout"), more: t("nav.more") }}
      />
      <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:py-6">{children}</main>
    </div>
  );
}

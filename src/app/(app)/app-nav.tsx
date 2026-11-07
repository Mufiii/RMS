"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandMark, initials } from "@/components/brand-mark";
import { LanguageSwitch } from "@/components/language-switch";
import { logoutAction } from "@/modules/auth/actions";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  customers: Users,
  products: Boxes,
  payments: Wallet,
  reports: BarChart3,
  users: UserCog,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function AppNav({
  items,
  userName,
  roleLabel,
  appName,
  labels,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  appName: string;
  labels: { logout: string; more: string };
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);

  return (
    <>
      {/* Desktop sidebar: the ink-black rail. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-7">
          <BrandMark name={appName} />
          <p className="text-[15px] leading-tight font-semibold text-white">{appName}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
                  active
                    ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-[0_1px_2px_oklch(0_0_0/0.3)]"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", !active && "text-sidebar-muted")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 px-1">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-semibold text-white"
            >
              {initials(userName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{userName}</p>
              <p className="truncate text-xs text-sidebar-muted">{roleLabel}</p>
            </div>
          </div>
          <LanguageSwitch tone="dark" className="w-full" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring"
            >
              <LogOut className="size-4 text-sidebar-muted" />
              {labels.logout}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark name={appName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold text-white">{appName}</p>
            <p className="truncate text-xs text-sidebar-muted">
              {userName} · {roleLabel}
            </p>
          </div>
        </div>
        <LanguageSwitch tone="dark" />
      </header>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_oklch(0.2_0.02_262/0.06)] md:hidden">
        {primary.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs",
                active ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs text-muted-foreground">
            <Menu className="size-5" />
            {labels.more}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            {overflow.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <DropdownMenuItem key={item.href} className="min-h-10" render={<Link href={item.href} />}>
                  <Icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
            {overflow.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="min-h-10" onClick={() => logoutAction()}>
              <LogOut className="size-4" />
              {labels.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}

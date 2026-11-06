"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  History,
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
  audit: History,
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
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="px-5 py-5">
          <p className="font-semibold leading-tight">{appName}</p>
          <p className="text-xs text-muted-foreground">
            {userName} · {roleLabel}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t p-4">
          <LanguageSwitch className="w-full justify-center" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <LogOut className="size-4" />
              {labels.logout}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div>
          <p className="text-sm font-semibold leading-tight">{appName}</p>
          <p className="text-xs text-muted-foreground">
            {userName} · {roleLabel}
          </p>
        </div>
        <LanguageSwitch />
      </header>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px]",
                isActive(item.href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground">
            <Menu className="size-5" />
            {labels.more}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-52">
            {overflow.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                  <Icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
            {overflow.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => logoutAction()}>
              <LogOut className="size-4" />
              {labels.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}

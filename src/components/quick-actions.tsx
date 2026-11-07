import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardPlus, PackageOpen, UserPlus, Wallet } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";

const ACTIONS = [
  { key: "newOrder", href: "/orders/new", icon: ClipboardPlus, perm: "order.create" },
  { key: "returnOrPay", href: "/orders?status=open", icon: PackageOpen, perm: "return.create" },
  { key: "newCustomer", href: "/customers/new", icon: UserPlus, perm: "customer.write" },
  { key: "todayPayments", href: "/payments", icon: Wallet, perm: "payment.create" },
] as const satisfies readonly { key: string; href: string; icon: unknown; perm: Permission }[];

/** The counter's daily jobs as large, labelled shortcuts. Links to existing pages only. */
export async function QuickActions({ role, skip = [] }: { role: Role; skip?: (typeof ACTIONS)[number]["key"][] }) {
  const t = await getTranslations("quick");
  const items = ACTIONS.filter((a) => can(role, a.perm) && !skip.includes(a.key));
  return (
    <nav aria-label={t("title")} className={items.length === 3 ? "grid gap-3 sm:grid-cols-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"} data-testid="quick-actions">
      {items.map(({ key, href, icon: Icon }) => {
        const primary = key === "newOrder";
        return (
          <Link
            key={key}
            href={href}
            className={
              primary
                ? "group flex items-center gap-3 rounded-xl bg-primary p-4 text-primary-foreground shadow-[0_2px_8px_-2px_oklch(0.5_0.2_262/0.5)] transition-[background-color,translate] duration-200 hover:-translate-y-px hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                : "group flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/8 shadow-[0_1px_2px_oklch(0.2_0.02_262/0.05)] transition-[box-shadow,translate] duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            }
          >
            <span
              className={
                primary
                  ? "grid size-10 shrink-0 place-items-center rounded-lg bg-white/15"
                  : "grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-primary"
              }
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block leading-snug font-semibold">{t(`${key}.label`)}</span>
              <span className={primary ? "hidden text-[13px] text-white/80 sm:block" : "hidden text-[13px] text-muted-foreground sm:block"}>
                {t(`${key}.hint`)}
              </span>
            </span>
            <ArrowRight className="hidden size-4 shrink-0 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 sm:block" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}

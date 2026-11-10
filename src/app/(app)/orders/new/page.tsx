import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { businessToday } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/modules/auth/session";
import { formatPhone } from "@/modules/customers/phone";
import { getCustomer } from "@/modules/customers/queries";
import { issuableProducts, pickCustomers } from "@/modules/orders/queries";
import { NewOrderForm } from "./new-order-form";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const me = await requirePagePermission("order.create");
  const t = await getTranslations("orders");
  const te = await getTranslations("errors.orders");
  const sp = await searchParams;
  const customerId = Number.parseInt(one(sp.customer), 10);
  const customer = customerId > 0 ? await getCustomer(customerId) : null;

  // Step 1: choose an active customer.
  if (!customer || !customer.isActive) {
    const q = one(sp.q).slice(0, 100);
    const results = await pickCustomers(q);
    return (
      <>
        <PageHeader title={t("new")} back={{ href: "/orders", label: t("title") }}>
          {t("chooseCustomerHint")}
        </PageHeader>
        {customer && !customer.isActive && (
          <Notice tone="warning" className="max-w-3xl">
            {te("customerInactive", { name: customer.name })}{" "}
            <Link href={`/customers/${customer.id}`} className="underline underline-offset-4">
              {t("customerPage")}
            </Link>
        </Notice>
        )}
        <form role="search" action="/orders/new" className="mb-4 flex max-w-xl gap-2">
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("chooseCustomer")}
            aria-label={t("chooseCustomer")}
            className="h-10"
            autoFocus
            autoComplete="off"
          />
          <Button type="submit" variant="outline" size="lg" className="h-10">
            <Search />
            <span className="sr-only sm:not-sr-only">{t("search")}</span>
          </Button>
        </form>
        {results.length === 0 ? (
          <p className="mb-4 text-muted-foreground">{t("noCustomers")}</p>
        ) : (
          <ul className="mb-4 max-w-xl divide-y rounded-xl border">
            {results.map((c) => (
              <li key={c.id}>
                <Link href={`/orders/new?customer=${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="text-xs text-muted-foreground tabular-nums">#{c.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {formatPhone(c.phone)}
                      {c.address ? ` · ${c.address}` : ""}
                    </span>
                  </span>
                  <span className={buttonVariants({ variant: "outline", size: "sm" })}>{t("choose")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={/^[\d\s+()-]{6,}$/.test(q) ? `/customers/new?phone=${encodeURIComponent(q)}` : "/customers/new"}
          className={buttonVariants({ variant: "outline" })}
        >
          <Plus />
          {t("newCustomer")}
        </Link>
      </>
    );
  }

  // Step 2: order details + first items.
  const products = await issuableProducts();
  return (
    <>
      <PageHeader title={t("new")} back={{ href: "/orders", label: t("title") }} />
      <NewOrderForm
        customer={{ id: customer.id, name: customer.name, phone: formatPhone(customer.phone), address: customer.address }}
        products={products}
        canBackdate={can(me.role, "date.backdate")}
        today={businessToday()}
      />
    </>
  );
}

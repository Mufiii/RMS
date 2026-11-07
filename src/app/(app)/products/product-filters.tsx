"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Product search + filters that apply as you go: the category and "show
 * inactive" apply on change, typing searches after a short pause. It is still
 * a plain GET form, so Enter / the Search button / shared links all work, and
 * it works without JavaScript too.
 */
export function ProductFilters({
  q,
  categoryId,
  includeInactive,
  categories,
  resultsLabel,
}: {
  q: string;
  categoryId: number | null;
  includeInactive: boolean;
  categories: { id: number; label: string }[];
  resultsLabel: string;
}) {
  const t = useTranslations("products");
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const urlCategory = categoryId ? String(categoryId) : "";
  const [text, setText] = useState(q);
  const [category, setCategory] = useState(urlCategory);
  const [inactive, setInactive] = useState(includeInactive);
  // Follow the URL only when it changes from outside (a "Search all categories"
  // link, Back). Our own searches are already in the fields, and syncing them
  // could overwrite what is being typed when an older result arrives late.
  const [sent, setSent] = useState({ q, category: urlCategory, inactive: includeInactive });
  const [seen, setSeen] = useState({ q, category: urlCategory, inactive: includeInactive });
  if (seen.q !== q || seen.category !== urlCategory || seen.inactive !== includeInactive) {
    setSeen({ q, category: urlCategory, inactive: includeInactive });
    if (q !== sent.q) setText(q);
    if (urlCategory !== sent.category) setCategory(urlCategory);
    if (includeInactive !== sent.inactive) setInactive(includeInactive);
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const apply = (next: { q?: string; category?: string; inactive?: boolean }) => {
    const p = new URLSearchParams();
    const nq = (next.q ?? text).trim();
    const nc = next.category ?? category;
    if (nq) p.set("q", nq);
    if (nc) p.set("category", nc);
    const ni = next.inactive ?? inactive;
    if (ni) p.set("inactive", "1");
    setSent({ q: nq, category: nc, inactive: ni });
    const qs = p.toString();
    // replace: filtering shouldn't fill the Back history with every keystroke.
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <form
      role="search"
      action="/products"
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        apply({});
      }}
    >
      <Input
        name="q"
        type="search"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply({ q: v }), 300);
        }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        className="h-10 max-w-xs"
        autoComplete="off"
      />
      <select
        name="category"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          apply({ category: e.target.value });
        }}
        aria-label={t("category")}
        className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
      >
        <option value="">{t("allCategories")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="inactive"
          value="1"
          checked={inactive}
          onChange={(e) => {
            setInactive(e.target.checked);
            apply({ inactive: e.target.checked });
          }}
          className="size-4"
        />
        {t("showInactive")}
      </label>
      <Button type="submit" variant="outline" size="lg" className="h-10">
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        <span className="sr-only sm:not-sr-only">{t("search")}</span>
      </Button>
      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite" data-testid="product-results">
        {resultsLabel}
      </span>
    </form>
  );
}

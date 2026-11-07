"use client";

import { useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, toPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type EditorProduct = {
  id: number;
  name: string;
  nameMl: string | null;
  code: string | null;
  category: string;
  categoryMl: string | null;
  tracking: "SERIALISED" | "QUANTITY";
  rate: string;
  available: number;
  units: { id: number; serialNo: string }[];
};

type Line = { key: number; productId: string; quantity: string; unitIds: number[] };

const emptyLine = (key: number): Line => ({ key, productId: "", quantity: "", unitIds: [] });

/**
 * Lines of items going out. Posts them as one hidden `lines` JSON field:
 * [{ productId, quantity }] for counted products, [{ productId, unitIds }] for serialised.
 * The server re-checks everything (availability, unit status) under row locks.
 */
export function ItemsEditor({ products, error }: { products: EditorProduct[]; error?: string }) {
  const t = useTranslations("orders");
  const ml = useLocale() === "ml";
  // Keys are per editor, so the first line is the same on the server and the client (no hydration mismatch).
  const uid = useId();
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>(() => [emptyLine(0)]);
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const label = (p: EditorProduct) => (ml && p.nameMl ? p.nameMl : p.name);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const payload = lines
    .filter((l) => l.productId)
    .map((l) => {
      const p = byId.get(l.productId);
      return p?.tracking === "SERIALISED"
        ? { productId: Number(l.productId), unitIds: l.unitIds }
        : { productId: Number(l.productId), quantity: Number(l.quantity) || 0 };
    });

  // Group the product choices by category for a shorter list.
  const groups = new Map<string, EditorProduct[]>();
  for (const p of products) {
    const g = (ml && p.categoryMl) || p.category;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  if (products.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("noIssuable")}</p>;
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{t("items")}</legend>
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      {lines.map((line, i) => {
        const p = byId.get(line.productId);
        const usedElsewhere = new Set(lines.filter((l) => l.key !== line.key).map((l) => l.productId));
        return (
          <div key={line.key} className="grid gap-3 rounded-lg border p-3" data-testid="item-line">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`${uid}-product-${line.key}`} className="sr-only">
                  {t("product")} {i + 1}
                </Label>
                <select
                  id={`${uid}-product-${line.key}`}
                  aria-label={`${t("product")} ${i + 1}`}
                  value={line.productId}
                  onChange={(e) => update(line.key, { productId: e.target.value, quantity: "", unitIds: [] })}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                >
                  <option value="">{t("chooseProduct")}</option>
                  {[...groups].map(([group, list]) => (
                    <optgroup key={group} label={group}>
                      {list.map((o) => (
                        <option key={o.id} value={o.id} disabled={usedElsewhere.has(String(o.id))}>
                          {label(o)}
                          {o.code ? ` (${o.code})` : ""} — {t("availableN", { count: o.available })}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`${t("removeItem")} ${i + 1}`}
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              )}
            </div>

            {p && (
              <div className="text-xs text-muted-foreground">
                {t("perDay", { rate: formatINR(toPaise(p.rate)) })} · {t("availableN", { count: p.available })}
              </div>
            )}

            {p?.tracking === "QUANTITY" && (
              <div className="grid max-w-40 gap-1.5">
                <Label htmlFor={`${uid}-qty-${line.key}`}>{t("quantity")}</Label>
                <Input
                  id={`${uid}-qty-${line.key}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={p.available}
                  step={1}
                  required
                  value={line.quantity}
                  onChange={(e) => update(line.key, { quantity: e.target.value })}
                  className="h-10"
                />
              </div>
            )}

            {p?.tracking === "SERIALISED" && (
              <div className="grid gap-1.5">
                <span className="text-sm">{t("chooseUnits")}</span>
                <div className="flex flex-wrap gap-2">
                  {p.units.map((u) => {
                    const checked = line.unitIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                          checked && "border-primary bg-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={checked}
                          onChange={(e) =>
                            update(line.key, {
                              unitIds: e.target.checked ? [...line.unitIds, u.id] : line.unitIds.filter((x) => x !== u.id),
                            })
                          }
                        />
                        {u.serialNo}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {lines.length < products.length && (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setLines((ls) => [...ls, emptyLine(nextKey.current++)])}>
          <Plus />
          {t("addItem")}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

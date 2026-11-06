import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import ml from "@/i18n/messages/ml.json";

type Tree = { [k: string]: string | Tree };
const keys = (o: Tree, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`)));

describe("translations", () => {
  it("English and Malayalam have exactly the same keys", () => {
    const enKeys = keys(en as Tree).sort();
    const mlKeys = keys(ml as Tree).sort();
    expect(mlKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !mlKeys.includes(k))).toEqual([]);
  });

  it("no Malayalam value is left empty or still in English", () => {
    const flat = (o: Tree, p = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
    const enMap = new Map(flat(en as Tree));
    // Values that are legitimately identical in both languages.
    const allowSame = new Set(["common.english", "common.malayalam"]);
    const untranslated = flat(ml as Tree).filter(([k, v]) => !v.trim() || (v === enMap.get(k) && !allowSame.has(k)));
    expect(untranslated).toEqual([]);
  });
});

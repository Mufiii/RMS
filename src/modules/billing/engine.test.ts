import { describe, expect, it } from "vitest";
import { accruedRent, balance, days, invoiceTotals, lineRent, statementTotals } from "./engine";

describe("days (calendar-inclusive)", () => {
  it.each([
    ["2026-11-05", "2026-11-05", 1], // same-day return = 1 day
    ["2026-11-05", "2026-11-07", 3], // the requirements' own example
    ["2026-11-30", "2026-12-01", 2], // month boundary
    ["2026-12-31", "2027-01-01", 2], // year boundary
    ["2028-02-28", "2028-03-01", 3], // leap year: 28, 29, 1 March
    ["2027-02-28", "2027-03-01", 2], // non-leap year
    ["2026-03-28", "2026-03-30", 3], // no DST effects (pure calendar arithmetic)
    ["2026-01-01", "2026-12-31", 365],
  ])("%s → %s = %i", (from, to, n) => {
    expect(days(from, to)).toBe(n);
  });

  it("Sundays count like any other day", () => {
    // 2026-11-07 is a Saturday, 2026-11-09 a Monday.
    expect(days("2026-11-07", "2026-11-09")).toBe(3);
  });

  it("rejects a return before the issue and invalid dates", () => {
    expect(() => days("2026-11-07", "2026-11-06")).toThrow(RangeError);
    expect(() => days("2026-02-30", "2026-03-01")).toThrow();
  });
});

describe("lineRent (integer paise)", () => {
  it("is quantity × rate × days", () => {
    expect(lineRent(10, 800, 3)).toBe(24_000); // 10 props × ₹8 × 3 days = ₹240
    expect(lineRent(1, 150_000, 1)).toBe(150_000); // generator, same day
    expect(lineRent(7, 650, 4)).toBe(18_200); // ₹6.50 × 7 × 4 = ₹182.00 exactly
  });

  it("is exact where floating point would drift", () => {
    // 0.1 × 3 in floats is 0.30000000000000004; in paise it's exact.
    expect(lineRent(3, 10, 1)).toBe(30);
    expect(lineRent(333, 333, 33)).toBe(333 * 333 * 33);
  });

  it("rejects nonsense inputs", () => {
    expect(() => lineRent(0, 800, 1)).toThrow();
    expect(() => lineRent(1, 0, 1)).toThrow();
    expect(() => lineRent(1, 800, 0)).toThrow();
    expect(() => lineRent(1.5, 800, 1)).toThrow();
  });
});

describe("accruedRent (running statement)", () => {
  it("counts the pieces still out up to today, inclusive", () => {
    expect(accruedRent(6, 800, "2026-11-01", "2026-11-07")).toBe(6 * 800 * 7);
    expect(accruedRent(1, 150000, "2026-11-07", "2026-11-07")).toBe(150000); // issued today = 1 day
  });
  it("is zero when nothing is outstanding", () => {
    expect(accruedRent(0, 800, "2026-11-01", "2026-11-07")).toBe(0);
  });
  it("rejects a today before the issue date", () => {
    expect(() => accruedRent(1, 800, "2026-11-08", "2026-11-07")).toThrow(RangeError);
  });
});

describe("invoiceTotals", () => {
  const lines = [
    { rent: 9600, damage: 0 },
    { rent: 24000, damage: 15000 },
  ];
  it("sums rent and damage, then takes off a fixed discount", () => {
    expect(invoiceTotals(lines)).toEqual({ rentTotal: 33600, damageTotal: 15000, subtotal: 48600, discount: 0, total: 48600 });
    expect(invoiceTotals(lines, 8600).total).toBe(40000);
  });
  it("allows a discount of the whole amount but not more", () => {
    expect(invoiceTotals(lines, 48600).total).toBe(0);
    expect(() => invoiceTotals(lines, 48601)).toThrow(RangeError);
  });
  it("rejects negative or fractional amounts", () => {
    expect(() => invoiceTotals(lines, -1)).toThrow(RangeError);
    expect(() => invoiceTotals(lines, 0.5)).toThrow(RangeError);
    expect(() => invoiceTotals([{ rent: -1, damage: 0 }])).toThrow(RangeError);
  });
  it("is exact in paise (no floating-point drift)", () => {
    const many = Array.from({ length: 1000 }, () => ({ rent: 10, damage: 20 })); // ₹0.10 + ₹0.20, 1000 times
    expect(invoiceTotals(many).total).toBe(30000);
  });
});

describe("statementTotals", () => {
  it("adds returned rent, charges and rent accrued to today on what is still out", () => {
    // 10 props at ₹8 from 1 Nov: 4 back on 3 Nov (₹96), 6 still out on 7 Nov (6 × 8 × 7 = ₹336), ₹150 damage.
    const s = statementTotals([{ rent: 9600, damage: 15000 }], [{ qtyOutstanding: 6, ratePaise: 800, issueDate: "2026-11-01" }], "2026-11-07");
    expect(s).toEqual({ accrued: [33600], returnedRent: 9600, accruedRent: 33600, damageTotal: 15000, total: 58200 });
  });
  it("grows by one day of rent per day", () => {
    const out = [{ qtyOutstanding: 2, ratePaise: 150000, issueDate: "2026-11-01" }];
    expect(statementTotals([], out, "2026-11-08").total - statementTotals([], out, "2026-11-07").total).toBe(300000);
  });
});

describe("balance", () => {
  it("is due − received + refunded", () => {
    expect(balance(48600, [20000, 10000])).toBe(18600);
    expect(balance(48600, [50000])).toBe(-1400); // excess held by the shop
    expect(balance(48600, [50000], [1400])).toBe(0);
    expect(balance(0, [])).toBe(0);
  });
});

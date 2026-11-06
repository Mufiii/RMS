import { describe, expect, it } from "vitest";
import { days, lineRent } from "./engine";

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

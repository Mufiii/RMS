import { describe, expect, it } from "vitest";
import { formatINR, fromPaise, toPaise } from "./money";

describe("toPaise", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["1.5", 150],
    ["1.05", 105],
    ["1234.50", 123450],
    ["9999999999.99", 999999999999],
    ["-20.10", -2010],
  ])("%s → %i", (input, paise) => {
    expect(toPaise(input)).toBe(paise);
  });

  it("is exact where floats are not (0.1 + 0.2)", () => {
    expect(toPaise("0.10") + toPaise("0.20")).toBe(toPaise("0.30"));
  });

  it("rejects more than 2 decimals and garbage", () => {
    expect(() => toPaise("1.234")).toThrow();
    expect(() => toPaise("abc")).toThrow();
    expect(() => toPaise("")).toThrow();
  });
});

describe("fromPaise", () => {
  it("writes NUMERIC(12,2) strings", () => {
    expect(fromPaise(0)).toBe("0.00");
    expect(fromPaise(5)).toBe("0.05");
    expect(fromPaise(123450)).toBe("1234.50");
    expect(fromPaise(-2010)).toBe("-20.10");
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456.00");
    expect(formatINR(1000000000)).toBe("₹1,00,00,000.00");
  });
});

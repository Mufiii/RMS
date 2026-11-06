import { describe, expect, it } from "vitest";
import { formatPhone, isValidPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98470 12345", "9847012345"],
    ["+91 98470-12345", "9847012345"],
    ["91 9847012345", "9847012345"],
    ["098470 12345", "9847012345"],
    ["(0484) 234 5678", "04842345678"], // landline keeps its STD code
    ["  9847012345 ", "9847012345"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("every way of typing one number gives the same stored value", () => {
    const forms = ["9847012345", "+919847012345", "0091 98470 12345".replace(/^00/, ""), "09847012345"];
    expect(new Set(forms.map(normalizePhone))).toEqual(new Set(["9847012345"]));
  });
});

describe("isValidPhone / formatPhone", () => {
  it("accepts 6–15 digits only", () => {
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("123456")).toBe(true);
    expect(isValidPhone("1234567890123456")).toBe(false);
    expect(isValidPhone("98470abc45")).toBe(false);
  });

  it("groups Indian mobiles for display", () => {
    expect(formatPhone("9847012345")).toBe("98470 12345");
    expect(formatPhone("04842345678")).toBe("04842345678");
  });
});

import { describe, expect, it } from "vitest";
import { addDays, businessToday, fiscalYear, formatDate, fromDbDate, isIsoDate, monthStart, toDbDate } from "./dates";

describe("businessToday (Asia/Kolkata)", () => {
  it("rolls over at IST midnight, not UTC midnight", () => {
    // 2026-11-05 18:29 UTC = 23:59 IST
    expect(businessToday(new Date("2026-11-05T18:29:00Z"))).toBe("2026-11-05");
    // 2026-11-05 18:30 UTC = 00:00 IST on the 6th
    expect(businessToday(new Date("2026-11-05T18:30:00Z"))).toBe("2026-11-06");
  });
});

describe("fiscalYear (April–March)", () => {
  it.each([
    ["2026-04-01", "2026-27"],
    ["2026-11-05", "2026-27"],
    ["2027-03-31", "2026-27"],
    ["2027-04-01", "2027-28"],
    ["2099-12-31", "2099-00"],
  ])("%s → %s", (date, fy) => {
    expect(fiscalYear(date)).toBe(fy);
  });

  it("rejects invalid dates", () => {
    expect(() => fiscalYear("2026-02-30")).toThrow();
  });
});

describe("ISO date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("5-11-2026")).toBe(false);
  });

  it("round-trips through the DB representation", () => {
    expect(fromDbDate(toDbDate("2026-11-05"))).toBe("2026-11-05");
  });

  it("formats as DD-MM-YYYY", () => {
    expect(formatDate("2026-11-05")).toBe("05-11-2026");
  });
});

describe("addDays / monthStart", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-11-07", -29)).toBe("2026-10-09");
    expect(addDays("2026-11-07", 0)).toBe("2026-11-07");
  });
  it("gives the first of the month", () => {
    expect(monthStart("2026-11-07")).toBe("2026-11-01");
    expect(() => monthStart("2026-13-01")).toThrow();
  });
});

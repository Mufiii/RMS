import { describe, expect, it } from "vitest";
import { col, csvField, sumColumns, toCsv } from "./table";

describe("CSV", () => {
  it("formats money, dates and percentages for spreadsheets", () => {
    const csv = toCsv(
      {
        columns: [col("name"), col("date", "date"), col("amount", "money"), col("use", "pct"), col("qty", "int")],
        rows: [{ name: "Ravi", date: "2026-11-07", amount: 123450, use: 33.333, qty: 4 }],
        totals: { name: "Total", amount: 123450, qty: 4 },
      },
      ["Name", "Date", "Amount (₹)", "Use %", "Qty"],
    );
    expect(csv.startsWith("﻿")).toBe(true); // Excel reads UTF-8 (₹, Malayalam)
    expect(csv.slice(1).split("\r\n")).toEqual(["Name,Date,Amount (₹),Use %,Qty", "Ravi,07-11-2026,1234.50,33.3,4", "Total,,1234.50,,4", ""]);
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("text", 'Ravi, "RK"')).toBe('"Ravi, ""RK"""');
    expect(csvField("text", "line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas in text (CSV injection)", () => {
    expect(csvField("text", "=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("text", "+91 98470")).toBe("'+91 98470");
    expect(csvField("text", "-5")).toBe("'-5");
    expect(csvField("text", "@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("money", -1050)).toBe("-10.50"); // numbers are not text: left alone
  });

  it("keeps Malayalam text intact and empty cells empty", () => {
    expect(csvField("text", "സ്റ്റീൽ പ്രോപ്പ്")).toBe("സ്റ്റീൽ പ്രോപ്പ്");
    expect(csvField("money", null)).toBe("");
  });

  it("sums selected columns", () => {
    expect(sumColumns([{ a: 1, b: 2 }, { a: 3, b: null }], ["a", "b"], { name: "Total" })).toEqual({ name: "Total", a: 4, b: 2 });
  });
});

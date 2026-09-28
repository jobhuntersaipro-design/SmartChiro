import { describe, it, expect } from "vitest";
import { csvDate, csvField, csvFileName, csvMoney, csvPercent, toCsv } from "@/lib/reports/csv";

describe("report CSV", () => {
  it("quotes per RFC 4180", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("Tan, Mei Ling")).toBe('"Tan, Mei Ling"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(3)).toBe("3");
  });

  it("neutralises spreadsheet formulas in text but not in money", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-cmd")).toBe("'-cmd");
    expect(csvField(csvMoney(-20))).toBe("-20.00");
  });

  it("money is a plain 2 dp number, dates are dd/mm/yyyy in clinic time", () => {
    expect(csvMoney(1234.5).raw).toBe("1234.50");
    expect(csvMoney(0.1 + 0.2).raw).toBe("0.30");
    expect(csvDate("2026-09-05")).toBe("05/09/2026");
    // 23:30 UTC on the 4th is the 5th in Kuala Lumpur.
    expect(csvDate("2026-09-04T23:30:00.000Z")).toBe("05/09/2026");
    expect(csvDate(null)).toBe("");
    expect(csvPercent(0.125).raw).toBe("12.5");
    expect(csvPercent(null).raw).toBe("");
  });

  it("builds a CRLF document with a header row", () => {
    expect(toCsv(["Doctor", "Collected (MYR)"], [["Dr. Tan, Jr", csvMoney(100)], ["Total", csvMoney(100)]])).toBe(
      'Doctor,Collected (MYR)\r\n"Dr. Tan, Jr",100.00\r\nTotal,100.00\r\n',
    );
  });

  it("file names are slugged with the range", () => {
    expect(csvFileName(["Revenue", "by doctor"], { from: "2026-09-01", to: "2026-09-30" })).toBe(
      "smartchiro-revenue-by-doctor-2026-09-01-to-2026-09-30.csv",
    );
  });
});

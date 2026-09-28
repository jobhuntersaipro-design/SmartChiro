import { describe, it, expect } from "vitest";
import {
  amountInput,
  blankLine,
  checkLines,
  checkPaymentAmount,
  checkRefundAmount,
  parseMoney,
  parseQuantity,
  previewTotals,
  type LineDraft,
} from "../invoice-form";

const line = (over: Partial<LineDraft>): LineDraft => ({ ...blankLine(), ...over });

describe("parseMoney / parseQuantity", () => {
  it("accepts ringgit with up to 2 decimals and thousands separators", () => {
    expect(parseMoney("150")).toBe(150);
    expect(parseMoney(" 1,250.5 ")).toBe(1250.5);
    expect(parseMoney("0.05")).toBe(0.05);
    expect(parseMoney(".5")).toBe(0.5);
  });
  it("rejects negatives, 3 decimals and text", () => {
    expect(parseMoney("-1")).toBeNull();
    expect(parseMoney("1.005")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("needs a quantity above zero and at most 10,000", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("10001")).toBeNull();
  });
});

describe("checkLines", () => {
  it("returns API-ready lines and ignores rows left empty", () => {
    const res = checkLines([
      line({ description: " Adjustment ", quantity: "2", unitPrice: "130", taxable: true }),
      line({ description: "Pillow", quantity: "1", unitPrice: "89.90", taxable: false }),
      blankLine(),
    ]);
    expect(res.valid).toBe(true);
    expect(res.lines).toEqual([
      { description: "Adjustment", quantity: 2, unitPrice: 130, taxable: true },
      { description: "Pillow", quantity: 1, unitPrice: 89.9, taxable: false },
    ]);
  });
  it("reports per-row errors", () => {
    const bad = line({ description: "", quantity: "0", unitPrice: "x" });
    const res = checkLines([bad]);
    expect(res.valid).toBe(false);
    expect(res.errors[bad.key]).toEqual({
      description: "Describe the item",
      quantity: "Quantity above 0",
      unitPrice: "Enter a price, e.g. 150.00",
    });
  });
  it("is invalid with no lines at all", () => {
    expect(checkLines([blankLine()]).valid).toBe(false);
  });
});

describe("previewTotals", () => {
  const drafts = [
    line({ description: "Adjustment", quantity: "1", unitPrice: "280", taxable: true }),
    line({ description: "Report", quantity: "1", unitPrice: "80", taxable: true }),
    line({ description: "Brace", quantity: "1", unitPrice: "50", taxable: false }),
  ];
  it("charges SST on taxable lines for a non-Malaysian patient when the branch has it on", () => {
    const { totals, taxKnown } = previewTotals(drafts, { branch: { sstEnabled: true, sstRate: 6 }, patientIsMalaysian: false });
    expect(taxKnown).toBe(true);
    expect(totals.subtotal).toBe(410);
    expect(totals.taxAmount).toBe(21.6);
    expect(totals.taxLabel).toBe("SST 6%");
    expect(totals.total).toBe(431.6);
  });
  it("charges no SST for a Malaysian patient", () => {
    const { totals } = previewTotals(drafts, { branch: { sstEnabled: true, sstRate: 6 }, patientIsMalaysian: true });
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(410);
  });
  it("leaves tax unknown when branch settings or the patient are missing", () => {
    expect(previewTotals(drafts, { branch: null, patientIsMalaysian: false })).toMatchObject({ taxKnown: false, totals: { taxAmount: 0 } });
    expect(previewTotals(drafts, { branch: { sstEnabled: true, sstRate: 6 }, patientIsMalaysian: null }).taxKnown).toBe(false);
  });
  it("counts half-typed rows as zero", () => {
    const { totals } = previewTotals([line({ description: "A", unitPrice: "12." }), line({ description: "B", unitPrice: "?" })], {
      branch: null,
      patientIsMalaysian: null,
    });
    expect(totals.subtotal).toBe(12);
  });
});

describe("payment and refund amounts", () => {
  it("allows up to the balance", () => {
    expect(checkPaymentAmount("131.60", 131.6)).toEqual({ amount: 131.6, error: null });
    expect(checkPaymentAmount("131.61", 131.6).error).toBe("More than the balance of RM 131.60");
    expect(checkPaymentAmount("0", 131.6).error).toBe("Enter an amount above RM 0.00");
  });
  it("allows refunds up to what was paid", () => {
    expect(checkRefundAmount("50", 250)).toEqual({ amount: 50, error: null });
    expect(checkRefundAmount("250.01", 250).error).toBe("More than the RM 250.00 paid");
  });
  it("prefills the balance with two decimals", () => {
    expect(amountInput(131.6)).toBe("131.60");
    expect(amountInput(0)).toBe("");
  });
});

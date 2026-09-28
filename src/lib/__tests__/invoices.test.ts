import { describe, it, expect } from "vitest";
import {
  effectiveInvoiceStatus,
  allowedInvoiceTransitions,
  canTransitionInvoice,
  formatMYR,
  parseLineItems,
  computeTotals,
  isMalaysianPatient,
  isValidMyKad,
  invoiceStatusFor,
  branchInitials,
  documentPrefix,
  formatDocumentNumber,
  parseNationality,
  toSen,
} from "@/lib/invoices";

const now = new Date("2026-09-28T10:00:00+08:00");
const past = new Date("2026-09-20T00:00:00+08:00");
const future = new Date("2026-10-20T00:00:00+08:00");

describe("invoices", () => {
  it("derives overdue from the due date for sent invoices only", () => {
    expect(effectiveInvoiceStatus("SENT", past, now)).toBe("OVERDUE");
    expect(effectiveInvoiceStatus("SENT", future, now)).toBe("SENT");
    expect(effectiveInvoiceStatus("SENT", null, now)).toBe("SENT");
    expect(effectiveInvoiceStatus("DRAFT", past, now)).toBe("DRAFT");
    expect(effectiveInvoiceStatus("PAID", past, now)).toBe("PAID");
    expect(effectiveInvoiceStatus("OVERDUE", future, now)).toBe("SENT");
  });

  it("allows draft → sent/paid/cancelled, sent → paid/cancelled, and nothing after paid or cancelled", () => {
    expect(allowedInvoiceTransitions("DRAFT")).toEqual(["SENT", "PAID", "CANCELLED"]);
    expect(canTransitionInvoice("SENT", "PAID")).toBe(true);
    expect(canTransitionInvoice("PAID", "CANCELLED")).toBe(false);
    expect(canTransitionInvoice("CANCELLED", "SENT")).toBe(false);
  });

  it("formats ringgit the Malaysian way", () => {
    expect(formatMYR(1234.5)).toBe("RM 1,234.50");
    expect(formatMYR(80)).toBe("RM 80.00");
  });

  it("reads stored line items defensively", () => {
    expect(parseLineItems([{ description: "Adjustment", quantity: 2, unitPrice: 80 }])).toEqual([
      { description: "Adjustment", quantity: 2, unitPrice: 80, total: 160 },
    ]);
    expect(parseLineItems(null)).toEqual([]);
    expect(parseLineItems([{ description: "Pillow", quantity: 1, unitPrice: 50, taxable: false }])[0].taxable).toBe(false);
  });

  it("partially paid invoices can only be completed, not cancelled", () => {
    expect(allowedInvoiceTransitions("PARTIALLY_PAID")).toEqual(["PAID"]);
    expect(canTransitionInvoice("PARTIALLY_PAID", "CANCELLED")).toBe(false);
    expect(effectiveInvoiceStatus("PARTIALLY_PAID", past, now)).toBe("PARTIALLY_PAID");
  });

  it("formats refunds with a leading minus", () => {
    expect(formatMYR(-30)).toBe("-RM 30.00");
  });
});

describe("computeTotals (SST)", () => {
  const foreign = { sstEnabled: true, sstRate: 6, patientIsMalaysian: false };
  const citizen = { sstEnabled: true, sstRate: 6, patientIsMalaysian: true };

  it("charges SST on taxable lines for a non-Malaysian patient", () => {
    const t = computeTotals(
      [
        { description: "Adjustment", quantity: 1, unitPrice: 150 },
        { description: "Pillow", quantity: 1, unitPrice: 80, taxable: false },
      ],
      foreign,
    );
    expect(t).toMatchObject({ subtotal: 230, taxableBase: 150, taxApplied: true, taxRate: 6, taxAmount: 9, total: 239, taxLabel: "SST 6%" });
    expect(t.lines.map((l) => l.taxable)).toEqual([true, false]);
  });

  it("charges no SST to a Malaysian patient, or when the branch has SST off", () => {
    const lines = [{ description: "Adjustment", quantity: 2, unitPrice: 120 }];
    expect(computeTotals(lines, citizen)).toMatchObject({ subtotal: 240, taxAmount: 0, total: 240, taxRate: null, taxLabel: null });
    expect(computeTotals(lines, { ...foreign, sstEnabled: false })).toMatchObject({ taxAmount: 0, total: 240, taxApplied: false });
  });

  it("rounds line totals and tax half-up to the sen", () => {
    // Unit prices are rounded to the sen first: 33.335 → 33.34, × 3 = 100.02
    const lines = computeTotals([{ description: "x", quantity: 3, unitPrice: 33.335 }], citizen);
    expect(lines.lines[0]).toMatchObject({ unitPrice: 33.34, total: 100.02 });
    // 6% of 10.25 = 0.615 → 0.62 (half-up), not 0.61
    expect(computeTotals([{ description: "x", quantity: 1, unitPrice: 10.25 }], foreign)).toMatchObject({ taxAmount: 0.62, total: 10.87 });
    // 6% of 10.24 = 0.6144 → 0.61
    expect(computeTotals([{ description: "x", quantity: 1, unitPrice: 10.24 }], foreign).taxAmount).toBe(0.61);
    // Floating point: 1.005 is stored as 1.00499…, still read as 101 sen
    expect(toSen(1.005)).toBe(101);
    // Other rates: 8% of 12.50 = 1.00
    expect(computeTotals([{ description: "x", quantity: 1, unitPrice: 12.5 }], { ...foreign, sstRate: 8 }).taxAmount).toBe(1);
  });

  it("computes tax on the combined base, not per line", () => {
    // Per line, 6% of 0.25 = 0.015 → 0.02 each (0.04); on the combined 0.50 it is 0.03.
    const t = computeTotals(
      [
        { description: "a", quantity: 1, unitPrice: 0.25 },
        { description: "b", quantity: 1, unitPrice: 0.25 },
      ],
      foreign,
    );
    expect(t.taxAmount).toBe(0.03);
  });
});

describe("isMalaysianPatient", () => {
  it("uses nationality when recorded", () => {
    expect(isMalaysianPatient({ nationality: "MY" })).toBe(true);
    expect(isMalaysianPatient({ nationality: "my" })).toBe(true);
    expect(isMalaysianPatient({ nationality: "SG", icNumber: "900101-14-5678" })).toBe(false);
  });

  it("treats no nationality + a valid MyKad as Malaysian", () => {
    expect(isMalaysianPatient({ nationality: null, icNumber: "900101-14-5678" })).toBe(true);
    expect(isMalaysianPatient({ nationality: null, icNumber: "900101145678" })).toBe(true);
    expect(isMalaysianPatient({ nationality: null, icNumber: null })).toBe(false);
    expect(isMalaysianPatient({ nationality: null, icNumber: "A1234567" })).toBe(false);
  });

  it("validates the MyKad birth date", () => {
    expect(isValidMyKad("901301-14-5678")).toBe(false); // month 13
    expect(isValidMyKad("900231-14-5678")).toBe(false); // 31 Feb
    expect(isValidMyKad("000229-14-5678")).toBe(true); // 29 Feb 2000
    expect(isValidMyKad("010229-14-5678")).toBe(false);
  });

  it("parses nationality codes", () => {
    expect(parseNationality(" sg ")).toBe("SG");
    expect(parseNationality("")).toBeNull();
    expect(parseNationality(null)).toBeNull();
    expect(parseNationality("XX")).toBe("invalid");
    expect(parseNationality("Malaysia")).toBe("invalid");
    expect(parseNationality(12)).toBe("invalid");
  });
});

describe("invoiceStatusFor", () => {
  it("moves DRAFT/SENT to PARTIALLY_PAID then PAID as money comes in", () => {
    expect(invoiceStatusFor(100, 0, "DRAFT")).toBe("DRAFT");
    expect(invoiceStatusFor(100, 0, "SENT")).toBe("SENT");
    expect(invoiceStatusFor(100, 40, "SENT")).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFor(100, 40, "DRAFT")).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFor(100, 100, "PARTIALLY_PAID")).toBe("PAID");
    expect(invoiceStatusFor(0.3, 0.1 + 0.2, "SENT")).toBe("PAID");
  });

  it("steps back on refunds and keeps CANCELLED", () => {
    expect(invoiceStatusFor(100, 60, "PAID")).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFor(100, 0, "PAID")).toBe("SENT");
    expect(invoiceStatusFor(100, 100, "CANCELLED")).toBe("CANCELLED");
  });
});

describe("document numbers", () => {
  it("uses the branch prefix or its initials", () => {
    expect(branchInitials("SmartChiro KLCC")).toBe("SK");
    expect(branchInitials("SmartChiro Penang Georgetown")).toBe("SPG");
    expect(branchInitials("  ")).toBe("SC");
    expect(documentPrefix({ invoicePrefix: "klcc", name: "SmartChiro KLCC" })).toBe("KLCC");
    expect(documentPrefix({ invoicePrefix: null, name: "Bangsar Spine Centre" })).toBe("BSC");
  });

  it("formats INV-/RCP- numbers with a 5-digit sequence", () => {
    expect(formatDocumentNumber("invoice", "SK", 2026, 1)).toBe("INV-SK-2026-00001");
    expect(formatDocumentNumber("receipt", "SK", 2026, 12345)).toBe("RCP-SK-2026-12345");
  });
});

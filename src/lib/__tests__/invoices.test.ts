import { describe, it, expect } from "vitest";
import { effectiveInvoiceStatus, allowedInvoiceTransitions, canTransitionInvoice, formatMYR, parseLineItems } from "@/lib/invoices";

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
  });
});

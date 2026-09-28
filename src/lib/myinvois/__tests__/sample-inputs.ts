/** Shared inputs for the MyInvois document tests (a KLCC clinic, one local and one foreign patient). */
import type { BranchEInvoiceFields, InvoiceEInvoiceFields, PatientEInvoiceFields } from "../source";

export const BRANCH: BranchEInvoiceFields & { einvoiceEnabled: boolean } = {
  name: "SmartChiro KLCC",
  legalName: "SmartChiro Wellness Sdn. Bhd.",
  ssmRegNo: "202401012345 (1234567-A)",
  tin: "C25845632020",
  sstRegNo: "W10-1808-32000123",
  msicCode: "86909",
  businessActivity: "Other human health services n.e.c.",
  address: "Lot 3.02, Level 3, Menara KLCC",
  city: "Kuala Lumpur",
  state: "Wilayah Persekutuan",
  zip: "50088",
  phone: "03-2141 0000",
  email: "klcc@smartchiro.test",
  einvoiceEnabled: true,
};

export const LOCAL_PATIENT: PatientEInvoiceFields = {
  firstName: "Siti",
  lastName: "Aminah",
  icNumber: "880412-14-5566",
  passportNumber: null,
  nationality: "MY",
  phone: "+60 12-345 6789",
  email: "siti@example.com",
  addressLine1: "20, Jalan Pinang",
  addressLine2: "Taman Tun",
  city: "Petaling Jaya",
  state: "Selangor",
  postcode: "47400",
  country: "Malaysia",
};

export const FOREIGN_PATIENT: PatientEInvoiceFields = {
  firstName: "John",
  lastName: "Tan",
  icNumber: null,
  passportNumber: "E1234567K",
  nationality: "SG",
  phone: "+65 9123 4567",
  email: null,
  addressLine1: "8, Jalan Ampang",
  addressLine2: null,
  city: "Kuala Lumpur",
  state: "Kuala Lumpur",
  postcode: "50450",
  country: "Malaysia",
};

/** RM230 foreign-patient invoice: RM150 adjustment with 6% SST + RM80 pillow without. */
export const SST_INVOICE: InvoiceEInvoiceFields = {
  invoiceNumber: "INV-SK-2026-00012",
  status: "PAID",
  currency: "MYR",
  lineItems: [
    { description: "Chiropractic adjustment", quantity: 1, unitPrice: 150, total: 150, taxable: true },
    { description: "Cervical pillow", quantity: 1, unitPrice: 80, total: 80, taxable: false },
  ],
  subtotal: 230,
  taxRate: 6,
  taxAmount: 9,
  total: 239,
};

/** RM230 Malaysian-patient invoice: no SST. */
export const NO_TAX_INVOICE: InvoiceEInvoiceFields = {
  ...SST_INVOICE,
  invoiceNumber: "INV-SK-2026-00013",
  status: "SENT",
  taxRate: null,
  taxAmount: 0,
  total: 230,
};

export const ISSUED_AT = new Date("2026-09-28T07:05:09.000Z");

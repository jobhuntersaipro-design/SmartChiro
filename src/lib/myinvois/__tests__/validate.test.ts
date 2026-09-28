import { describe, expect, it } from "vitest";
import { validateInvoiceForEInvoice, validateSupplier } from "../validate";
import { allocate, buyerFromPatient, normaliseBrn } from "../source";
import { countryCode, e164Phone, malaysianStateCode } from "../codes";
import { encodeDocument, sha256Hex } from "../hash";
import { BRANCH, FOREIGN_PATIENT, LOCAL_PATIENT, NO_TAX_INVOICE, SST_INVOICE } from "./sample-inputs";

const fields = (r: { errors: { field: string }[] }) => r.errors.map((e) => e.field).sort();

describe("pre-submission validation", () => {
  it("passes a complete invoice", () => {
    const r = validateInvoiceForEInvoice({ branch: BRANCH, patient: FOREIGN_PATIENT, invoice: SST_INVOICE });
    expect(r).toMatchObject({ ok: true, errors: [] });
  });

  it("lists every missing supplier field", () => {
    const branch = { ...BRANCH, tin: null, ssmRegNo: "", msicCode: null, businessActivity: " ", address: null, city: null, state: null, phone: null };
    expect(fields(validateSupplier(branch))).toEqual([
      "branch.address",
      "branch.businessActivity",
      "branch.city",
      "branch.msicCode",
      "branch.phone",
      "branch.ssmRegNo",
      "branch.state",
      "branch.tin",
    ]);
  });

  it("rejects a malformed MSIC code and flags an old-format SSM number as a warning", () => {
    const r = validateSupplier({ ...BRANCH, msicCode: "8690", ssmRegNo: "1234567-A" });
    expect(fields(r)).toEqual(["branch.msicCode"]);
    expect(r.warnings.map((w) => w.field)).toEqual(["branch.ssmRegNo"]);
  });

  it("needs the buyer's IC or passport, phone and address", () => {
    const r = validateInvoiceForEInvoice({
      branch: BRANCH,
      patient: { ...LOCAL_PATIENT, icNumber: null, phone: null, addressLine1: null, addressLine2: null, city: null },
      invoice: NO_TAX_INVOICE,
    });
    expect(fields(r)).toEqual(["patient.address", "patient.city", "patient.id", "patient.phone"]);
  });

  it("blocks draft invoices, the branch toggle, and totals that don't add up", () => {
    const r = validateInvoiceForEInvoice({
      branch: { ...BRANCH, einvoiceEnabled: false },
      patient: LOCAL_PATIENT,
      invoice: { ...NO_TAX_INVOICE, status: "DRAFT", total: 231 },
    });
    expect(fields(r)).toEqual(["branch.einvoiceEnabled", "invoice.status", "invoice.totals"]);
    expect(validateInvoiceForEInvoice({ branch: BRANCH, patient: LOCAL_PATIENT, invoice: { ...NO_TAX_INVOICE, lineItems: [] } }).ok).toBe(false);
  });

  it("identifies buyers per the Specific Guideline general TIN rules", () => {
    expect(buyerFromPatient(LOCAL_PATIENT).value).toMatchObject({ tin: "EI00000000010", idScheme: "NRIC", idValue: "880412145566" });
    expect(buyerFromPatient(FOREIGN_PATIENT).value).toMatchObject({ tin: "EI00000000020", idScheme: "PASSPORT", idValue: "E1234567K" });
    expect(buyerFromPatient({ ...LOCAL_PATIENT, icNumber: null, passportNumber: "A12345678" }).value).toMatchObject({
      tin: "EI00000000010",
      idScheme: "PASSPORT",
    });
  });
});

describe("code helpers", () => {
  it("derives state codes, including Federal Territories from city / postcode", () => {
    expect(malaysianStateCode("Selangor")).toBe("10");
    expect(malaysianStateCode("Penang")).toBe("07");
    expect(malaysianStateCode("Pulau Pinang")).toBe("07");
    expect(malaysianStateCode("14")).toBe("14");
    expect(malaysianStateCode("Wilayah Persekutuan", "Kuala Lumpur")).toBe("14");
    expect(malaysianStateCode("Wilayah Persekutuan", "Presint 9", "62250")).toBe("16");
    expect(malaysianStateCode("Wilayah Persekutuan", "Victoria", "87000")).toBe("15");
    expect(malaysianStateCode("Wilayah Persekutuan", "Somewhere")).toBeNull();
    expect(malaysianStateCode("Atlantis")).toBeNull();
  });

  it("formats phone numbers as E.164", () => {
    expect(e164Phone("03-2141 0000")).toBe("+60321410000");
    expect(e164Phone("+60 11-2200 0001")).toBe("+601122000001");
    expect(e164Phone("+65 9123 4567")).toBe("+6591234567");
    expect(e164Phone("abc")).toBeNull();
  });

  it("looks countries up in the official table", () => {
    expect(countryCode("Malaysia")).toBe("MYS");
    expect(countryCode(null)).toBe("MYS");
    expect(countryCode("Singapore")).toBe("SGP");
    expect(countryCode("SG")).toBe("SGP");
    expect(countryCode("Narnia")).toBeNull();
  });

  it("normalises SSM numbers to the 12-digit format when present", () => {
    expect(normaliseBrn("202401012345 (1234567-A)")).toBe("202401012345");
    expect(normaliseBrn("1234567-A")).toBe("1234567-A");
  });

  it("allocates by largest remainder", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });
});

describe("hash", () => {
  it("hashes and base64-encodes the exact UTF-8 bytes of the minified JSON", () => {
    const doc = { a: [{ _: "Café" }], n: 1.5 };
    const enc = encodeDocument(doc);
    expect(enc.json).toBe('{"a":[{"_":"Café"}],"n":1.5}');
    expect(Buffer.from(enc.base64, "base64").toString("utf8")).toBe(enc.json);
    expect(enc.documentHash).toBe(sha256Hex(Buffer.from(enc.json, "utf8")));
    // Known vector: SHA-256("abc")
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

/**
 * Database side of MyInvois: builds documents from stored invoices, records
 * submissions, polls LHDN for their status and keeps `Invoice.einvoiceStatus`
 * in step. Routes call these; the pure pieces live in document / source /
 * validate, the HTTP client in client.ts.
 */
import type { EInvoiceKind, EInvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documentPrefix, fromSen, parseLineItems, toSen } from "@/lib/invoices";
import { clinicDayBounds, clinicParts } from "@/lib/clinic-time";
import {
  CANCEL_WINDOW_HOURS,
  CONSOLIDATED_CLASSIFICATION,
  CONSOLIDATED_LINES_PER_DOCUMENT,
  CONSOLIDATION_DEADLINE_DAYS,
  CONSOLIDATION_MAX_TRANSACTION,
  DOCUMENT_TYPE,
  MAX_DOCUMENTS_PER_SUBMISSION,
  STATE_NAMES,
  malaysianStateCode,
} from "./codes";
import {
  GENERAL_PUBLIC_BUYER,
  buildConsolidatedDocument,
  buildInvoiceDocument,
  buildNoteDocument,
  consolidatedLines,
  type ConsolidatedEntry,
  type UblDocument,
} from "./document";
import { encodeDocument, type EncodedDocument } from "./hash";
import { getDocumentSigner, SignerNotConfiguredError } from "./signer";
import { buyerFromPatient, linesFromInvoice, refundLines, supplierFromBranch, taxableBase, type FieldError } from "./source";
import { validateInvoiceForEInvoice, validateSupplier, type EInvoiceValidation } from "./validate";
import {
  MYINVOIS_URLS,
  MyInvoisApiError,
  flattenErrors,
  getMyInvoisClient,
  normaliseOverallStatus,
  readMyInvoisConfig,
  validationLink,
  type MyInvoisClient,
} from "./client";
import type { ConsolidatedPreview, EInvoiceSubmissionView } from "@/types/einvoice";

/** A business-rule failure a route turns into JSON. */
export class EInvoiceError extends Error {
  constructor(
    public code: string,
    public status: number = 422,
    public details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "EInvoiceError";
  }
}

/** Get Submission guidance: poll every 3–5 seconds, not faster. */
export const MIN_POLL_INTERVAL_MS = 3_000;

export const BRANCH_EINVOICE_SELECT = {
  id: true,
  name: true,
  legalName: true,
  ssmRegNo: true,
  tin: true,
  sstRegNo: true,
  msicCode: true,
  businessActivity: true,
  einvoiceEnabled: true,
  invoicePrefix: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  phone: true,
  email: true,
} as const satisfies Prisma.BranchSelect;

const PATIENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  icNumber: true,
  passportNumber: true,
  nationality: true,
  phone: true,
  email: true,
  address: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postcode: true,
  country: true,
} as const satisfies Prisma.PatientSelect;

const SUBMISSION_SELECT = {
  id: true,
  kind: true,
  status: true,
  codeNumber: true,
  documentVersion: true,
  documentHash: true,
  submissionUid: true,
  uuid: true,
  longId: true,
  errors: true,
  paymentId: true,
  invoiceId: true,
  branchId: true,
  periodStart: true,
  periodEnd: true,
  submittedAt: true,
  validatedAt: true,
  cancelledAt: true,
  cancelReason: true,
  lastPolledAt: true,
  createdAt: true,
} as const satisfies Prisma.EInvoiceSubmissionSelect;

export type SubmissionRow = Prisma.EInvoiceSubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>;

export function loadInvoiceForEInvoice(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      lineItems: true,
      amount: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      issuedAt: true,
      branchId: true,
      einvoiceStatus: true,
      consolidatedIntoId: true,
      branch: { select: BRANCH_EINVOICE_SELECT },
      patient: { select: PATIENT_SELECT },
      payments: {
        where: { amount: { lt: 0 } },
        orderBy: { receivedAt: "asc" },
        select: { id: true, amount: true, receiptNumber: true, refundReason: true, receivedAt: true },
      },
      einvoiceSubmissions: { orderBy: { createdAt: "desc" }, select: SUBMISSION_SELECT },
      consolidatedInto: { select: SUBMISSION_SELECT },
    },
  });
}

export type EInvoiceInvoiceRow = NonNullable<Awaited<ReturnType<typeof loadInvoiceForEInvoice>>>;

/** Stored invoice → the plain fields the mapper wants (older rows have no subtotal/tax snapshot). */
export function invoiceFields(inv: Pick<EInvoiceInvoiceRow, "invoiceNumber" | "status" | "currency" | "lineItems" | "amount" | "subtotal" | "taxRate" | "taxAmount">) {
  const total = Number(inv.amount);
  return {
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    currency: inv.currency,
    lineItems: parseLineItems(inv.lineItems),
    subtotal: inv.subtotal === null ? total : Number(inv.subtotal),
    taxRate: inv.taxRate === null ? null : Number(inv.taxRate),
    taxAmount: inv.taxAmount === null ? 0 : Number(inv.taxAmount),
    total,
  };
}

// ─── Serialising for the UI ───

export function portalBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const config = readMyInvoisConfig(env);
  if (config) return config.portalBaseUrl;
  const environment = env.MYINVOIS_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
  return env.MYINVOIS_PORTAL_URL?.trim().replace(/\/+$/, "") || MYINVOIS_URLS[environment].portal;
}

type StoredError = { code: string | null; message: string; path: string | null };

function storedErrors(value: Prisma.JsonValue | null): StoredError[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is Prisma.JsonObject => typeof e === "object" && e !== null && !Array.isArray(e))
    .map((e) => ({
      code: typeof e.code === "string" ? e.code : null,
      message: typeof e.message === "string" ? e.message : "Unknown error",
      path: typeof e.path === "string" ? e.path : null,
    }));
}

export function cancellableUntil(row: Pick<SubmissionRow, "status" | "validatedAt">): Date | null {
  if (row.status !== "VALID" || !row.validatedAt) return null;
  return new Date(row.validatedAt.getTime() + CANCEL_WINDOW_HOURS * 3600_000);
}

export function serializeSubmission(row: SubmissionRow, portal: string = portalBaseUrl()): EInvoiceSubmissionView {
  const until = cancellableUntil(row);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    codeNumber: row.codeNumber,
    documentVersion: row.documentVersion,
    documentHash: row.documentHash,
    submissionUid: row.submissionUid,
    uuid: row.uuid,
    longId: row.longId,
    validationUrl: row.uuid && row.longId && row.status === "VALID" ? validationLink(portal, row.uuid, row.longId) : null,
    errors: storedErrors(row.errors),
    paymentId: row.paymentId,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    cancellableUntil: until?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Building documents ───

export interface PreparedDocument {
  kind: EInvoiceKind;
  codeNumber: string;
  version: string;
  document: UblDocument;
  encoded: EncodedDocument;
}

async function signAndEncode(doc: UblDocument): Promise<{ document: UblDocument; encoded: EncodedDocument }> {
  try {
    const signed = await getDocumentSigner().sign(doc);
    return { document: signed, encoded: encodeDocument(signed) };
  } catch (e) {
    if (e instanceof SignerNotConfiguredError) throw new EInvoiceError("signer_not_configured", 409);
    throw e;
  }
}

export function validateInvoiceRow(inv: EInvoiceInvoiceRow): EInvoiceValidation {
  return validateInvoiceForEInvoice({ branch: inv.branch, patient: inv.patient, invoice: invoiceFields(inv) });
}

/**
 * The e-invoice (type 01) for one invoice, issued `now` (UTC — the SDK wants
 * the current date/time). `ignoreEnabled` lets the JSON download work while
 * the branch toggle is off.
 */
export async function prepareInvoiceDocument(
  inv: EInvoiceInvoiceRow,
  now: Date,
  options: { ignoreEnabled?: boolean } = {},
): Promise<{ validation: EInvoiceValidation; prepared: PreparedDocument | null }> {
  const validation = validateInvoiceRow(inv);
  const errors = options.ignoreEnabled ? validation.errors.filter((e) => e.field !== "branch.einvoiceEnabled") : validation.errors;
  if (errors.length > 0) return { validation: { ...validation, ok: false, errors }, prepared: null };

  const version = getDocumentSigner().version;
  const doc = buildInvoiceDocument({
    version,
    number: inv.invoiceNumber,
    issuedAt: now,
    supplier: supplierFromBranch(inv.branch).value!,
    buyer: buyerFromPatient(inv.patient).value!,
    lines: linesFromInvoice(invoiceFields(inv)).value!,
  });
  const { document, encoded } = await signAndEncode(doc);
  return {
    validation: { ...validation, ok: true, errors: [] },
    prepared: { kind: "INVOICE", codeNumber: inv.invoiceNumber, version, document, encoded },
  };
}

/** The validated e-invoice that covers this invoice: its own, else the consolidated one. */
export function coveringDocument(inv: EInvoiceInvoiceRow): SubmissionRow | null {
  const own = inv.einvoiceSubmissions.find((s) => s.kind === "INVOICE" && s.status === "VALID");
  if (own) return own;
  return inv.consolidatedInto?.status === "VALID" ? inv.consolidatedInto : null;
}

/**
 * Refund note (type 04) for a refund payment, referencing the validated
 * e-invoice. A refund on a consolidated sale goes to the General Public.
 */
export async function prepareRefundNote(
  inv: EInvoiceInvoiceRow,
  paymentId: string,
  now: Date,
  options: { ignoreEnabled?: boolean } = {},
): Promise<{ validation: EInvoiceValidation; prepared: PreparedDocument | null }> {
  const payment = inv.payments.find((p) => p.id === paymentId);
  if (!payment) throw new EInvoiceError("payment_not_found", 404);
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  if (!inv.branch.einvoiceEnabled && !options.ignoreEnabled) {
    errors.push({ field: "branch.einvoiceEnabled", message: "e-Invoicing is turned off for this branch (Branch → Settings → e-Invoice)." });
  }
  const original = coveringDocument(inv);
  if (!original?.uuid) {
    errors.push({ field: "invoice.einvoice", message: "The invoice needs a validated e-invoice before a refund note can reference it." });
  }
  const consolidated = Boolean(original && original.kind === "CONSOLIDATED");
  const supplier = supplierFromBranch(inv.branch);
  const buyer = consolidated ? { value: GENERAL_PUBLIC_BUYER, errors: [], warnings: [] } : buyerFromPatient(inv.patient);
  const lines = refundLines(
    invoiceFields(inv),
    { receiptNumber: payment.receiptNumber, amount: Number(payment.amount), refundReason: payment.refundReason },
    consolidated ? CONSOLIDATED_CLASSIFICATION : undefined,
  );
  for (const part of [supplier, buyer, lines]) {
    errors.push(...part.errors);
    warnings.push(...part.warnings);
  }
  const validation = { ok: errors.length === 0, errors, warnings };
  if (!validation.ok) return { validation, prepared: null };

  const version = getDocumentSigner().version;
  const doc = buildNoteDocument({
    typeCode: DOCUMENT_TYPE.REFUND_NOTE,
    version,
    number: payment.receiptNumber,
    issuedAt: now,
    supplier: supplier.value!,
    buyer: buyer.value!,
    lines: lines.value!,
    original: { number: original!.codeNumber, uuid: original!.uuid! },
  });
  const { document, encoded } = await signAndEncode(doc);
  return { validation, prepared: { kind: "REFUND_NOTE", codeNumber: payment.receiptNumber, version, document, encoded } };
}

// ─── Status bookkeeping ───

type Tx = Prisma.TransactionClient;

/** Mirrors a document's status onto the invoice(s) it covers. */
async function syncInvoices(tx: Tx, row: Pick<SubmissionRow, "id" | "kind" | "status" | "invoiceId">): Promise<void> {
  if (row.kind === "INVOICE" && row.invoiceId) {
    await tx.invoice.update({ where: { id: row.invoiceId }, data: { einvoiceStatus: row.status } });
  } else if (row.kind === "CONSOLIDATED") {
    if (row.status === "INVALID" || row.status === "CANCELLED" || row.status === "NOT_SUBMITTED") {
      // Rejected or withdrawn: its invoices can go into the next consolidated e-invoice.
      await tx.invoice.updateMany({ where: { consolidatedIntoId: row.id }, data: { consolidatedIntoId: null, einvoiceStatus: "NOT_SUBMITTED" } });
    } else {
      await tx.invoice.updateMany({ where: { consolidatedIntoId: row.id }, data: { einvoiceStatus: row.status } });
    }
  }
}

async function updateSubmission(id: string, data: Prisma.EInvoiceSubmissionUpdateInput): Promise<SubmissionRow> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.eInvoiceSubmission.update({ where: { id }, data, select: SUBMISSION_SELECT });
    await syncInvoices(tx, row);
    return row;
  });
}

const errorJson = (errors: StoredError[]) => errors as unknown as Prisma.InputJsonValue;

function transportErrors(e: unknown): StoredError[] {
  if (e instanceof MyInvoisApiError) {
    const nested = flattenErrors(e.details);
    return nested.length > 0 ? nested : [{ code: e.code, message: e.message, path: null }];
  }
  return [{ code: "network", message: "Couldn't reach LHDN MyInvois.", path: null }];
}

function requireClient(client: MyInvoisClient | null | undefined): MyInvoisClient {
  const c = client === undefined ? getMyInvoisClient() : client;
  if (!c) throw new EInvoiceError("myinvois_not_configured", 409);
  return c;
}

/**
 * Sends prepared documents in one submission and records the outcome per
 * document (accepted → SUBMITTED with its UUID, rejected → INVALID with
 * LHDN's errors). The rows must already exist (NOT_SUBMITTED).
 */
async function sendDocuments(client: MyInvoisClient, rows: { id: string; prepared: PreparedDocument }[], now: Date): Promise<SubmissionRow[]> {
  let response;
  try {
    response = await client.submitDocuments(
      rows.map(({ prepared }) => ({
        format: "JSON" as const,
        document: prepared.encoded.base64,
        documentHash: prepared.encoded.documentHash,
        codeNumber: prepared.codeNumber,
      })),
    );
  } catch (e) {
    for (const { id } of rows) await updateSubmission(id, { errors: errorJson(transportErrors(e)), status: "NOT_SUBMITTED" });
    if (e instanceof MyInvoisApiError) {
      throw new EInvoiceError("myinvois_error", e.status === 429 ? 429 : 502, {
        lhdnStatus: e.status,
        lhdnCode: e.code,
        message: e.message,
        retryAfter: e.retryAfter,
      });
    }
    throw new EInvoiceError("myinvois_unreachable", 502);
  }

  const out: SubmissionRow[] = [];
  for (const { id, prepared } of rows) {
    const accepted = response.acceptedDocuments.find((d) => d.invoiceCodeNumber === prepared.codeNumber);
    const rejected = response.rejectedDocuments.find((d) => d.invoiceCodeNumber === prepared.codeNumber);
    if (accepted) {
      out.push(
        await updateSubmission(id, {
          status: "SUBMITTED",
          submissionUid: response.submissionUid,
          uuid: accepted.uuid,
          submittedAt: now,
          errors: [] as unknown as Prisma.InputJsonValue,
        }),
      );
    } else {
      const errors = rejected ? flattenErrors(rejected.error) : [{ code: null, message: "LHDN did not accept the document.", path: null }];
      out.push(await updateSubmission(id, { status: "INVALID", submissionUid: response.submissionUid, submittedAt: now, errors: errorJson(errors) }));
    }
  }
  return out;
}

function createRow(
  tx: Tx | typeof prisma,
  data: { kind: EInvoiceKind; branchId: string; invoiceId?: string | null; paymentId?: string | null; prepared: PreparedDocument; userId: string | null; periodStart?: Date; periodEnd?: Date },
) {
  return tx.eInvoiceSubmission.create({
    data: {
      kind: data.kind,
      status: "NOT_SUBMITTED",
      codeNumber: data.prepared.codeNumber,
      documentVersion: data.prepared.version,
      documentHash: data.prepared.encoded.documentHash,
      document: data.prepared.encoded.json,
      branchId: data.branchId,
      invoiceId: data.invoiceId ?? null,
      paymentId: data.paymentId ?? null,
      createdById: data.userId,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
    },
    select: { id: true },
  });
}

// ─── Individual invoice / refund note ───

const BLOCKING: EInvoiceStatus[] = ["SUBMITTED", "VALID"];

/**
 * Submits the invoice's e-invoice (or, with `paymentId`, a refund note for
 * that refund). Re-submitting is allowed after INVALID / CANCELLED.
 */
export async function submitInvoiceEInvoice(args: {
  invoiceId: string;
  paymentId?: string | null;
  userId: string | null;
  now?: Date;
  client?: MyInvoisClient | null;
}): Promise<SubmissionRow> {
  const now = args.now ?? new Date();
  const inv = await loadInvoiceForEInvoice(args.invoiceId);
  if (!inv) throw new EInvoiceError("not_found", 404);
  const client = requireClient(args.client);

  if (args.paymentId) {
    const existing = inv.einvoiceSubmissions.find((s) => s.kind === "REFUND_NOTE" && s.paymentId === args.paymentId && BLOCKING.includes(s.status));
    if (existing) throw new EInvoiceError("already_submitted", 409, { status: existing.status });
  } else {
    const existing = inv.einvoiceSubmissions.find((s) => s.kind === "INVOICE" && BLOCKING.includes(s.status));
    if (existing) throw new EInvoiceError("already_submitted", 409, { status: existing.status });
    if (inv.consolidatedInto && BLOCKING.includes(inv.consolidatedInto.status)) {
      throw new EInvoiceError("already_consolidated", 409, { codeNumber: inv.consolidatedInto.codeNumber });
    }
  }

  const { validation, prepared } = args.paymentId ? await prepareRefundNote(inv, args.paymentId, now) : await prepareInvoiceDocument(inv, now);
  if (!prepared) throw new EInvoiceError("validation_failed", 422, { errors: validation.errors, warnings: validation.warnings });

  const row = await createRow(prisma, {
    kind: prepared.kind,
    branchId: inv.branchId,
    invoiceId: inv.id,
    paymentId: args.paymentId ?? null,
    prepared,
    userId: args.userId,
  });
  const [result] = await sendDocuments(client, [{ id: row.id, prepared }], now);
  return result;
}

function mapStatus(text: string | null | undefined): EInvoiceStatus | null {
  switch ((text ?? "").toLowerCase()) {
    case "valid":
      return "VALID";
    case "invalid":
      return "INVALID";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "submitted":
      return "SUBMITTED";
    default:
      return null;
  }
}

/**
 * Polls LHDN for a SUBMITTED document (Get Submission, then Get Document
 * Details for the validation errors of an invalid one or a missing long ID).
 * Returns the row unchanged when polled within the last 3 s.
 */
export async function refreshSubmission(row: SubmissionRow, client: MyInvoisClient, now: Date = new Date()): Promise<SubmissionRow> {
  if (row.status !== "SUBMITTED" || !row.submissionUid) return row;
  if (row.lastPolledAt && now.getTime() - row.lastPolledAt.getTime() < MIN_POLL_INTERVAL_MS) return row;

  const submission = await client.getSubmission(row.submissionUid);
  const summary = submission.documentSummary?.find((d) => d.uuid === row.uuid) ?? null;
  const status = mapStatus(summary?.status);
  if (!summary && normaliseOverallStatus(submission.overallStatus) === "invalid") {
    return updateSubmission(row.id, {
      status: "INVALID",
      lastPolledAt: now,
      errors: errorJson([{ code: null, message: "LHDN marked the submission invalid.", path: null }]),
    });
  }
  if (!summary || !status || status === "SUBMITTED") {
    return updateSubmission(row.id, { lastPolledAt: now });
  }

  const data: Prisma.EInvoiceSubmissionUpdateInput = { status, lastPolledAt: now };
  let longId = summary.longId ?? null;
  if (status === "INVALID" || (status === "VALID" && !longId)) {
    const details = await client.getDocumentDetails(row.uuid!);
    longId = longId ?? details.longId ?? null;
    if (status === "INVALID") {
      const steps = details.validationResults?.validationSteps ?? [];
      const errors = steps.flatMap((s) => (s.error ? flattenErrors(s.error).map((e) => ({ ...e, path: e.path ?? s.name })) : []));
      data.errors = errorJson(errors.length > 0 ? errors : [{ code: null, message: summary.documentStatusReason ?? "LHDN marked the document invalid.", path: null }]);
    }
  }
  if (status === "VALID") {
    data.longId = longId;
    data.validatedAt = summary.dateTimeValidated ? new Date(summary.dateTimeValidated) : now;
  }
  if (status === "CANCELLED") {
    data.cancelledAt = summary.cancelDateTime ? new Date(summary.cancelDateTime) : now;
    data.cancelReason = summary.documentStatusReason ?? null;
  }
  return updateSubmission(row.id, data);
}

/** Refreshes each SUBMITTED row, fail-soft; returns the rows and the first error message. */
export async function refreshRows(rows: SubmissionRow[], client: MyInvoisClient | null, now: Date = new Date()) {
  let error: string | null = null;
  const out: SubmissionRow[] = [];
  for (const row of rows) {
    if (!client || row.status !== "SUBMITTED") {
      out.push(row);
      continue;
    }
    try {
      out.push(await refreshSubmission(row, client, now));
    } catch (e) {
      error ??= e instanceof MyInvoisApiError ? e.message : "Couldn't reach LHDN MyInvois.";
      out.push(row);
    }
  }
  return { rows: out, error };
}

/** Cancels a validated document within 72 h of validation (Cancel Document API). */
export async function cancelSubmission(args: { submissionId: string; reason: string; now?: Date; client?: MyInvoisClient | null }): Promise<SubmissionRow> {
  const now = args.now ?? new Date();
  const row = await prisma.eInvoiceSubmission.findUnique({ where: { id: args.submissionId }, select: SUBMISSION_SELECT });
  if (!row) throw new EInvoiceError("not_found", 404);
  if (row.status !== "VALID" || !row.uuid) throw new EInvoiceError("not_cancellable", 422, { status: row.status });
  const until = cancellableUntil(row);
  if (!until || until.getTime() < now.getTime()) {
    throw new EInvoiceError("cancel_window_passed", 422, { cancellableUntil: until?.toISOString() ?? null });
  }
  const client = requireClient(args.client);
  try {
    await client.cancelDocument(row.uuid, args.reason);
  } catch (e) {
    if (e instanceof MyInvoisApiError) {
      throw new EInvoiceError("myinvois_error", e.status === 429 ? 429 : 502, { lhdnStatus: e.status, lhdnCode: e.code, message: e.message });
    }
    throw new EInvoiceError("myinvois_unreachable", 502);
  }
  return updateSubmission(row.id, { status: "CANCELLED", cancelledAt: now, cancelReason: args.reason });
}

/** Cron: refresh SUBMITTED documents not polled in the last few seconds. Fail-soft. */
export async function refreshPendingEInvoices(now: Date = new Date(), limit = 50, client: MyInvoisClient | null = getMyInvoisClient()) {
  if (!client) return { skipped: true as const, refreshed: 0, failed: 0 };
  const rows = await prisma.eInvoiceSubmission.findMany({
    where: {
      status: "SUBMITTED",
      submissionUid: { not: null },
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date(now.getTime() - MIN_POLL_INTERVAL_MS) } }],
    },
    orderBy: [{ lastPolledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit,
    select: SUBMISSION_SELECT,
  });
  let refreshed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await refreshSubmission(row, client, now);
      refreshed++;
    } catch (e) {
      failed++;
      console.error("e-invoice status refresh failed", row.id, e instanceof Error ? e.message : e);
    }
  }
  return { skipped: false as const, refreshed, failed };
}

// ─── Monthly consolidated e-invoice (B2C) ───

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthBounds(month: string): { start: Date; end: Date; firstDay: string; lastDay: string } {
  const m = month.match(MONTH);
  if (!m) throw new EInvoiceError("validation", 422, { field: "month" });
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
  const lastDate = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    start: clinicDayBounds(`${month}-01`).start,
    end: clinicDayBounds(next).start,
    firstDay: `${month}-01`,
    lastDay: `${month}-${String(lastDate).padStart(2, "0")}`,
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function consolidationCandidates(branchId: string, start: Date, end: Date) {
  const rows = await prisma.invoice.findMany({
    where: {
      branchId,
      issuedAt: { gte: start, lt: end },
      status: { notIn: ["DRAFT", "CANCELLED"] },
      consolidatedIntoId: null,
      // A cancelled own e-invoice (e.g. wrong buyer) leaves the sale to the consolidated one.
      einvoiceStatus: { in: ["NOT_SUBMITTED", "INVALID", "CANCELLED"] },
    },
    orderBy: [{ issuedAt: "asc" }, { invoiceNumber: "asc" }],
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      amount: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      lineItems: true,
      status: true,
      currency: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  const included: (typeof rows[number] & { fields: ReturnType<typeof invoiceFields> })[] = [];
  const excluded: ConsolidatedPreview["excluded"] = [];
  for (const row of rows) {
    const fields = invoiceFields(row);
    if (toSen(fields.total) <= 0) excluded.push({ id: row.id, invoiceNumber: row.invoiceNumber, total: fields.total, reason: "zero_amount" });
    else if (fields.total > CONSOLIDATION_MAX_TRANSACTION) {
      excluded.push({ id: row.id, invoiceNumber: row.invoiceNumber, total: fields.total, reason: "over_limit" });
    } else included.push({ ...row, fields });
  }
  return { included, excluded };
}

function entryOf(fields: ReturnType<typeof invoiceFields>): ConsolidatedEntry {
  return {
    number: fields.invoiceNumber,
    subtotal: fields.subtotal,
    taxableBase: taxableBase(fields),
    taxAmount: fields.taxAmount,
    taxRate: fields.taxRate ?? 0,
  };
}

/** Invoices grouped so each consolidated document stays within the line cap. */
function chunkEntries<T extends { fields: ReturnType<typeof invoiceFields> }>(items: T[]): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let lines = 0;
  for (const item of items) {
    const n = consolidatedLines([entryOf(item.fields)]).length;
    if (current.length > 0 && lines + n > CONSOLIDATED_LINES_PER_DOCUMENT) {
      chunks.push(current);
      current = [];
      lines = 0;
    }
    current.push(item);
    lines += n;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function consolidatedPreview(branchId: string, month: string, now: Date = new Date()) {
  const bounds = monthBounds(month);
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: BRANCH_EINVOICE_SELECT });
  if (!branch) throw new EInvoiceError("not_found", 404);
  const { included, excluded } = await consolidationCandidates(branchId, bounds.start, bounds.end);
  const submissions = await prisma.eInvoiceSubmission.findMany({
    where: { branchId, kind: "CONSOLIDATED", periodStart: bounds.start },
    orderBy: { createdAt: "desc" },
    select: SUBMISSION_SELECT,
  });
  const sum = (pick: (f: ReturnType<typeof invoiceFields>) => number) => fromSen(included.reduce((s, i) => s + toSen(pick(i.fields)), 0));
  const dueBy = addDays(bounds.lastDay, CONSOLIDATION_DEADLINE_DAYS);
  const today = clinicParts(now);
  const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  return {
    branch,
    bounds,
    included,
    submissions,
    preview: {
      month,
      periodStart: bounds.start.toISOString(),
      periodEnd: bounds.end.toISOString(),
      monthEnded: now.getTime() >= bounds.end.getTime(),
      dueBy,
      late: todayKey > dueBy,
      included: included.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issuedAt: i.issuedAt.toISOString(),
        patientName: `${i.patient.firstName} ${i.patient.lastName}`,
        subtotal: i.fields.subtotal,
        taxAmount: i.fields.taxAmount,
        total: i.fields.total,
      })),
      excluded,
      totals: {
        subtotal: sum((f) => f.subtotal),
        taxAmount: sum((f) => f.taxAmount),
        total: sum((f) => f.total),
        documents: chunkEntries(included).length,
      },
      supplier: validateSupplier(branch),
    },
  };
}

function consolidatedNumber(branch: { invoicePrefix: string | null; name: string }, month: string, seq: number): string {
  return `CONS-${documentPrefix(branch)}-${month.replace("-", "")}-${String(seq).padStart(2, "0")}`;
}

/** Builds (without saving) the consolidated document(s) for a month — the JSON download. */
export async function prepareConsolidatedDocuments(branchId: string, month: string, now: Date = new Date()) {
  const { branch, bounds, included, submissions } = await consolidatedPreview(branchId, month, now);
  const supplier = supplierFromBranch(branch);
  if (supplier.errors.length > 0) throw new EInvoiceError("validation_failed", 422, { errors: supplier.errors, warnings: supplier.warnings });
  if (included.length === 0) throw new EInvoiceError("nothing_to_consolidate", 422);
  const version = getDocumentSigner().version;
  const chunks = chunkEntries(included);
  const prepared: { prepared: PreparedDocument; invoiceIds: string[] }[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const number = consolidatedNumber(branch, month, submissions.length + i + 1);
    const doc = buildConsolidatedDocument({
      version,
      number,
      issuedAt: now,
      supplier: supplier.value!,
      entries: chunk.map((c) => entryOf(c.fields)),
      period: { start: bounds.firstDay, end: bounds.lastDay },
    });
    const { document, encoded } = await signAndEncode(doc);
    prepared.push({ prepared: { kind: "CONSOLIDATED", codeNumber: number, version, document, encoded }, invoiceIds: chunk.map((c) => c.id) });
  }
  return { branch, bounds, prepared };
}

/**
 * Consolidates a completed month's B2C invoices that weren't issued
 * individually into General Public e-invoice(s) and submits them. Invoices are
 * claimed (consolidatedIntoId) before the call so two runs can't both take them.
 */
export async function submitConsolidated(args: { branchId: string; month: string; userId: string | null; now?: Date; client?: MyInvoisClient | null }) {
  const now = args.now ?? new Date();
  const bounds = monthBounds(args.month);
  if (now.getTime() < bounds.end.getTime()) throw new EInvoiceError("month_not_ended", 422);
  const client = requireClient(args.client);
  const branch = await prisma.branch.findUnique({ where: { id: args.branchId }, select: { einvoiceEnabled: true } });
  if (!branch) throw new EInvoiceError("not_found", 404);
  if (!branch.einvoiceEnabled) throw new EInvoiceError("einvoice_disabled", 409);

  const { prepared } = await prepareConsolidatedDocuments(args.branchId, args.month, now);
  if (prepared.length > MAX_DOCUMENTS_PER_SUBMISSION) throw new EInvoiceError("too_many_documents", 422);

  const rows = await prisma.$transaction(async (tx) => {
    const created: { id: string; prepared: PreparedDocument }[] = [];
    for (const item of prepared) {
      const row = await createRow(tx, {
        kind: "CONSOLIDATED",
        branchId: args.branchId,
        prepared: item.prepared,
        userId: args.userId,
        periodStart: bounds.start,
        periodEnd: bounds.end,
      });
      const claimed = await tx.invoice.updateMany({
        where: { id: { in: item.invoiceIds }, consolidatedIntoId: null },
        data: { consolidatedIntoId: row.id },
      });
      if (claimed.count !== item.invoiceIds.length) throw new EInvoiceError("concurrent_consolidation", 409);
      created.push({ id: row.id, prepared: item.prepared });
    }
    return created;
  });

  try {
    return await sendDocuments(client, rows, now);
  } finally {
    // Documents that never reached LHDN release their invoices.
    const pending = await prisma.eInvoiceSubmission.findMany({
      where: { id: { in: rows.map((r) => r.id) }, status: "NOT_SUBMITTED" },
      select: { id: true },
    });
    if (pending.length > 0) {
      await prisma.invoice.updateMany({ where: { consolidatedIntoId: { in: pending.map((p) => p.id) } }, data: { consolidatedIntoId: null } });
    }
  }
}

/**
 * The invoice's own validated e-invoice for printing (QR + UUID). A
 * consolidated e-invoice isn't shown: it is issued to the General Public, not
 * to this patient (Specific Guideline §3.6).
 */
export async function validatedEInvoiceForPdf(invoiceId: string) {
  const row = await prisma.eInvoiceSubmission.findFirst({
    where: { invoiceId, kind: "INVOICE", status: "VALID", uuid: { not: null }, longId: { not: null } },
    orderBy: { validatedAt: "desc" },
    select: { uuid: true, longId: true, validatedAt: true },
  });
  if (!row?.uuid || !row.longId) return undefined;
  return { uuid: row.uuid, validationUrl: validationLink(portalBaseUrl(), row.uuid, row.longId), validatedAt: row.validatedAt };
}

// ─── Branch settings ───

export function branchStateCode(branch: { state: string | null; city: string | null; zip: string | null }) {
  const code = malaysianStateCode(branch.state, branch.city, branch.zip);
  return { stateCode: code, stateName: code ? STATE_NAMES[code] : null };
}

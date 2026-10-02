"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { formatMYR } from "@/lib/invoices";
import { cn } from "@/lib/utils";
import { blankLine, checkLines, previewTotals, type LineDraft } from "@/lib/invoice-form";
import { nationalityLabel } from "@/lib/nationality";
import { clinicDateKey } from "@/lib/clinic-time";
import { DISCARD_CHANGES_PROMPT } from "@/lib/format";
import type { BranchBillingSettings, InvoiceDetail, InvoicePatientOption } from "@/types/invoice";
import { LineItemsEditor } from "./LineItemsEditor";
import { ALERT_ERROR, BTN_PRIMARY, BTN_SECONDARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA } from "./form-styles";

interface NewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Branches where the caller issues invoices (invoice.manage). */
  branches: { id: string; name: string }[];
  defaultBranchId?: string | null;
  /** Patient page: the invoice is for this patient (and their branch). */
  patient?: InvoicePatientOption | null;
  onCreated: (invoice: InvoiceDetail) => void;
}

/** Billing settings per branch; null = the caller can't read them (front desk). */
type BillingState = BranchBillingSettings | null | "loading";

const ERRORS: Record<string, string> = {
  patient_not_in_branch: "That patient belongs to another branch — pick the patient's own branch.",
  forbidden: "You can't issue invoices at this branch.",
  not_found: "Patient not found.",
  no_line_items: "Add at least one item.",
  validation: "Check the items — each needs a description, quantity and price.",
};

export function NewInvoiceDialog(props: NewInvoiceDialogProps) {
  // The form registers its close handler so Esc / backdrop confirm before discarding.
  const closeRef = useRef<() => void>(() => props.onOpenChange(false));
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && closeRef.current()}>
      {/* Mounted per open so every invoice starts from a clean form. */}
      {props.open && <NewInvoiceForm {...props} closeRef={closeRef} />}
    </Dialog>
  );
}

function defaultDueDate(): string {
  return clinicDateKey(new Date(Date.now() + 14 * 86_400_000));
}

function NewInvoiceForm({
  onOpenChange,
  branches,
  defaultBranchId,
  patient: fixedPatient,
  onCreated,
  closeRef,
}: NewInvoiceDialogProps & { closeRef: React.RefObject<() => void> }) {
  const [branchId, setBranchId] = useState(
    fixedPatient?.branchId ?? (branches.some((b) => b.id === defaultBranchId) ? defaultBranchId! : branches[0]?.id ?? ""),
  );
  const [patient, setPatient] = useState<InvoicePatientOption | null>(fixedPatient ?? null);
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [dueError, setDueError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [billing, setBilling] = useState<Record<string, BillingState>>({});
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState<"DRAFT" | "SENT" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const branchBilling = billing[branchId];
  useEffect(() => {
    if (!branchId || branchBilling !== undefined) return;
    setBilling((b) => ({ ...b, [branchId]: "loading" }));
    fetch(`/api/branches/${branchId}/billing`)
      .then(async (res) => (res.ok ? ((await res.json()).billing as BranchBillingSettings) : null))
      .catch(() => null)
      .then((settings) => setBilling((b) => ({ ...b, [branchId]: settings })));
  }, [branchId, branchBilling]);

  const check = checkLines(lines);
  const settings = branchBilling && branchBilling !== "loading" ? branchBilling : null;
  const { totals, taxKnown } = previewTotals(lines, {
    branch: settings ? { sstEnabled: settings.sstEnabled, sstRate: settings.sstRate } : null,
    patientIsMalaysian: patient?.isMalaysian ?? null,
  });
  const patientError = showErrors && !patient ? "Pick a patient" : null;

  function markDirty() {
    setDirty(true);
    setServerError(null);
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm(DISCARD_CHANGES_PROMPT)) return;
    onOpenChange(false);
  }
  useEffect(() => {
    closeRef.current = requestClose;
  });

  async function save(status: "DRAFT" | "SENT") {
    setShowErrors(true);
    if (!patient || !check.valid || dueError || saving) return;
    setSaving(status);
    setServerError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          branchId,
          lines: check.lines,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
          status,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setServerError(ERRORS[data?.error] ?? "Couldn't create the invoice. Please try again.");
        return;
      }
      onCreated(data.invoice as InvoiceDetail);
      onOpenChange(false);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  const sstRow = (() => {
    if (taxKnown && totals.taxApplied) return { label: `${totals.taxLabel} on taxable items`, value: formatMYR(totals.taxAmount) };
    if (taxKnown && settings?.sstEnabled) return { label: "No SST — Malaysian patient", value: formatMYR(0) };
    if (taxKnown) return null;
    if (branchBilling === "loading") return { label: "SST", value: "…" };
    if (!settings) return { label: "SST worked out on save", value: "" };
    if (settings.sstEnabled) return { label: "SST depends on the patient's nationality", value: "" };
    return null;
  })();

  return (
    <DialogContent className="gap-0 rounded-surface p-0 sm:max-w-2xl">
      <DialogHeader className="border-b border-border px-5 py-4">
        <DialogTitle className="text-[18px] font-medium text-foreground">New invoice</DialogTitle>
        <DialogDescription className="text-[14px] text-fg-secondary">
          For items not tied to an appointment — products, reports, packages, adjustments.
        </DialogDescription>
      </DialogHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save("SENT");
        }}
        onChange={markDirty}
        className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4"
      >
        {serverError && (
          <p role="alert" className={ALERT_ERROR}>
            {serverError}
          </p>
        )}

        <div className={`grid gap-3 ${!fixedPatient && branches.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {!fixedPatient && branches.length > 1 && (
            <div>
              <label htmlFor="inv-branch" className={FIELD_LABEL}>
                Branch
              </label>
              <select
                id="inv-branch"
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setPatient(null);
                }}
                className={cn(FIELD_INPUT, "cursor-pointer")}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span className={FIELD_LABEL}>Patient</span>
            {fixedPatient ? (
              <p className="flex h-9 items-center text-[15px] text-foreground">
                {fixedPatient.firstName} {fixedPatient.lastName}
              </p>
            ) : (
              <PatientCombobox
                value={patient}
                onChange={(p) => {
                  setPatient(p);
                  markDirty();
                }}
                branchId={branchId || undefined}
              />
            )}
            {patientError && <p className={FIELD_ERROR}>{patientError}</p>}
            {patient && patient.isMalaysian !== undefined && (
              <p className="mt-1 text-[13px] text-fg-secondary">
                {patient.isMalaysian
                  ? `Malaysian${patient.nationality ? "" : " (MyKad)"} — no SST`
                  : `${nationalityLabel(patient.nationality) ?? "Nationality not recorded"} — SST applies when the branch charges it`}
              </p>
            )}
          </div>
        </div>

        <div>
          <span className={FIELD_LABEL}>Items</span>
          <LineItemsEditor
            lines={lines}
            onChange={(next) => {
              setLines(next);
              markDirty();
            }}
            errors={check.errors}
            showErrors={showErrors}
          />
          {showErrors && check.lines.length === 0 && Object.keys(check.errors).length === 0 && (
            <p className={FIELD_ERROR}>Add at least one item.</p>
          )}
        </div>

        <div className="ml-auto max-w-sm space-y-1.5 rounded-panel bg-surface-muted px-4 py-3" aria-live="polite">
          <div className="flex justify-between gap-4 text-[15px] text-fg-secondary">
            <span>Subtotal</span>
            <span className="whitespace-nowrap tabular-nums">{formatMYR(totals.subtotal)}</span>
          </div>
          {sstRow && (
            <div className="flex justify-between gap-4 text-[14px] text-fg-secondary">
              <span>{sstRow.label}</span>
              <span className="whitespace-nowrap tabular-nums">{sstRow.value}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-[16px] font-medium text-foreground">
            <span>Total{!taxKnown && sstRow?.value === "" ? " (before SST)" : ""}</span>
            <span className="whitespace-nowrap tabular-nums">{formatMYR(totals.total)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="inv-due" className={FIELD_LABEL}>
              Due date <span className="font-normal text-fg-secondary">(optional)</span>
            </label>
            <DateInput
              id="inv-due"
              value={dueDate}
              onChange={(iso) => {
                setDueDate(iso);
                markDirty();
              }}
              onErrorChange={setDueError}
              min={clinicDateKey()}
              inputClassName={FIELD_INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor="inv-notes" className={FIELD_LABEL}>
            Notes <span className="font-normal text-fg-secondary">(printed on the invoice)</span>
          </label>
          <textarea id="inv-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={FIELD_TEXTAREA} />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={requestClose} className={BTN_SECONDARY} disabled={!!saving}>
            Cancel
          </button>
          <button type="button" onClick={() => void save("DRAFT")} className={BTN_SECONDARY} disabled={!!saving}>
            {saving === "DRAFT" && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            Save as draft
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={!!saving}>
            {saving === "SENT" && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            Create &amp; mark sent
          </button>
        </div>
      </form>
    </DialogContent>
  );
}

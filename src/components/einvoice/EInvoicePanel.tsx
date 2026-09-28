"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import { formatMYR } from "@/lib/invoices";
import type { EInvoiceSubmissionView, InvoiceEInvoiceState } from "@/types/einvoice";
import { ALERT_ERROR, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from "@/components/invoices/form-styles";
import { EInvoiceStatusPill, einvoiceErrorMessage } from "./EInvoiceStatusPill";

interface EInvoicePanelProps {
  invoiceId: string;
  /** After a submission or cancellation, so lists can refresh. */
  onChanged?: () => void;
}

const when = (iso: string) => `${clinicDateLabel(new Date(iso))}, ${clinicTimeLabel(new Date(iso))}`;

async function downloadJson(url: string, fallbackName: string): Promise<{ ok: true } | { ok: false; data: { error?: string; errors?: { field: string; message: string }[] } | null }> {
  const res = await fetch(url);
  if (!res.ok) return { ok: false, data: await res.json().catch(() => null) };
  const blob = await res.blob();
  const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
  return { ok: true };
}

function SubmissionErrors({ doc }: { doc: EInvoiceSubmissionView }) {
  if (doc.errors.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-[13px] text-[#b41a36]">
      {doc.errors.slice(0, 8).map((e, i) => (
        <li key={i}>
          {e.code && <span className="font-mono text-[12px]">{e.code} </span>}
          {e.message}
          {e.path && <span className="block font-mono text-[11px] text-[#697386]">{e.path}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Invoice drawer → e-Invoice: LHDN status, pre-submission check, submit, validation link, JSON download, cancel, refund notes. */
export function EInvoicePanel({ invoiceId, onChanged }: EInvoicePanelProps) {
  const [state, setState] = useState<InvoiceEInvoiceState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${invoiceId}/einvoice`);
    if (!res.ok) {
      setLoadError("Couldn't load the e-invoice status.");
      setState(null);
      return null;
    }
    const data = (await res.json()) as InvoiceEInvoiceState;
    setState(data);
    return data;
  }, [invoiceId]);

  useEffect(() => {
    setState(null);
    setShowCheck(false);
    setNotice(null);
    void load();
  }, [load]);

  if (loadError) return <p className={ALERT_ERROR}>{loadError}</p>;
  if (!state) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-[#64748d]">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Loading e-invoice…
      </div>
    );
  }

  const current = state.current;
  const validDoc = current?.status === "VALID" ? current : null;
  const covering = validDoc ?? (state.consolidatedInto?.status === "VALID" ? state.consolidatedInto : null);
  const blocked = current?.status === "SUBMITTED" || current?.status === "VALID" || (state.consolidatedInto && ["SUBMITTED", "VALID"].includes(state.consolidatedInto.status));
  const cancellable = validDoc?.cancellableUntil && new Date(validDoc.cancellableUntil).getTime() > Date.now();

  async function validate() {
    setBusy("validate");
    try {
      await load();
      setShowCheck(true);
    } finally {
      setBusy(null);
    }
  }

  async function submit(paymentId?: string) {
    setBusy(paymentId ?? "submit");
    setNotice(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/einvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentId ? { paymentId } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = einvoiceErrorMessage(data?.error, "Couldn't submit the e-invoice.");
        setNotice(message);
        if (data?.error === "validation_failed") setShowCheck(true);
        toast.error(message);
        await load();
        return;
      }
      setState(data.state);
      toast.success(data.submission.status === "INVALID" ? "LHDN rejected the document — see the errors." : "Submitted to LHDN for validation");
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  async function download(paymentId?: string) {
    setBusy(`dl-${paymentId ?? "invoice"}`);
    try {
      const url = `/api/invoices/${invoiceId}/einvoice/document.json${paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : ""}`;
      const result = await downloadJson(url, `einvoice-${state?.invoiceNumber ?? invoiceId}.json`);
      if (!result.ok) {
        setShowCheck(true);
        toast.error(result.data?.error === "validation_failed" ? "Fix the listed details first." : "Couldn't generate the JSON.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancel(doc: EInvoiceSubmissionView) {
    const reason = window.prompt(`Why cancel ${doc.codeNumber} with LHDN? (e.g. Wrong buyer details)`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(`cancel-${doc.id}`);
    try {
      const res = await fetch(`/api/einvoice/submissions/${doc.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(einvoiceErrorMessage(data?.error, "Couldn't cancel the e-invoice."));
        return;
      }
      toast.success(`${doc.codeNumber} cancelled with LHDN`);
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  const check = state.validation;

  return (
    <section aria-labelledby="inv-einvoice" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="inv-einvoice" className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          e-Invoice (LHDN MyInvois)
        </h3>
        <EInvoiceStatusPill status={state.einvoiceStatus} />
      </div>

      <div className="rounded-[6px] border border-[#e5edf5] p-3 text-[14px]">
        {!state.configured && (
          <p className="mb-2 text-[13px] text-[#64748d]">
            MyInvois isn&apos;t connected ({state.environment}); you can download the JSON. Submitting needs the clinic&apos;s LHDN client ID and secret on the server.
          </p>
        )}
        {state.consolidatedInto && (
          <p className="mb-2 text-[13px] text-[#425466]">
            Included in consolidated e-invoice <span className="font-mono">{state.consolidatedInto.codeNumber}</span> ({state.consolidatedInto.status.toLowerCase().replace("_", " ")}).
          </p>
        )}
        {current && (
          <div className="mb-2 text-[13px] text-[#425466]">
            <p>
              Document <span className="font-mono">{current.codeNumber}</span> · v{current.documentVersion}
              {current.submittedAt && <> · sent {when(current.submittedAt)}</>}
              {current.validatedAt && current.status === "VALID" && <> · validated {when(current.validatedAt)}</>}
            </p>
            {current.uuid && <p className="font-mono text-[12px] text-[#64748d]">UUID {current.uuid}</p>}
            {current.status === "CANCELLED" && current.cancelReason && <p>Cancelled: {current.cancelReason}</p>}
            {current.status === "INVALID" && <SubmissionErrors doc={current} />}
            {current.status === "NOT_SUBMITTED" && current.errors.length > 0 && <SubmissionErrors doc={current} />}
          </div>
        )}
        {state.refreshError && <p className="mb-2 text-[13px] text-[#9b6829]">{state.refreshError}</p>}
        {notice && <p className={`${ALERT_ERROR} mb-2`} role="alert">{notice}</p>}

        {showCheck && (
          <div className="mb-3" aria-live="polite">
            {check.ok ? (
              <p className="flex items-center gap-1.5 text-[13px] text-[#1f7a1f]">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> All required e-invoice details are present.
              </p>
            ) : (
              <div className="rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2">
                <p className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-[#b41a36]">
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.75} /> {check.errors.length} detail{check.errors.length === 1 ? "" : "s"} to fix
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-[#b41a36]" data-testid="einvoice-errors">
                  {check.errors.map((e, i) => (
                    <li key={`${e.field}-${i}`}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {check.warnings.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-[#9b6829]">
                {check.warnings.map((w, i) => (
                  <li key={`${w.field}-${i}`}>{w.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => void validate()} disabled={busy !== null}>
            {busy === "validate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />}
            Validate
          </button>
          {state.canManage && !blocked && (
            <button type="button" className={BTN_PRIMARY} onClick={() => void submit()} disabled={busy !== null}>
              {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
              Submit to LHDN
            </button>
          )}
          {validDoc?.validationUrl && (
            <a href={validDoc.validationUrl} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} /> Validation link
            </a>
          )}
          <button type="button" className={BTN_SECONDARY} onClick={() => void download()} disabled={busy !== null}>
            {busy === "dl-invoice" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" strokeWidth={1.75} />}
            Download JSON
          </button>
          {state.canManage && validDoc && cancellable && (
            <button type="button" className={BTN_DANGER} onClick={() => void cancel(validDoc)} disabled={busy !== null}>
              <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Cancel e-invoice
            </button>
          )}
        </div>
        {validDoc?.cancellableUntil && cancellable && (
          <p className="mt-2 text-[12px] text-[#64748d]">Can be cancelled until {when(validDoc.cancellableUntil)}.</p>
        )}
      </div>

      {state.refunds.length > 0 && (
        <div className="rounded-[6px] border border-[#e5edf5] p-3">
          <p className="mb-2 text-[13px] font-medium text-[#273951]">Refund notes</p>
          <ul className="space-y-2">
            {state.refunds.map((r) => (
              <li key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="text-[#425466]">
                  <span className="font-mono">{r.receiptNumber}</span> · {formatMYR(r.amount)}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.note ? <EInvoiceStatusPill status={r.note.status} /> : null}
                  {r.note?.validationUrl && (
                    <a href={r.note.validationUrl} target="_blank" rel="noopener noreferrer" className="text-[#533afd] hover:underline">
                      Link
                    </a>
                  )}
                  {covering && (
                    <button type="button" className="text-[#533afd] hover:underline disabled:opacity-60" onClick={() => void download(r.paymentId)} disabled={busy !== null}>
                      JSON
                    </button>
                  )}
                  {state.canManage && covering && (!r.note || ["INVALID", "CANCELLED", "NOT_SUBMITTED"].includes(r.note.status)) && (
                    <button type="button" className="text-[#533afd] hover:underline disabled:opacity-60" onClick={() => void submit(r.paymentId)} disabled={busy !== null}>
                      Submit refund note
                    </button>
                  )}
                </span>
                {r.note?.status === "INVALID" && <SubmissionErrors doc={r.note} />}
              </li>
            ))}
          </ul>
          {!covering && <p className="mt-2 text-[12px] text-[#64748d]">Refund notes need a validated e-invoice to reference.</p>}
        </div>
      )}
    </section>
  );
}

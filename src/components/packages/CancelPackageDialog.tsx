"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell, FIELD_CLASS, LABEL_CLASS, FormError } from "./ModalShell";
import type { PatientPackageJson } from "@/types/packages";

interface Props {
  pkg: PatientPackageJson | null;
  onClose: () => void;
  onCancelled: (pkg: PatientPackageJson) => void;
}

/** Invoice states that can still be voided along with the package. */
const CANCELLABLE_INVOICE = new Set(["DRAFT", "SENT", "OVERDUE"]);

/** Cancel a sold package (OWNER / ADMIN) with a reason; optionally void its unpaid sale invoice. */
export function CancelPackageDialog({ pkg, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [cancelInvoice, setCancelInvoice] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setCancelInvoice(true);
    setError(null);
  }, [pkg?.id]);

  const invoice = pkg?.invoice ?? null;
  const invoiceCancellable = !!invoice && CANCELLABLE_INVOICE.has(invoice.status);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/patient-packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CANCELLED",
          reason: reason.trim(),
          ...(invoiceCancellable ? { cancelInvoice } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { package?: PatientPackageJson; message?: string };
      if (!res.ok || !data.package) {
        setError(data.message ?? "Couldn't cancel the package.");
        return;
      }
      onCancelled(data.package);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={!!pkg}
      role="alertdialog"
      title="Cancel package?"
      description={pkg ? `${pkg.name} — ${pkg.sessionsLeft} unused session${pkg.sessionsLeft === 1 ? "" : "s"} can no longer be used.` : undefined}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-control text-[14px]">
            Keep package
          </Button>
          <Button
            type="submit"
            form="cancel-package-form"
            disabled={!reason.trim() || saving}
            className="h-8 gap-1.5 rounded-control bg-danger text-[14px] hover:bg-danger/90"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            Cancel package
          </Button>
        </>
      }
    >
      <form id="cancel-package-form" onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="cancel-package-reason" className={LABEL_CLASS}>Reason</label>
          <input
            id="cancel-package-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Patient moved away"
            className={FIELD_CLASS}
            autoFocus
          />
        </div>
        {invoice && invoiceCancellable && (
          <label className="flex items-start gap-2 text-[14px] text-foreground">
            <input
              type="checkbox"
              checked={cancelInvoice}
              onChange={(e) => setCancelInvoice(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              Also cancel the unpaid sale invoice <span className="font-medium tabular-nums">{invoice.invoiceNumber}</span>
            </span>
          </label>
        )}
        {invoice && !invoiceCancellable && invoice.status !== "CANCELLED" && (
          <p className="text-[13px] text-fg-secondary">
            The sale invoice {invoice.invoiceNumber} has payments — refund it from Invoices if needed.
          </p>
        )}
      </form>
    </ModalShell>
  );
}

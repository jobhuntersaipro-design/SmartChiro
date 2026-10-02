"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { HEALTH_MSIC_SUGGESTIONS } from "@/lib/myinvois/codes";
import type { BranchEInvoiceSettings } from "@/types/einvoice";
import { cn } from "@/lib/utils";
import { ALERT_ERROR, BTN_PRIMARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, INVALID } from "@/components/invoices/form-styles";
import { ConsolidatedEInvoicePanel } from "./ConsolidatedEInvoicePanel";

interface Props {
  branchId: string;
}

interface FormState {
  msicCode: string;
  businessActivity: string;
  einvoiceEnabled: boolean;
}

const toForm = (s: BranchEInvoiceSettings): FormState => ({
  msicCode: s.msicCode ?? "",
  businessActivity: s.businessActivity ?? "",
  einvoiceEnabled: s.einvoiceEnabled,
});

/**
 * Billing & tax → e-Invoice (LHDN MyInvois): MSIC code, business activity,
 * the on/off switch, whether LHDN credentials are configured on the server
 * (never the credentials), what's still missing, and the monthly
 * consolidated e-invoice. OWNER edits; ADMIN reads and files.
 */
export function EInvoiceSettingsSection({ branchId }: Props) {
  const [settings, setSettings] = useState<BranchEInvoiceSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/branches/${branchId}/einvoice`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSettings(data.settings);
        setForm(toForm(data.settings));
      })
      .catch(() => !cancelled && setError("Couldn't load e-invoice settings."));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (error) return <p className={ALERT_ERROR}>{error}</p>;
  if (!settings || !form) return <p className="text-[14px] text-fg-muted">Loading e-invoice settings…</p>;

  const msicError = form.msicCode && !/^\d{5}$/.test(form.msicCode.trim()) ? "5 digits, e.g. 86909" : null;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings));
  const canEdit = settings.canEdit;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!form || msicError) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/einvoice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msicCode: form.msicCode.trim(), businessActivity: form.businessActivity, einvoiceEnabled: form.einvoiceEnabled }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings(data.settings);
      setForm(toForm(data.settings));
      toast.success("e-Invoice settings saved");
    } catch {
      toast.error("Couldn't save e-invoice settings.");
    } finally {
      setSaving(false);
    }
  }

  function pickMsic(code: string) {
    const match = HEALTH_MSIC_SUGGESTIONS.find((m) => m.code === code.trim());
    setForm((f) => (f ? { ...f, msicCode: code, businessActivity: match && !f.businessActivity ? match.description : f.businessActivity } : f));
  }

  return (
    <div className="space-y-4 border-t border-border pt-5" data-testid="einvoice-settings">
      <div>
        <h4 className="text-[16px] font-medium text-foreground">e-Invoice (LHDN MyInvois)</h4>
        <p className="text-[14px] text-fg-muted">
          Issues invoices to LHDN for validation. Uses the legal name, SSM no., TIN and SST no. above plus the branch address and phone.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-panel border border-border bg-surface-muted p-3 text-[14px]">
        <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <div>
          {settings.configured ? (
            <p className="text-foreground">
              Connected to MyInvois <span className="font-medium">{settings.environment}</span>
              {settings.intermediary && " (as intermediary)"} · document version {settings.documentVersion}
            </p>
          ) : (
            <p className="text-foreground">
              Not connected — the server has no MyInvois client ID / secret. Invoices can still be checked and downloaded as JSON.
            </p>
          )}
          <p className="text-[13px] text-fg-secondary">Credentials are set by the administrator as environment variables and are never shown here.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor="einvoice-msic" className={FIELD_LABEL}>
            MSIC code
          </label>
          <input
            id="einvoice-msic"
            list="einvoice-msic-options"
            inputMode="numeric"
            maxLength={5}
            value={form.msicCode}
            disabled={!canEdit}
            onChange={(e) => pickMsic(e.target.value.replace(/\D/g, ""))}
            placeholder={canEdit ? "86909" : ""}
            aria-invalid={msicError ? true : undefined}
            className={cn(FIELD_INPUT, "font-mono", msicError && INVALID)}
          />
          <datalist id="einvoice-msic-options">
            {HEALTH_MSIC_SUGGESTIONS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.description}
              </option>
            ))}
          </datalist>
          {msicError && <p className={FIELD_ERROR}>{msicError}</p>}
        </div>
        <div>
          <label htmlFor="einvoice-activity" className={FIELD_LABEL}>
            Business activity description
          </label>
          <input
            id="einvoice-activity"
            value={form.businessActivity}
            maxLength={300}
            disabled={!canEdit}
            onChange={(e) => set("businessActivity", e.target.value)}
            placeholder={canEdit ? "e.g. Other human health services n.e.c." : ""}
            className={FIELD_INPUT}
          />
        </div>
      </div>
      <p className="-mt-2 text-[13px] text-fg-secondary">
        Use the MSIC code registered with LHDN for this business (your tax agent can confirm). State code from the branch address:{" "}
        {settings.stateCode ? (
          <span className="font-mono">
            {settings.stateCode} {settings.stateName}
          </span>
        ) : (
          <span className="text-danger">not recognised — set the state in the branch details</span>
        )}
        .
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-[15px] text-foreground">
        <input
          type="checkbox"
          checked={form.einvoiceEnabled}
          disabled={!canEdit}
          onChange={(e) => set("einvoiceEnabled", e.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        Issue e-invoices for this branch
      </label>

      {settings.readiness.ok ? (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> Clinic details are complete for e-invoicing.
        </p>
      ) : (
        <div className="rounded-control border border-warning/30 bg-warning-subtle px-3 py-2 text-[13px] text-warning">
          <p className="mb-1 font-medium">Still needed before submitting:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {settings.readiness.errors.map((e, i) => (
              <li key={`${e.field}-${i}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {canEdit ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty || !!msicError} className={BTN_PRIMARY}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            Save e-invoice settings
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-fg-secondary">Only the branch owner can change e-invoice settings.</p>
      )}

      <ConsolidatedEInvoicePanel branchId={branchId} />
    </div>
  );
}

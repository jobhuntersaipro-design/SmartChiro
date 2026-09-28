"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BranchBillingSettings } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { parseMoney } from "@/lib/invoice-form";
import { ALERT_ERROR, BTN_PRIMARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, INVALID } from "@/components/invoices/form-styles";

interface Props {
  branchId: string;
}

interface FormState {
  legalName: string;
  ssmRegNo: string;
  tin: string;
  sstRegNo: string;
  sstEnabled: boolean;
  sstRate: string;
  invoicePrefix: string;
  paymentInstructions: string;
}

const toForm = (b: BranchBillingSettings): FormState => ({
  legalName: b.legalName ?? "",
  ssmRegNo: b.ssmRegNo ?? "",
  tin: b.tin ?? "",
  sstRegNo: b.sstRegNo ?? "",
  sstEnabled: b.sstEnabled,
  sstRate: String(b.sstRate),
  invoicePrefix: b.invoicePrefix ?? "",
  paymentInstructions: b.paymentInstructions ?? "",
});

function rateError(text: string): string | null {
  const rate = parseMoney(text);
  return rate === null || rate > 100 ? "0–100, up to 2 decimals" : null;
}

const prefixError = (text: string) => (/^[A-Za-z0-9]{0,8}$/.test(text.trim()) ? null : "Up to 8 letters or digits");

/**
 * Branch → Settings → Billing & tax: the company details printed on invoices
 * and receipts, SST, the number prefix and how to pay. OWNER edits; ADMIN
 * sees it read-only.
 */
export function BranchBillingSettingsCard({ branchId }: Props) {
  const [billing, setBilling] = useState<BranchBillingSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/branches/${branchId}/billing`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setBilling(data.billing);
        setCanEdit(Boolean(data.canEdit));
        setForm(toForm(data.billing));
      })
      .catch(() => !cancelled && setLoadError("Couldn't load billing settings."));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (loadError) return <p className={ALERT_ERROR}>{loadError}</p>;
  if (!billing || !form) return <div className="p-6 text-[#697386]">Loading billing settings…</div>;

  const errors = { sstRate: rateError(form.sstRate), invoicePrefix: prefixError(form.invoicePrefix) };
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(billing));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!form || errors.sstRate || errors.invoicePrefix) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: form.legalName,
          ssmRegNo: form.ssmRegNo,
          tin: form.tin,
          sstRegNo: form.sstRegNo,
          sstEnabled: form.sstEnabled,
          sstRate: parseMoney(form.sstRate),
          invoicePrefix: form.invoicePrefix,
          paymentInstructions: form.paymentInstructions,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBilling(data.billing);
      setForm(toForm(data.billing));
      toast.success("Billing & tax settings saved");
    } catch {
      toast.error("Couldn't save billing settings.");
    } finally {
      setSaving(false);
    }
  }

  const text = (key: "legalName" | "ssmRegNo" | "tin" | "sstRegNo", label: string, placeholder: string, max: number) => (
    <div>
      <label htmlFor={`billing-${key}`} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={`billing-${key}`}
        value={form[key]}
        maxLength={max}
        disabled={!canEdit}
        onChange={(e) => set(key, e.target.value)}
        placeholder={canEdit ? placeholder : ""}
        className={FIELD_INPUT}
      />
    </div>
  );

  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4">
        <h3 className="text-[18px] font-medium text-[#0A2540]">Billing &amp; tax</h3>
        <p className="text-[14px] text-[#697386]">Printed on invoices and receipts from this branch.</p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {text("legalName", "Legal name", "e.g. SmartChiro Wellness Sdn. Bhd.", 200)}
          {text("ssmRegNo", "SSM registration no.", "e.g. 202401012345 (1234567-A)", 50)}
          {text("tin", "Tax identification no. (TIN)", "e.g. C2584563200", 30)}
          {text("sstRegNo", "SST registration no.", "e.g. W10-1808-32000123", 50)}
        </div>

        <div className="rounded-[6px] border border-[#e5edf5] bg-[#f6f9fc] p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-[15px] text-[#061b31]">
              <input
                type="checkbox"
                checked={form.sstEnabled}
                disabled={!canEdit}
                onChange={(e) => set("sstEnabled", e.target.checked)}
                className="h-4 w-4 accent-[#533afd]"
              />
              Charge SST
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="billing-sstRate" className="text-[14px] text-[#425466]">
                Rate
              </label>
              <input
                id="billing-sstRate"
                inputMode="decimal"
                value={form.sstRate}
                disabled={!canEdit}
                onChange={(e) => set("sstRate", e.target.value)}
                aria-invalid={errors.sstRate ? true : undefined}
                className={cn(FIELD_INPUT, "w-20 bg-white text-right tabular-nums", errors.sstRate && INVALID)}
              />
              <span className="text-[14px] text-[#425466]">%</span>
            </div>
          </div>
          {errors.sstRate && <p className={FIELD_ERROR}>{errors.sstRate}</p>}
          <p className="mt-2 text-[13px] text-[#64748d]">
            Applied to taxable items for non-Malaysian patients only (chiropractic services to non-citizens, from 1 Jul 2025).
            Changes affect new invoices; issued invoices keep their tax.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="billing-invoicePrefix" className={FIELD_LABEL}>
              Invoice number prefix
            </label>
            <input
              id="billing-invoicePrefix"
              value={form.invoicePrefix}
              maxLength={8}
              disabled={!canEdit}
              onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())}
              placeholder={billing.effectivePrefix}
              aria-invalid={errors.invoicePrefix ? true : undefined}
              className={cn(FIELD_INPUT, "font-mono uppercase", errors.invoicePrefix && INVALID)}
            />
            {errors.invoicePrefix ? (
              <p className={FIELD_ERROR}>{errors.invoicePrefix}</p>
            ) : (
              <p className="mt-1 text-[13px] text-[#64748d]">
                {dirty && form.invoicePrefix.trim() !== (billing.invoicePrefix ?? "")
                  ? "Save to see the next number."
                  : <>Next: <span className="font-mono">{billing.nextInvoiceNumber}</span> · <span className="font-mono">{billing.nextReceiptNumber}</span></>}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="billing-paymentInstructions" className={FIELD_LABEL}>
            Payment instructions
          </label>
          <textarea
            id="billing-paymentInstructions"
            rows={3}
            maxLength={1000}
            value={form.paymentInstructions}
            disabled={!canEdit}
            onChange={(e) => set("paymentInstructions", e.target.value)}
            placeholder={canEdit ? "e.g. Maybank 5140 1234 5678 (SmartChiro Wellness Sdn. Bhd.) · DuitNow ID 202401012345" : ""}
            className={FIELD_TEXTAREA}
          />
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <button type="button" onClick={() => void save()} disabled={saving || !dirty || !!errors.sstRate || !!errors.invoicePrefix} className={BTN_PRIMARY}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
              Save billing settings
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-[#64748d]">Only the branch owner can change billing &amp; tax settings.</p>
        )}
      </div>
    </div>
  );
}

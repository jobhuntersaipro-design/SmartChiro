"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CommissionBasis } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { ModalShell, FIELD_CLASS, LABEL_CLASS, FormError } from "@/components/packages/ModalShell";
import { COMMISSION_BASES, COMMISSION_BASIS_LABEL, isPercentBasis } from "@/lib/commissions";
import { TREATMENT_LABELS, TREATMENT_OPTIONS } from "@/lib/treatment-colors";
import { clinicDateKey } from "@/lib/clinic-time";
import { roleLabel } from "@/lib/permissions";
import type { CommissionRuleJson, CommissionStaffOption } from "@/types/commissions";

interface Props {
  open: boolean;
  branchId: string;
  /** Edit this rule; null creates one. */
  rule: CommissionRuleJson | null;
  staff: CommissionStaffOption[];
  onClose: () => void;
  onSaved: (rule: CommissionRuleJson) => void;
}

interface FormState {
  doctorId: string;
  treatmentType: string;
  basis: CommissionBasis;
  rate: string;
  effectiveFrom: string;
  active: boolean;
}

const initial = (r: CommissionRuleJson | null): FormState => ({
  doctorId: r?.doctorId ?? "",
  treatmentType: r?.treatmentType ?? "",
  basis: r?.basis ?? "PERCENT_COLLECTED",
  rate: r ? String(r.rate) : "",
  effectiveFrom: r?.effectiveFrom ?? clinicDateKey(),
  active: r?.active ?? true,
});

function rateProblem(text: string, basis: CommissionBasis): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return "A number with up to 2 decimals";
  const rate = Number(text);
  if (rate <= 0) return "Must be more than 0";
  if (isPercentBasis(basis) && rate > 100) return "At most 100%";
  return null;
}

/** Create or edit a commission rule (Branch → Settings → Commissions). */
export function CommissionRuleDialog({ open, branchId, rule, staff, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(rule));
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial(rule));
    setError(null);
  }, [open, rule]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const packageBasis = form.basis === "PERCENT_PACKAGE_SALE";
  const rateError = form.rate.trim() ? rateProblem(form.rate, form.basis) : null;
  const valid = form.rate.trim() !== "" && !rateError && !!form.effectiveFrom && !dateError;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch(
        rule ? `/api/branches/${branchId}/commission-rules/${rule.id}` : `/api/branches/${branchId}/commission-rules`,
        {
          method: rule ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctorId: form.doctorId || null,
            treatmentType: packageBasis ? null : form.treatmentType || null,
            basis: form.basis,
            rate: Number(form.rate),
            effectiveFrom: form.effectiveFrom,
            active: form.active,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { rule?: CommissionRuleJson; message?: string };
      if (!res.ok || !data.rule) {
        setError(data.message ?? "Couldn't save the rule.");
        return;
      }
      onSaved(data.rule);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title={rule ? "Edit commission rule" : "New commission rule"}
      description="The most specific active rule wins: doctor + treatment, then doctor, then treatment, then all."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-control text-[14px]">
            Cancel
          </Button>
          <Button type="submit" form="commission-rule-form" disabled={!valid || saving} className="h-8 gap-1.5 rounded-control text-[14px]">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {rule ? "Save changes" : "Add rule"}
          </Button>
        </>
      }
    >
      <form id="commission-rule-form" onSubmit={save} className="space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="rule-basis" className={LABEL_CLASS}>Basis</label>
          <select id="rule-basis" value={form.basis} onChange={(e) => set("basis", e.target.value as CommissionBasis)} className={FIELD_CLASS}>
            {COMMISSION_BASES.map((b) => (
              <option key={b} value={b}>{COMMISSION_BASIS_LABEL[b]}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-doctor" className={LABEL_CLASS}>{packageBasis ? "Sold by" : "Doctor"}</label>
            <select id="rule-doctor" value={form.doctorId} onChange={(e) => set("doctorId", e.target.value)} className={FIELD_CLASS}>
              <option value="">{packageBasis ? "Anyone" : "All doctors"}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? "Unnamed"} ({roleLabel(s.role)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rule-treatment" className={LABEL_CLASS}>Treatment</label>
            <select
              id="rule-treatment"
              value={packageBasis ? "" : form.treatmentType}
              disabled={packageBasis}
              onChange={(e) => set("treatmentType", e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">All treatments</option>
              {TREATMENT_OPTIONS.map((t) => (
                <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-rate" className={LABEL_CLASS}>
              {isPercentBasis(form.basis) ? "Rate (%)" : "Amount per visit (RM)"}
            </label>
            <input
              id="rule-rate"
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
              placeholder={isPercentBasis(form.basis) ? "e.g. 10" : "e.g. 40.00"}
              aria-invalid={rateError ? true : undefined}
              className={`${FIELD_CLASS} tabular-nums`}
            />
            {rateError && <p className="mt-1 text-[12px] text-danger">{rateError}</p>}
          </div>
          <div>
            <label htmlFor="rule-effective" className={LABEL_CLASS}>Effective from</label>
            <DateInput
              id="rule-effective"
              value={form.effectiveFrom}
              onChange={(iso) => set("effectiveFrom", iso)}
              onErrorChange={setDateError}
              inputClassName="h-9 rounded-control text-[14px]"
            />
          </div>
        </div>
        {rule && (
          <label className="flex items-center gap-2 text-[14px] text-foreground">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-brand" />
            Active
          </label>
        )}
      </form>
    </ModalShell>
  );
}

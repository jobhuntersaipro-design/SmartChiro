"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BranchBillingSettings } from "@/types/invoice";
import { ACCOUNT_CODE_FIELDS, ACCOUNT_CODE_RE, type AccountCodeKey } from "@/lib/accounting-export";
import { cn } from "@/lib/utils";
import { BTN_SECONDARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, INVALID } from "@/components/invoices/form-styles";

interface Props {
  branchId: string;
  billing: BranchBillingSettings;
  canEdit: boolean;
  onSaved: (billing: BranchBillingSettings) => void;
}

type Codes = Record<AccountCodeKey, string>;

const toForm = (b: BranchBillingSettings): Codes =>
  Object.fromEntries(ACCOUNT_CODE_FIELDS.map((f) => [f.key, b.accountCodes?.[f.key] ?? ""])) as Codes;

const codeError = (text: string) => (text.trim() === "" || ACCOUNT_CODE_RE.test(text.trim()) ? null : "Letters, digits, . - / (max 20)");

/**
 * Billing & tax → Accounting codes: the chart-of-account codes the
 * accounting exports (journal, Xero) post to. Blank = the default shown.
 * OWNER edits; saved separately from the invoice details above.
 */
export function AccountCodesSection({ branchId, billing, canEdit, onSaved }: Props) {
  const [form, setForm] = useState<Codes>(() => toForm(billing));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(billing));
  const invalid = ACCOUNT_CODE_FIELDS.some((f) => codeError(form[f.key]));

  async function save() {
    if (invalid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(ACCOUNT_CODE_FIELDS.map((f) => [f.column, form[f.key].trim()]))),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onSaved(data.billing);
      setForm(toForm(data.billing));
      toast.success("Account codes saved");
    } catch {
      toast.error("Couldn't save the account codes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-[#e5edf5] pt-4">
      <h4 className="text-[15px] font-medium text-[#0A2540]">Accounting codes</h4>
      <p className="mb-3 text-[13px] text-[#64748d]">
        Used by the journal and Xero exports on the Invoices page. Leave blank for the default shown.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNT_CODE_FIELDS.map((f) => {
          const error = codeError(form[f.key]);
          return (
            <div key={f.key}>
              <label htmlFor={`acct-${f.key}`} className={FIELD_LABEL}>
                {f.label}
              </label>
              <input
                id={`acct-${f.key}`}
                value={form[f.key]}
                maxLength={20}
                disabled={!canEdit}
                placeholder={f.fallback}
                onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))}
                aria-invalid={error ? true : undefined}
                className={cn(FIELD_INPUT, "font-mono", error && INVALID)}
              />
              {error && <p className={FIELD_ERROR}>{error}</p>}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty || invalid} className={BTN_SECONDARY}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            Save account codes
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell, FIELD_CLASS, LABEL_CLASS, FormError } from "./ModalShell";
import { TreatmentTypePicker } from "./TreatmentTypePicker";
import { formatMYR } from "@/lib/invoices";
import { parseRinggit, treatmentTypesSummary } from "@/lib/package-ui";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import type { TreatmentType } from "@/types/appointment";
import type { PackageTemplateJson, PatientPackageJson, TreatmentTypeValue } from "@/types/packages";

interface Props {
  open: boolean;
  patientId: string;
  patientName: string;
  branchId: string;
  onClose: () => void;
  onSold: (pkg: PatientPackageJson) => void;
}

type Mode = "template" | "custom";

const labelFor = (t: string) => treatmentLabelFor(t as TreatmentType);

/** Sell a catalogue package (or a one-off custom one); creates the sale invoice. */
export function SellPackageDialog({ open, patientId, patientName, branchId, onClose, onSold }: Props) {
  const [templates, setTemplates] = useState<PackageTemplateJson[] | null>(null);
  const [mode, setMode] = useState<Mode>("template");
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [sessions, setSessions] = useState("");
  const [price, setPrice] = useState("");
  const [validity, setValidity] = useState("");
  const [types, setTypes] = useState<TreatmentTypeValue[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("template");
    setTemplateId("");
    setName("");
    setSessions("");
    setPrice("");
    setValidity("");
    setTypes([]);
    setNotes("");
    setError(null);
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/branches/${branchId}/packages`);
      const data = res.ok ? ((await res.json()) as { templates: PackageTemplateJson[] }) : { templates: [] };
      if (cancelled) return;
      setTemplates(data.templates);
      if (data.templates.length > 0) setTemplateId(data.templates[0].id);
      else setMode("custom");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  const template = templates?.find((t) => t.id === templateId) ?? null;
  const sessionsNum = Number.parseInt(sessions, 10);
  const priceNum = parseRinggit(price);
  const validityNum = validity.trim() === "" ? null : Number.parseInt(validity, 10);
  const customValid =
    name.trim().length > 0 &&
    Number.isInteger(sessionsNum) &&
    sessionsNum >= 1 &&
    sessionsNum <= 500 &&
    priceNum !== null &&
    (validityNum === null || (Number.isInteger(validityNum) && validityNum >= 1 && validityNum <= 3650));
  const valid = mode === "template" ? !!template : customValid;
  const total = mode === "template" ? template?.price ?? null : priceNum;

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const body =
        mode === "template"
          ? { templateId, ...(notes.trim() ? { notes: notes.trim() } : {}) }
          : {
              name: name.trim(),
              sessions: sessionsNum,
              price: priceNum,
              validityDays: validityNum,
              treatmentTypes: types,
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            };
      const res = await fetch(`/api/patients/${patientId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { package?: PatientPackageJson; message?: string };
      if (!res.ok || !data.package) {
        setError(data.message ?? "Couldn't sell the package.");
        return;
      }
      onSold(data.package);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="Sell package"
      description={`For ${patientName}. A sale invoice is created and marked sent.`}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          {total !== null && valid && (
            <span className="mr-auto text-[13px] text-[#64748d]">
              Invoice total <span className="font-medium text-[#061b31] tabular-nums">{formatMYR(total)}</span>
            </span>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-md text-[14px]">
            Cancel
          </Button>
          <Button type="submit" form="sell-package-form" disabled={!valid || saving} className="h-8 gap-1.5 rounded-md text-[14px]">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            Sell package
          </Button>
        </>
      }
    >
      <form id="sell-package-form" onSubmit={sell} className="space-y-4">
        <FormError message={error} />
        <div className="inline-flex rounded-md border border-[#e5edf5] p-0.5" role="radiogroup" aria-label="Package source">
          {(["template", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={m === "template" && templates?.length === 0}
              onClick={() => setMode(m)}
              className={`rounded-[4px] px-3 py-1 text-[13px] font-medium transition-colors disabled:opacity-50 ${
                mode === m ? "bg-[#F0EEFF] text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {m === "template" ? "From catalogue" : "Custom"}
            </button>
          ))}
        </div>

        {mode === "template" && (
          <div>
            {templates === null ? (
              <div className="flex items-center gap-2 text-[13px] text-[#64748d]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Loading packages…
              </div>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Package">
                {templates.map((t) => (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      t.id === templateId ? "border-[#533afd] bg-[#F7F5FF]" : "border-[#e5edf5] hover:bg-[#f6f9fc]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="package-template"
                      value={t.id}
                      checked={t.id === templateId}
                      onChange={() => setTemplateId(t.id)}
                      className="mt-1 accent-[#533afd]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-[#061b31]">{t.name}</span>
                        <span className="whitespace-nowrap tabular-nums text-[#061b31]">{formatMYR(t.price)}</span>
                      </span>
                      <span className="block text-[12px] text-[#64748d]">
                        {t.sessions} sessions · {t.validityDays ? `valid ${t.validityDays} days` : "no expiry"} ·{" "}
                        {treatmentTypesSummary(t.treatmentTypes, labelFor)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "custom" && (
          <>
            {templates?.length === 0 && (
              <p className="text-[13px] text-[#64748d]">This branch has no catalogue packages yet — enter the details.</p>
            )}
            <div>
              <label htmlFor="sell-name" className={LABEL_CLASS}>Name</label>
              <input id="sell-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="sell-sessions" className={LABEL_CLASS}>Sessions</label>
                <input id="sell-sessions" type="number" min={1} max={500} value={sessions} onChange={(e) => setSessions(e.target.value)} className={`${FIELD_CLASS} tabular-nums`} />
              </div>
              <div>
                <label htmlFor="sell-price" className={LABEL_CLASS}>Price (RM)</label>
                <input id="sell-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className={`${FIELD_CLASS} tabular-nums`} />
              </div>
              <div>
                <label htmlFor="sell-validity" className={LABEL_CLASS}>Valid (days)</label>
                <input id="sell-validity" type="number" min={1} max={3650} value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="No expiry" className={`${FIELD_CLASS} tabular-nums`} />
              </div>
            </div>
            <div>
              <span className={LABEL_CLASS}>Redeems for</span>
              <TreatmentTypePicker value={types} onChange={setTypes} />
              <p className="mt-1 text-[12px] text-[#64748d]">None selected = any treatment.</p>
            </div>
          </>
        )}

        <div>
          <label htmlFor="sell-notes" className={LABEL_CLASS}>Notes (optional)</label>
          <input id="sell-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={FIELD_CLASS} />
        </div>
      </form>
    </ModalShell>
  );
}

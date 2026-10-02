"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell, FIELD_CLASS, LABEL_CLASS, FormError } from "./ModalShell";
import { TreatmentTypePicker } from "./TreatmentTypePicker";
import { parseRinggit } from "@/lib/package-ui";
import type { PackageTemplateJson, TreatmentTypeValue } from "@/types/packages";

interface Props {
  open: boolean;
  branchId: string;
  /** Edit this template; null creates a new one. */
  template: PackageTemplateJson | null;
  onClose: () => void;
  onSaved: (template: PackageTemplateJson) => void;
}

interface FormState {
  name: string;
  description: string;
  sessions: string;
  price: string;
  validityDays: string;
  treatmentTypes: TreatmentTypeValue[];
  isActive: boolean;
}

function initialState(t: PackageTemplateJson | null): FormState {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    sessions: t ? String(t.sessions) : "",
    price: t ? String(t.price) : "",
    validityDays: t?.validityDays ? String(t.validityDays) : "",
    treatmentTypes: t?.treatmentTypes ?? [],
    isActive: t?.isActive ?? true,
  };
}

/** Create or edit a catalogue package (Branch → Settings → Packages). */
export function PackageTemplateDialog({ open, branchId, template, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(template));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initialState(template));
    setError(null);
  }, [open, template]);

  const sessions = Number.parseInt(form.sessions, 10);
  const price = parseRinggit(form.price);
  const validity = form.validityDays.trim() === "" ? null : Number.parseInt(form.validityDays, 10);
  const validityOk = validity === null || (Number.isInteger(validity) && validity >= 1 && validity <= 3650);
  const valid =
    form.name.trim().length > 0 &&
    Number.isInteger(sessions) &&
    sessions >= 1 &&
    sessions <= 500 &&
    price !== null &&
    validityOk;
  const perSession = valid && price !== null ? price / sessions : null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || price === null) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || (template ? null : undefined),
        sessions,
        price,
        validityDays: validity ?? (template ? null : undefined),
        treatmentTypes: form.treatmentTypes,
        isActive: form.isActive,
      };
      const res = await fetch(
        template ? `/api/branches/${branchId}/packages/${template.id}` : `/api/branches/${branchId}/packages`,
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { template?: PackageTemplateJson; message?: string };
      if (!res.ok || !data.template) {
        setError(data.message ?? "Couldn't save the package.");
        return;
      }
      onSaved(data.template);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title={template ? "Edit package" : "New package"}
      description="Prepaid sessions patients can buy. Changes don't affect packages already sold."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-md text-[14px]">
            Cancel
          </Button>
          <Button type="submit" form="package-template-form" disabled={!valid || saving} className="h-8 gap-1.5 rounded-md text-[14px]">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {template ? "Save changes" : "Create package"}
          </Button>
        </>
      }
    >
      <form id="package-template-form" onSubmit={save} className="space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="pkg-name" className={LABEL_CLASS}>Name</label>
          <input
            id="pkg-name"
            value={form.name}
            maxLength={120}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. 12 Adjustments"
            className={FIELD_CLASS}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="pkg-sessions" className={LABEL_CLASS}>Sessions</label>
            <input
              id="pkg-sessions"
              type="number"
              min={1}
              max={500}
              value={form.sessions}
              onChange={(e) => set("sessions", e.target.value)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="pkg-price" className={LABEL_CLASS}>Price (RM)</label>
            <input
              id="pkg-price"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0.00"
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="pkg-validity" className={LABEL_CLASS}>Valid (days)</label>
            <input
              id="pkg-validity"
              type="number"
              min={1}
              max={3650}
              value={form.validityDays}
              onChange={(e) => set("validityDays", e.target.value)}
              placeholder="No expiry"
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </div>
        </div>
        {perSession !== null && (
          <p className="-mt-2 text-[12px] text-fg-secondary tabular-nums">RM {perSession.toFixed(2)} per session</p>
        )}
        <div>
          <span className={LABEL_CLASS}>Redeems for</span>
          <TreatmentTypePicker value={form.treatmentTypes} onChange={(v) => set("treatmentTypes", v)} />
          <p className="mt-1 text-[12px] text-fg-secondary">None selected = any treatment uses a session.</p>
        </div>
        <div>
          <label htmlFor="pkg-description" className={LABEL_CLASS}>Description (optional)</label>
          <textarea
            id="pkg-description"
            value={form.description}
            maxLength={500}
            rows={2}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-[14px] text-foreground focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        {template && (
          <label className="flex items-center gap-2 text-[14px] text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            On sale
          </label>
        )}
      </form>
    </ModalShell>
  );
}

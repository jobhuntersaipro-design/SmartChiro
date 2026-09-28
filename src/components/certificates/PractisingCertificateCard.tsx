"use client";

import { useState } from "react";
import { BadgeCheck, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { DoctorDetail } from "@/types/doctor";
import { DateInput } from "@/components/ui/date-input";
import { formatDateInput } from "@/lib/date-input";
import { CERTIFICATE_FIELD_MAX, STAGE_LABEL, STAGE_TONE, certificateStage, daysUntilExpiry, describeExpiry } from "@/lib/certificates";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/invoices/form-styles";

interface PractisingCertificateCardProps {
  doctor: DoctorDetail;
  /** OWNER / ADMIN of a shared branch, or the doctor themself (the API enforces it). */
  canEdit: boolean;
  onSaved: (doctor: DoctorDetail) => void;
}

interface FormState {
  tcmRegistrationNo: string;
  apcNumber: string;
  apcExpiresAt: string;
}

const toForm = (d: DoctorDetail): FormState => ({
  tcmRegistrationNo: d.profile?.tcmRegistrationNo ?? "",
  apcNumber: d.profile?.apcNumber ?? "",
  apcExpiresAt: d.profile?.apcExpiresOn ?? "",
});

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#64748d]">{label}</p>
      <p className="truncate text-[14px] text-[#061b31]">{value || <span className="text-[#a3acb9]">Not recorded</span>}</p>
    </div>
  );
}

/**
 * T&CM registration and Annual Practising Certificate on the doctor page
 * (T&CM Act 2016). Shows the expiry with its alert stage; OWNER / ADMIN and
 * the doctor edit it.
 */
export function PractisingCertificateCard({ doctor, canEdit, onSaved }: PractisingCertificateCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(doctor));
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const expiresOn = doctor.profile?.apcExpiresOn ?? null;
  const stage = expiresOn ? certificateStage(expiresOn) : null;

  async function save() {
    if (dateError) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doctors/${doctor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tcmRegistrationNo: form.tcmRegistrationNo,
          apcNumber: form.apcNumber,
          apcExpiresAt: form.apcExpiresAt || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't save the certificate.");
      onSaved({ ...doctor, profile: body.doctor.profile });
      setForm(toForm({ ...doctor, profile: body.doctor.profile }));
      setEditing(false);
      toast.success("Practising certificate saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the certificate.");
    } finally {
      setSaving(false);
    }
  }

  const text = (key: "tcmRegistrationNo" | "apcNumber", label: string, placeholder: string) => (
    <div>
      <label htmlFor={`cert-${key}`} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={`cert-${key}`}
        value={form[key]}
        maxLength={CERTIFICATE_FIELD_MAX}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={FIELD_INPUT}
      />
    </div>
  );

  return (
    <section aria-labelledby="cert-heading" className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#e5edf5] pb-2">
        <h3 id="cert-heading" className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-[#273951]">
          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
          Practising certificate
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setForm(toForm(doctor));
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[13px] text-[#533afd] hover:bg-[#f0eeff] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF]"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.75} />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {text("tcmRegistrationNo", "T&CM registration no.", "e.g. T&CM/CHI/00123")}
            {text("apcNumber", "APC no.", "e.g. APC-2026-00456")}
            <div>
              <label htmlFor="cert-apcExpiresAt" className={FIELD_LABEL}>
                APC expiry date
              </label>
              <DateInput
                id="cert-apcExpiresAt"
                value={form.apcExpiresAt}
                onChange={(iso) => setForm((f) => ({ ...f, apcExpiresAt: iso }))}
                onErrorChange={setDateError}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={saving || !!dateError}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
              Save certificate
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="T&CM registration no." value={doctor.profile?.tcmRegistrationNo ?? null} />
          <Field label="APC no." value={doctor.profile?.apcNumber ?? null} />
          <div className="min-w-0">
            <p className="text-[12px] text-[#64748d]">APC expiry</p>
            {expiresOn && stage ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] tabular-nums text-[#061b31]">{formatDateInput(expiresOn)}</span>
                <span className={cn("rounded-full border px-2 py-px text-[12px] whitespace-nowrap", STAGE_TONE[stage])}>
                  {stage === "ok" ? STAGE_LABEL.ok : describeExpiry(daysUntilExpiry(expiresOn))}
                </span>
              </div>
            ) : (
              <p className="text-[14px] text-[#a3acb9]">Not recorded</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

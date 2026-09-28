"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { OutreachLogList } from "@/components/outreach/OutreachLogList";
import { renderTemplateText, WA_TEMPLATES } from "@/lib/whatsapp/template-text";
import type { OutreachLogItem, OutreachSettingsData } from "@/types/outreach";

interface OutreachSettingsCardProps {
  branchId: string;
  canEdit: boolean;
  branch?: { name: string; phone?: string | null };
}

type NumberKey = "recallAfterDays" | "recallCooldownDays" | "recallDailyLimit" | "reviewDelayHours" | "reviewCooldownDays";
type Form = Omit<OutreachSettingsData, NumberKey | "googleReviewUrl"> & Record<NumberKey, string> & { googleReviewUrl: string };

const inputClass =
  "h-8 rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-2.5 text-[14px] text-[#0A2540] focus:outline-none focus:ring-1 focus:ring-[#635BFF] disabled:opacity-60";

function toForm(s: OutreachSettingsData): Form {
  return {
    ...s,
    recallAfterDays: String(s.recallAfterDays),
    recallCooldownDays: String(s.recallCooldownDays),
    recallDailyLimit: String(s.recallDailyLimit),
    reviewDelayHours: String(s.reviewDelayHours),
    reviewCooldownDays: String(s.reviewCooldownDays),
    googleReviewUrl: s.googleReviewUrl ?? "",
  };
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  disabled,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[14px] text-[#425466]">
      <span className="min-w-0">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        <input
          type="number"
          min={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} w-20`}
        />
        <span className="w-14">{suffix}</span>
      </span>
    </label>
  );
}

/** Recall + review request settings and the branch outreach log (Reminders section of branch settings). */
export function OutreachSettingsCard({ branchId, canEdit, branch }: OutreachSettingsCardProps) {
  const [form, setForm] = useState<Form | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<OutreachLogItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/branches/${branchId}/outreach-settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { settings: OutreachSettingsData }) => setForm(toForm(j.settings)))
      .catch(() => setHidden(true));
  }, [branchId]);

  const loadLog = useCallback(async () => {
    const r = await fetch(`/api/branches/${branchId}/outreach?limit=100`);
    setLog(r.ok ? ((await r.json()).items as OutreachLogItem[]) : []);
  }, [branchId]);

  useEffect(() => {
    if (logOpen && log === null) loadLog();
  }, [logOpen, log, loadLog]);

  if (hidden) return null;
  if (!form) return <div className="p-6 text-[#697386]">Loading recall &amp; review settings…</div>;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const disabled = !canEdit || saving;

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const body: OutreachSettingsData = {
        recallEnabled: form.recallEnabled,
        recallAfterDays: Number(form.recallAfterDays),
        recallCooldownDays: Number(form.recallCooldownDays),
        recallDailyLimit: Number(form.recallDailyLimit),
        reviewEnabled: form.reviewEnabled,
        reviewDelayHours: Number(form.reviewDelayHours),
        reviewCooldownDays: Number(form.reviewCooldownDays),
        googleReviewUrl: form.googleReviewUrl.trim() || null,
      };
      const r = await fetch(`/api/branches/${branchId}/outreach-settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Couldn't save recall & review settings");
        return;
      }
      setForm(toForm(j.settings));
      toast.success("Recall & review settings saved");
    } finally {
      setSaving(false);
    }
  }

  const branchName = branch?.name ?? WA_TEMPLATES.recall.sample[1];
  const recallPreview = renderTemplateText("recall", "en", [
    WA_TEMPLATES.recall.sample[0],
    branchName,
    branch?.phone || WA_TEMPLATES.recall.sample[2],
  ]);
  const reviewPreview = renderTemplateText("review", "en", [
    WA_TEMPLATES.review.sample[0],
    branchName,
    form.googleReviewUrl.trim() || WA_TEMPLATES.review.sample[2],
  ]);

  return (
    <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4">
        <div className="text-[18px] font-medium text-[#0A2540]">Recall &amp; Review Requests</div>
        <div className="text-[14px] text-[#697386]">
          Win back lapsed patients and ask for Google reviews — WhatsApp first, email as fallback. Only patients who gave marketing consent are contacted.
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2.5">
          <label className="flex items-center gap-2 text-[15px] font-medium text-[#0A2540]">
            <input type="checkbox" checked={form.recallEnabled} disabled={disabled} onChange={(e) => set("recallEnabled", e.target.checked)} />
            Recall lapsed patients
          </label>
          <NumberField label="Recall after last visit" suffix="days" value={form.recallAfterDays} disabled={disabled} onChange={(v) => set("recallAfterDays", v)} />
          <NumberField label="Don't recall again for" suffix="days" value={form.recallCooldownDays} disabled={disabled} onChange={(v) => set("recallCooldownDays", v)} />
          <NumberField label="At most per day" suffix="patients" value={form.recallDailyLimit} disabled={disabled} onChange={(v) => set("recallDailyLimit", v)} />
          <p className="rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] p-3 text-[14px] leading-relaxed text-[#425466]">{recallPreview}</p>
        </section>

        <section className="space-y-2.5">
          <label className="flex items-center gap-2 text-[15px] font-medium text-[#0A2540]">
            <input type="checkbox" checked={form.reviewEnabled} disabled={disabled} onChange={(e) => set("reviewEnabled", e.target.checked)} />
            Ask for a Google review after a visit
          </label>
          <NumberField label="Send after a completed visit" suffix="hours" value={form.reviewDelayHours} disabled={disabled} onChange={(v) => set("reviewDelayHours", v)} />
          <NumberField label="Ask each patient at most every" suffix="days" value={form.reviewCooldownDays} disabled={disabled} onChange={(v) => set("reviewCooldownDays", v)} />
          <label className="flex flex-col gap-1 text-[14px] text-[#425466]">
            Google review link
            <input
              type="url"
              value={form.googleReviewUrl}
              disabled={disabled}
              placeholder="https://g.page/r/…/review"
              onChange={(e) => set("googleReviewUrl", e.target.value)}
              className={`${inputClass} w-full`}
            />
          </label>
          <p className="rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] p-3 text-[14px] leading-relaxed text-[#425466]">{reviewPreview}</p>
        </section>
      </div>
      <p className="mt-3 text-[13px] text-[#697386]">
        Messages go out between 9 am and 8 pm clinic time, in the patient&apos;s language (English, Bahasa Melayu or 中文). Patients can reply STOP to opt out.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E3E8EE] pt-4">
        <button
          type="button"
          onClick={() => setLogOpen((o) => !o)}
          aria-expanded={logOpen}
          className="inline-flex items-center gap-1 text-[14px] font-medium text-[#635BFF] hover:underline"
        >
          {logOpen ? <ChevronDown className="h-4 w-4" strokeWidth={1.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={1.5} />}
          Outreach log (last 100)
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#635BFF] px-4 py-2 text-[14px] text-white hover:bg-[#5851EB] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
            Save recall &amp; review settings
          </button>
        )}
      </div>
      {logOpen && (
        <div className="mt-3">
          {log === null ? (
            <div className="h-12 animate-pulse rounded bg-[#F6F9FC]" />
          ) : (
            <OutreachLogList items={log} showPatient emptyText="No recall or review messages yet." />
          )}
        </div>
      )}
    </div>
  );
}

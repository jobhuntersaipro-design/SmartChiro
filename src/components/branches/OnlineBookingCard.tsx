"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Globe, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import type { TreatmentType } from "@prisma/client";
import { Textarea } from "@/components/ui/textarea";
import { TREATMENT_LABELS, TREATMENT_OPTIONS, defaultDurationFor } from "@/lib/treatment-colors";
import { BOOKING_LIMITS, bookingUrl, isValidSlug, whatsAppShareUrl } from "@/lib/booking/config";
import type { BranchBookingSettings, BranchBookingSettingsResponse } from "@/types/booking";

interface Props {
  branchId: string;
}

const LEAD_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
];

const HORIZON_OPTIONS = [7, 14, 30, 60, 90, 180];

const ERROR_MESSAGES: Record<string, string> = {
  slug_taken: "That link is already used by another clinic. Try another.",
  invalid_slug: "Use 3–40 lowercase letters, numbers and single hyphens.",
  slug_required: "Choose a link before turning online booking on.",
  doctor_not_in_branch: "One of the chosen doctors no longer works at this branch.",
  validation: "Check the settings — pick at least one treatment.",
};

/** Branch Settings → Online booking (OWNER / ADMIN). */
export function OnlineBookingCard({ branchId }: Props) {
  const [data, setData] = useState<BranchBookingSettingsResponse | null>(null);
  const [form, setForm] = useState<BranchBookingSettings | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const ids = useId();

  useEffect(() => {
    let cancelled = false;
    setOrigin(window.location.origin);
    fetch(`/api/branches/${branchId}/booking`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setForbidden(true);
          return;
        }
        const body = (await r.json()) as BranchBookingSettingsResponse;
        setData(body);
        setForm({ ...body.settings, slug: body.settings.slug || body.suggestedSlug });
      })
      .catch(() => !cancelled && setForbidden(true));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (forbidden) return null;
  if (!data || !form) {
    return (
      <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 text-[14px] text-[#697386]">
        Loading online booking…
      </div>
    );
  }

  const set = <K extends keyof BranchBookingSettings>(key: K, value: BranchBookingSettings[K]) =>
    setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const slugValid = isValidSlug(form.slug);
  const url = bookingUrl(origin, form.slug);
  const savedLive = data.settings.enabled && data.settings.slug === form.slug && slugValid;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  async function save() {
    if (!form) return;
    if (!slugValid) {
      toast.error(ERROR_MESSAGES.invalid_slug);
      return;
    }
    if (form.treatments.length === 0) {
      toast.error("Pick at least one treatment patients can book.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/booking`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(ERROR_MESSAGES[body.error as string] ?? "Couldn't save online booking settings.");
        return;
      }
      const next = body as BranchBookingSettingsResponse;
      setData(next);
      setForm({ ...next.settings, slug: next.settings.slug || next.suggestedSlug });
      toast.success(next.settings.enabled ? "Online booking is live." : "Online booking settings saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 id={`${ids}-title`} className="flex items-center gap-2 text-[18px] font-medium text-[#0A2540]">
            <Globe className="h-4 w-4 text-[#635BFF]" strokeWidth={1.5} aria-hidden="true" />
            Online booking
          </h3>
          <p className="mt-0.5 text-[14px] text-[#697386]">
            A public link where patients pick a treatment, doctor and time — no login needed.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.enabled}
          aria-label="Online booking"
          onClick={() => set("enabled", !form.enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#635BFF] ${
            form.enabled ? "bg-[#635BFF]" : "bg-[#C1C9D2]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              form.enabled ? "translate-x-5.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {!data.hasHours && (
        <div className="mb-5 flex items-start gap-2 rounded-[6px] border border-[#F5A623]/30 bg-[#FFF8E6] px-3 py-2.5 text-[14px] text-[#8A5A00]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Set the branch opening hours (or doctors&apos; working schedules) — without them the page has no times to offer.
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor={`${ids}-slug`} className="mb-1 block text-[14px] font-medium text-[#425466]">
            Booking link
          </label>
          <div className="flex items-stretch overflow-hidden rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] focus-within:border-[#635BFF] focus-within:ring-1 focus-within:ring-[#635BFF]">
            <span className="hidden items-center border-r border-[#E3E8EE] px-2.5 text-[14px] text-[#697386] sm:flex">
              {origin.replace(/^https?:\/\//, "")}/book/
            </span>
            <input
              id={`${ids}-slug`}
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={40}
              aria-invalid={!slugValid}
              aria-describedby={`${ids}-slug-hint`}
              className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-[15px] text-[#0A2540] outline-none"
            />
          </div>
          <p id={`${ids}-slug-hint`} className={`mt-1 text-[13px] ${slugValid ? "text-[#697386]" : "text-[#DF1B41]"}`}>
            {slugValid ? "Lowercase letters, numbers and hyphens." : ERROR_MESSAGES.invalid_slug}
          </p>

          {slugValid && (
            <div className="mt-3 rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] p-3">
              <p className="break-all text-[14px] font-medium text-[#0A2540]">{url}</p>
              <p className="mt-0.5 text-[13px] text-[#697386]">
                {savedLive ? "Live — patients can book now." : "Save with booking turned on to make this link live."}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#E3E8EE] bg-white px-3 text-[14px] font-medium text-[#0A2540] hover:bg-[#F0F3F7]"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#30B130]" /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  href={whatsAppShareUrl(data.branchName, url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#E3E8EE] bg-white px-3 text-[14px] font-medium text-[#0A2540] hover:bg-[#F0F3F7]"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-[#1FA855]" strokeWidth={1.5} />
                  Share on WhatsApp
                </a>
                {savedLive && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2 text-[14px] font-medium text-[#635BFF] hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Open page
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[14px] font-medium text-[#425466]">Treatments patients can book</legend>
          <div className="flex flex-wrap gap-2">
            {TREATMENT_OPTIONS.map((t: TreatmentType) => {
              const on = form.treatments.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("treatments", toggleIn(form.treatments, t))}
                  className={`h-8 rounded-[4px] border px-2.5 text-[14px] transition-colors ${
                    on
                      ? "border-[#635BFF] bg-[#F0EEFF] font-medium text-[#635BFF]"
                      : "border-[#E3E8EE] bg-white text-[#425466] hover:bg-[#F0F3F7]"
                  }`}
                >
                  {TREATMENT_LABELS[t]} <span className="text-[13px] opacity-70">· {defaultDurationFor(t)} min</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[14px] font-medium text-[#425466]">Doctors patients can book</legend>
          {data.clinicians.length === 0 ? (
            <p className="text-[14px] text-[#697386]">No doctors work at this branch yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {data.clinicians.map((c) => {
                  const on = form.doctorIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("doctorIds", toggleIn(form.doctorIds, c.id))}
                      className={`h-8 rounded-[4px] border px-2.5 text-[14px] transition-colors ${
                        on
                          ? "border-[#635BFF] bg-[#F0EEFF] font-medium text-[#635BFF]"
                          : "border-[#E3E8EE] bg-white text-[#425466] hover:bg-[#F0F3F7]"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[13px] text-[#697386]">
                {form.doctorIds.length === 0 ? "None picked — every doctor at this branch can be booked." : `${form.doctorIds.length} picked.`}
              </p>
            </>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            id={`${ids}-lead`}
            label="Minimum notice"
            value={form.leadMinutes}
            onChange={(v) => set("leadMinutes", v)}
            options={LEAD_OPTIONS}
          />
          <SelectField
            id={`${ids}-horizon`}
            label="Book up to"
            value={form.horizonDays}
            onChange={(v) => set("horizonDays", v)}
            options={HORIZON_OPTIONS.map((d) => ({ value: d, label: `${d} days ahead` }))}
          />
          <SelectField
            id={`${ids}-step`}
            label="Start times every"
            value={form.slotMinutes}
            onChange={(v) => set("slotMinutes", v)}
            options={BOOKING_LIMITS.slotMinutes.map((m) => ({ value: m, label: `${m} minutes` }))}
          />
        </div>

        <div>
          <label htmlFor={`${ids}-note`} className="mb-1 block text-[14px] font-medium text-[#425466]">
            Note shown to patients <span className="font-normal text-[#697386]">(optional)</span>
          </label>
          <Textarea
            id={`${ids}-note`}
            value={form.note}
            maxLength={BOOKING_LIMITS.noteMax}
            onChange={(e) => set("note", e.target.value)}
            placeholder="e.g. Please arrive 10 minutes early and bring any X-rays or reports."
            className="min-h-20 rounded-[4px] border-[#E3E8EE] bg-[#F6F9FC] text-[15px]"
          />
          <p className="mt-1 text-right text-[13px] text-[#697386]">
            {form.note.length}/{BOOKING_LIMITS.noteMax}
          </p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-[4px] bg-[#635BFF] px-4 text-[14px] font-medium text-white hover:bg-[#5851EB] disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save online booking"}
        </button>
      </div>
    </section>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string }[];
}) {
  const known = options.some((o) => o.value === value);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[14px] font-medium text-[#425466]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-2 text-[15px] text-[#0A2540] outline-none focus:border-[#635BFF] focus:ring-1 focus:ring-[#635BFF]"
      >
        {!known && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

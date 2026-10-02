"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { BookingRequestSchema } from "@/lib/booking/schema";
import { InlineAlert } from "./BookingParts";

export interface DetailsValues {
  name: string;
  phone: string;
  email: string;
  icNumber: string;
  notes: string;
  consentData: boolean;
  consentMarketing: boolean;
  website: string;
}

export const EMPTY_DETAILS: DetailsValues = {
  name: "",
  phone: "",
  email: "",
  icNumber: "",
  notes: "",
  consentData: false,
  consentMarketing: false,
  website: "",
};

type FieldErrors = Partial<Record<keyof DetailsValues, string>>;

interface Props {
  branchName: string;
  values: DetailsValues;
  onChange: (values: DetailsValues) => void;
  submitting: boolean;
  error: string | null;
  /** Fields the parent already chose (treatment, doctor, time) — merged for validation. */
  base: { treatment: string; doctorId: string; dateTime: string };
  onSubmit: () => void;
}

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface-muted px-3 text-[16px] text-foreground outline-none placeholder:text-fg-disabled focus:border-brand focus:ring-1 focus:ring-brand aria-invalid:border-danger";

/** Patient details + consent. Validates with the same schema as the API. */
export function BookingDetailsForm({ branchName, values, onChange, submitting, error, base, onSubmit }: Props) {
  const id = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = <K extends keyof DetailsValues>(key: K, v: DetailsValues[K]) => onChange({ ...values, [key]: v });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = BookingRequestSchema.safeParse({ ...base, ...values });
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const next: FieldErrors = {};
      for (const key of Object.keys(EMPTY_DETAILS) as (keyof DetailsValues)[]) {
        if (fe[key]?.[0]) next[key] = fe[key]![0];
      }
      if (next.consentData) next.consentData = "Please agree so the clinic can process your booking.";
      setErrors(next);
      const firstKey = Object.keys(next)[0];
      if (firstKey) document.getElementById(`${id}-${firstKey}`)?.focus();
      return;
    }
    setErrors({});
    onSubmit();
  }

  const field = (key: keyof DetailsValues) => ({
    id: `${id}-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-${key}-err` : undefined,
  });
  const fieldError = (key: keyof DetailsValues) =>
    errors[key] ? (
      <p id={`${id}-${key}-err`} className="mt-1 text-[13px] text-danger">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <InlineAlert>{error}</InlineAlert>}

      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-[14px] font-medium text-fg-secondary">
          Full name
        </label>
        <input {...field("name")} value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" className={inputClass} />
        {fieldError("name")}
      </div>

      <div>
        <label htmlFor={`${id}-phone`} className="mb-1 block text-[14px] font-medium text-fg-secondary">
          Mobile number
        </label>
        <input
          {...field("phone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="012-345 6789"
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-[13px] text-fg-muted">For your appointment confirmation and reminders.</p>
        {fieldError("phone")}
      </div>

      <div>
        <label htmlFor={`${id}-email`} className="mb-1 block text-[14px] font-medium text-fg-secondary">
          Email <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <input
          {...field("email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          className={inputClass}
        />
        {fieldError("email")}
      </div>

      <div>
        <label htmlFor={`${id}-icNumber`} className="mb-1 block text-[14px] font-medium text-fg-secondary">
          IC or passport number <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <input
          {...field("icNumber")}
          autoComplete="off"
          placeholder="900101-14-5678"
          value={values.icNumber}
          onChange={(e) => set("icNumber", e.target.value)}
          className={inputClass}
        />
        {fieldError("icNumber")}
      </div>

      <div>
        <label htmlFor={`${id}-notes`} className="mb-1 block text-[14px] font-medium text-fg-secondary">
          Anything the clinic should know? <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <textarea
          {...field("notes")}
          rows={3}
          maxLength={500}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="e.g. lower back pain for two weeks"
          className="w-full rounded-control border border-border bg-surface-muted px-3 py-2 text-[16px] text-foreground outline-none placeholder:text-fg-disabled focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {fieldError("notes")}
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill every field. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      <div className="space-y-3 rounded-panel border border-border bg-surface-muted p-3">
        <div>
          <label htmlFor={`${id}-consentData`} className="flex items-start gap-2.5 text-[14px] text-fg-secondary">
            <input
              {...field("consentData")}
              type="checkbox"
              checked={values.consentData}
              onChange={(e) => set("consentData", e.target.checked)}
              className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand"
            />
            <span>
              I agree that {branchName} may process my personal data to manage this booking and my care, under the
              Personal Data Protection Act 2010. <span className="text-danger">*</span>
            </span>
          </label>
          {fieldError("consentData")}
        </div>
        <label htmlFor={`${id}-consentMarketing`} className="flex items-start gap-2.5 text-[14px] text-fg-secondary">
          <input
            id={`${id}-consentMarketing`}
            type="checkbox"
            checked={values.consentMarketing}
            onChange={(e) => set("consentMarketing", e.target.checked)}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand"
          />
          <span>Send me occasional health tips and offers. You can stop these at any time. (Optional)</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-primary text-[16px] font-medium text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitting ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}

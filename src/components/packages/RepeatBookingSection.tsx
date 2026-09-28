"use client";

import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { RepeatBookingFields } from "./RepeatBookingFields";
import { SeriesPreviewList } from "./SeriesPreviewList";
import type { SeriesPreview } from "./useSeriesPreview";
import { packageCoversTreatment, weekdayOfDateKey, type RepeatFormState } from "@/lib/package-ui";
import type { PatientPackageJson } from "@/types/packages";

interface Props {
  value: RepeatFormState;
  onChange: (value: RepeatFormState) => void;
  /** Chosen first date "YYYY-MM-DD" (sets the default weekday when repeat is switched on). */
  date: string;
  /** Validation message for an incomplete rule. */
  ruleError: string | null;
  preview: SeriesPreview | null;
  previewLoading: boolean;
  previewError: string | null;
  skipProblemDates: boolean;
  onSkipChange: (skip: boolean) => void;
  patientId: string | null;
  treatmentType: string;
  packageId: string;
  onPackageChange: (id: string) => void;
}

/** "Repeat" block of the booking dialog: off / weekly, live preview, optional package link. */
export function RepeatBookingSection({
  value,
  onChange,
  date,
  ruleError,
  preview,
  previewLoading,
  previewError,
  skipProblemDates,
  onSkipChange,
  patientId,
  treatmentType,
  packageId,
  onPackageChange,
}: Props) {
  const packages = useActivePackages(value.enabled ? patientId : null);
  const eligible = packages.filter((p) => packageCoversTreatment(p.treatmentTypes, treatmentType || null));

  function setEnabled(enabled: boolean) {
    const day = weekdayOfDateKey(date);
    onChange({ ...value, enabled, weekdays: enabled && day !== null ? [day] : value.weekdays });
  }

  return (
    <div className="mb-3 rounded-md border border-[#e5edf5] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#273951]">
          <Repeat className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.75} /> Repeat
        </span>
        <div className="inline-flex rounded-md border border-[#e5edf5] p-0.5" role="radiogroup" aria-label="Repeat">
          {[
            { on: false, label: "Off" },
            { on: true, label: "Weekly" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={value.enabled === o.on}
              onClick={() => value.enabled !== o.on && setEnabled(o.on)}
              className={`rounded-[4px] px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
                value.enabled === o.on ? "bg-[#F0EEFF] text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {value.enabled && (
        <div className="mt-3 space-y-3">
          <RepeatBookingFields value={value} onChange={onChange} startDate={date} idPrefix="create-appointment-repeat" />
          {eligible.length > 0 && (
            <div>
              <label htmlFor="create-appointment-package" className="mb-1 block text-[12px] font-medium text-[#425466]">
                Pay with package (optional)
              </label>
              <select
                id="create-appointment-package"
                value={packageId}
                onChange={(e) => onPackageChange(e.target.value)}
                className="h-9 w-full rounded-md border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              >
                <option value="">Any matching package (automatic)</option>
                {eligible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sessionsLeft} of {p.sessionsTotal} left
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#697386]">Completing each visit uses a session from this package first.</p>
            </div>
          )}
          {ruleError ? (
            <p className="text-[13px] text-[#9b6829]">{ruleError}</p>
          ) : (
            <SeriesPreviewList
              preview={preview}
              loading={previewLoading}
              error={previewError}
              skipProblemDates={skipProblemDates}
              onSkipChange={onSkipChange}
              idPrefix="create-appointment-repeat"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The patient's active packages (empty when the caller may not view them). */
function useActivePackages(patientId: string | null): PatientPackageJson[] {
  const [state, setState] = useState<{ patientId: string; packages: PatientPackageJson[] } | null>(null);
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}/packages`);
        const data = res.ok ? ((await res.json()) as { packages: PatientPackageJson[] }) : { packages: [] };
        if (!cancelled) setState({ patientId, packages: data.packages.filter((p) => p.effectiveStatus === "ACTIVE") });
      } catch {
        if (!cancelled) setState({ patientId, packages: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);
  return state && state.patientId === patientId ? state.packages : [];
}

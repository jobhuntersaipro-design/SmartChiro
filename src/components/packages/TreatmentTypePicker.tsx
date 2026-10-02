"use client";

import { Check } from "lucide-react";
import { TREATMENT_OPTIONS, treatmentLabelFor } from "@/lib/treatment-colors";
import type { TreatmentTypeValue } from "@/types/packages";

interface Props {
  value: TreatmentTypeValue[];
  onChange: (value: TreatmentTypeValue[]) => void;
  disabled?: boolean;
}

/** Toggle chips for the treatment types a package covers. */
export function TreatmentTypePicker({ value, onChange, disabled }: Props) {
  function toggle(t: TreatmentTypeValue) {
    onChange(value.includes(t) ? value.filter((v) => v !== t) : [...value, t]);
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Treatment types">
      {TREATMENT_OPTIONS.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(t)}
            className={`inline-flex items-center gap-1 rounded-control border px-2 py-1 text-[12px] font-medium transition-colors disabled:opacity-60 ${
              on
                ? "border-brand bg-brand-subtle text-brand"
                : "border-border bg-white text-fg-secondary hover:bg-surface-muted"
            }`}
          >
            {on && <Check className="h-3 w-3" strokeWidth={2} />}
            {treatmentLabelFor(t)}
          </button>
        );
      })}
    </div>
  );
}

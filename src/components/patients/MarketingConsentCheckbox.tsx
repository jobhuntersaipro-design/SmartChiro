"use client";

import { CONSENT_HINT, CONSENT_LABEL } from "@/lib/outreach/consent";

interface MarketingConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** PDPA marketing consent for recall and review messages (add / edit patient, profile). */
export function MarketingConsentCheckbox({ checked, onChange, disabled }: MarketingConsentCheckboxProps) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#533afd]"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[#273951]">{CONSENT_LABEL}</span>
        <span className="block text-[13px] text-[#64748d]">{CONSENT_HINT}</span>
      </span>
    </label>
  );
}

"use client";

import { useState } from "react";
import { ALLOWED_PLACEHOLDERS } from "@/lib/reminders/placeholders";
import { renderTemplate, validateTemplate } from "@/lib/reminders/templates";
import type { TemplateContext } from "@/types/reminder";

const SAMPLE: TemplateContext = {
  patientName: "Ahmad Bin Ali",
  firstName: "Ahmad",
  lastName: "Bin Ali",
  date: "29 April 2026",
  time: "14:30",
  dayOfWeek: "Wednesday",
  doctorName: "Dr Lee",
  branchName: "SmartChiro KL",
  branchAddress: "1 Jalan Sentral, KL",
  branchPhone: "+60312345678",
};

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  charLimit?: number;
};

export function ReminderTemplateEditor({ label, value, onChange, charLimit }: Props) {
  const [, setFocused] = useState(false);
  const v = validateTemplate(value);
  const preview = v.ok ? renderTemplate(value, SAMPLE) : "";

  function insert(token: string) {
    onChange(value + `{${token}}`);
  }

  return (
    <div className="space-y-2">
      <label className="text-[15px] font-medium text-[#0A2540]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={6}
        className="w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 py-2 text-[15px] focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
      />
      <div className="flex flex-wrap gap-1">
        {ALLOWED_PLACEHOLDERS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => insert(name)}
            className="rounded-[4px] border border-[#E3E8EE] bg-white px-2 py-1 text-[13px] text-[#425466] hover:bg-[#F0F3F7]"
          >
            {`{${name}}`}
          </button>
        ))}
      </div>
      {charLimit && (
        <div
          className={`text-[13px] ${
            value.length > charLimit ? "text-[#DF1B41]" : "text-[#697386]"
          }`}
        >
          {value.length} / {charLimit} chars
        </div>
      )}
      {!v.ok && <div className="text-[13px] text-[#DF1B41]">Error: {v.message}</div>}
      <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-3 text-[14px] text-[#0A2540] whitespace-pre-wrap">
        <div className="mb-1 text-[12px] uppercase tracking-wide text-[#697386]">
          Preview
        </div>
        {v.ok ? preview : <span className="text-[#697386]">— invalid template —</span>}
      </div>
    </div>
  );
}

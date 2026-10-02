"use client";

import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { MAX_RANGE_DAYS, RANGE_PRESETS, detectPreset, keyToDayNumber, presetRange, type DayRange } from "@/lib/reports/range";

interface RangePickerProps {
  value: DayRange;
  onChange: (range: DayRange) => void;
}

const chip = (active: boolean) =>
  cn(
    "h-8 rounded-control border px-3 text-[14px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
    active ? "border-brand bg-brand-subtle text-brand" : "border-border bg-white text-fg-secondary hover:bg-surface-muted",
  );

/** Preset ranges plus a custom from–to (dd/mm/yyyy), all in clinic days. */
export function RangePicker({ value, onChange }: RangePickerProps) {
  const preset = detectPreset(value);
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  const fromN = keyToDayNumber(from);
  const toN = keyToDayNumber(to);
  const problem =
    fromN === null || toN === null
      ? "Enter both dates."
      : fromN > toN
        ? "The start date is after the end date."
        : toN - fromN + 1 > MAX_RANGE_DAYS
          ? `Pick at most ${MAX_RANGE_DAYS} days.`
          : null;

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={!customOpen && preset === p.id}
            onClick={() => {
              setCustomOpen(false);
              onChange(presetRange(p.id));
            }}
            className={chip(!customOpen && preset === p.id)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={customOpen || preset === "custom"}
          aria-expanded={customOpen}
          onClick={() => {
            setFrom(value.from);
            setTo(value.to);
            setCustomOpen(true);
          }}
          className={chip(customOpen || preset === "custom")}
        >
          Custom
        </button>
      </div>
      {customOpen && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onChange({ from, to });
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] text-fg-secondary">
            From
            <DateInput value={from} onChange={setFrom} className="w-40" aria-label="From date" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-fg-secondary">
            To
            <DateInput value={to} onChange={setTo} min={from || undefined} className="w-40" aria-label="To date" />
          </label>
          <button
            type="submit"
            disabled={!!problem}
            className="h-9 rounded-control bg-primary px-3 text-[14px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Apply
          </button>
          {problem && from && to && <p className="basis-full text-[13px] text-danger">{problem}</p>}
        </form>
      )}
    </div>
  );
}

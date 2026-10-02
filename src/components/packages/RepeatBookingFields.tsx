"use client";

import { DateInput } from "@/components/ui/date-input";
import {
  MAX_REPEAT_VISITS,
  WEEKDAY_PICKER_ORDER,
  WEEKDAY_SHORT,
  toggleWeekday,
  type RepeatFormState,
} from "@/lib/package-ui";

interface Props {
  value: RepeatFormState;
  onChange: (value: RepeatFormState) => void;
  /** First visit "YYYY-MM-DD" — the end date can't be earlier. */
  startDate: string;
  /** Prefix for input ids (two forms can be on one page). */
  idPrefix: string;
  /** Hide the end fields (care plans end after their total visits). */
  hideEnd?: boolean;
}

const INPUT =
  "h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-brand";

/** Weekly repeat: weekdays, every N weeks, ends after N visits or on a date. */
export function RepeatBookingFields({ value, onChange, startDate, idPrefix, hideEnd = false }: Props) {
  const set = <K extends keyof RepeatFormState>(key: K, v: RepeatFormState[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-[12px] font-medium text-fg-secondary">On</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Repeat on weekdays">
          {WEEKDAY_PICKER_ORDER.map((d) => {
            const on = value.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set("weekdays", toggleWeekday(value.weekdays, d))}
                className={`h-8 w-11 rounded-control border text-[13px] font-medium transition-colors ${
                  on ? "border-brand bg-primary text-white" : "border-border bg-white text-fg-secondary hover:bg-surface-muted"
                }`}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[14px] text-fg-secondary">
        <label htmlFor={`${idPrefix}-interval`}>Every</label>
        <select
          id={`${idPrefix}-interval`}
          value={value.intervalWeeks}
          onChange={(e) => set("intervalWeeks", Number(e.target.value))}
          className={INPUT}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "week" : `${n} weeks`}
            </option>
          ))}
        </select>
      </div>

      {!hideEnd && (
        <fieldset className="space-y-2">
          <legend className="mb-1 block text-[12px] font-medium text-fg-secondary">Ends</legend>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-fg-secondary">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`${idPrefix}-end`}
                checked={value.endMode === "count"}
                onChange={() => set("endMode", "count")}
                className="accent-brand"
              />
              After
            </label>
            <input
              id={`${idPrefix}-count`}
              type="number"
              aria-label="Number of visits"
              min={1}
              max={MAX_REPEAT_VISITS}
              value={Number.isFinite(value.count) ? value.count : ""}
              disabled={value.endMode !== "count"}
              onChange={(e) => set("count", Number.parseInt(e.target.value, 10))}
              className={`${INPUT} w-20 disabled:opacity-50`}
            />
            <span>visits</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-fg-secondary">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`${idPrefix}-end`}
                checked={value.endMode === "until"}
                onChange={() => set("endMode", "until")}
                className="accent-brand"
              />
              On
            </label>
            <DateInput
              id={`${idPrefix}-until`}
              aria-label="Last date"
              value={value.until}
              min={startDate || undefined}
              disabled={value.endMode !== "until"}
              onChange={(v) => set("until", v)}
              className="w-44"
              inputClassName={INPUT}
            />
          </div>
        </fieldset>
      )}
    </div>
  );
}

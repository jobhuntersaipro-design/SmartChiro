"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { OCCURRENCE_PROBLEM_LABELS, describeOccurrenceProblems, occurrenceWhen } from "@/lib/package-ui";
import type { SeriesPreview } from "./useSeriesPreview";

interface Props {
  preview: SeriesPreview | null;
  loading: boolean;
  error: string | null;
  skipProblemDates: boolean;
  onSkipChange: (skip: boolean) => void;
  idPrefix: string;
}

/** Every date of a repeat rule with ok / problem chips and the "skip problem dates" choice. */
export function SeriesPreviewList({ preview, loading, error, skipProblemDates, onSkipChange, idPrefix }: Props) {
  if (error) {
    return <p className="rounded-md bg-[#FDE7EC] px-3 py-2 text-[13px] text-[#DF1B41]">{error}</p>;
  }
  if (!preview) {
    return loading ? (
      <div className="flex items-center gap-2 text-[13px] text-[#64748d]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> Checking dates…
      </div>
    ) : null;
  }
  const { summary } = preview;

  return (
    <div className="rounded-md border border-[#e5edf5]" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[13px]">
        <span className="font-medium text-[#061b31]">
          {summary.total === 0 ? "No upcoming dates match" : `${summary.total} date${summary.total === 1 ? "" : "s"}`}
          {summary.total > 0 && (
            <span className="font-normal text-[#64748d]">
              {" "}· {summary.ok} ok{summary.withProblems > 0 ? ` · ${summary.withProblems} with problems` : ""}
            </span>
          )}
        </span>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#64748d]" strokeWidth={2} />}
      </div>
      {summary.total > 0 && (
        <ul className="max-h-52 divide-y divide-[#f0f3f7] overflow-y-auto">
          {preview.occurrences.map((o, i) => (
            <li key={o.dateTime} className="flex items-start gap-2 px-3 py-1.5 text-[13px]">
              <span className="w-6 shrink-0 pt-0.5 text-right text-[12px] tabular-nums text-[#94a3b8]">{i + 1}</span>
              {o.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#108c3d]" strokeWidth={2} />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c2410c]" strokeWidth={2} />
              )}
              <span className="min-w-0 flex-1">
                <span className={`tabular-nums ${o.ok ? "text-[#061b31]" : "text-[#9b6829]"}`}>{occurrenceWhen(o.dateTime)}</span>
                {!o.ok && (
                  <span className="mt-0.5 flex flex-wrap gap-1" title={describeOccurrenceProblems(o).join("; ")}>
                    {o.problems.map((p) => (
                      <span key={p} className="rounded-full bg-[#FFF4E5] px-1.5 py-px text-[11px] font-medium text-[#9b6829]">
                        {OCCURRENCE_PROBLEM_LABELS[p]}
                      </span>
                    ))}
                    <span className="text-[11px] text-[#64748d]">{describeOccurrenceProblems(o)[0]}</span>
                  </span>
                )}
              </span>
              {o.ok && <span className="shrink-0 rounded-full bg-[#E8F7EE] px-1.5 py-px text-[11px] font-medium text-[#108c3d]">OK</span>}
            </li>
          ))}
        </ul>
      )}
      {preview.capped && (
        <p className="border-t border-[#e5edf5] px-3 py-1.5 text-[12px] text-[#64748d]">Showing the first 104 dates (the most one series can book).</p>
      )}
      {summary.withProblems > 0 && (
        <label htmlFor={`${idPrefix}-skip`} className="flex items-center gap-2 border-t border-[#e5edf5] px-3 py-2 text-[13px] text-[#273951]">
          <input
            id={`${idPrefix}-skip`}
            type="checkbox"
            checked={skipProblemDates}
            onChange={(e) => onSkipChange(e.target.checked)}
            className="h-4 w-4 accent-[#533afd]"
          />
          Skip problem dates (book the {summary.ok} that are free)
        </label>
      )}
    </div>
  );
}

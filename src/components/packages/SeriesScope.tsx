"use client";

import { useEffect, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "./ModalShell";
import {
  describeOccurrenceProblems,
  forceOptionFor,
  occurrenceWhen,
} from "@/lib/package-ui";
import type { FollowingProblem } from "@/lib/series-client";

export type SeriesScope = "one" | "following";

interface ChoiceProps {
  value: SeriesScope;
  onChange: (scope: SeriesScope) => void;
  /** What happens, e.g. "Move" / "Cancel". */
  verb: string;
  name: string;
}

/** Radio pair: this appointment / this and following (series occurrences). */
export function SeriesScopeChoice({ value, onChange, verb, name }: ChoiceProps) {
  const options: { id: SeriesScope; label: string; hint: string }[] = [
    { id: "one", label: "This appointment", hint: "Only this visit changes." },
    {
      id: "following",
      label: "This and following",
      hint: `${verb} every later visit of the series that is still booked. Completed and past visits never change.`,
    },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Apply to</legend>
      {options.map((o) => (
        <label
          key={o.id}
          className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
            value === o.id ? "border-brand bg-brand-subtle" : "border-border hover:bg-surface-muted"
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-[14px] font-medium text-foreground">{o.label}</span>
            <span className="block text-[12px] text-fg-secondary">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

interface DialogProps {
  open: boolean;
  /** e.g. "Move recurring appointment". */
  title: string;
  verb: string;
  onChoose: (scope: SeriesScope) => void;
  onClose: () => void;
}

/** Asks which occurrences an edit to a series appointment applies to. */
export function SeriesScopeDialog({ open, title, verb, onChoose, onClose }: DialogProps) {
  const [scope, setScope] = useState<SeriesScope>("one");
  useEffect(() => {
    if (open) setScope("one");
  }, [open]);
  return (
    <ModalShell
      open={open}
      title={title}
      description="This appointment is part of a recurring series."
      onClose={onClose}
      widthClass="max-w-md"
      elevated
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} className="h-8 rounded-md text-[14px]">
            Cancel
          </Button>
          <Button type="button" onClick={() => onChoose(scope)} className="h-8 gap-1.5 rounded-md text-[14px]">
            <Repeat className="h-3.5 w-3.5" strokeWidth={2} /> Continue
          </Button>
        </>
      }
    >
      <SeriesScopeChoice value={scope} onChange={setScope} verb={verb} name="series-scope-dialog" />
    </ModalShell>
  );
}

interface ProblemsProps {
  problems: FollowingProblem[] | null;
  message: string;
  /** `appointment.manageAll` may force; others only past opening hours. */
  canManageAll: boolean;
  busy?: boolean;
  onApplyAnyway: (opts: { force?: boolean; forceOutsideHours?: boolean }) => void;
  onClose: () => void;
}

/** The later occurrences a "this and following" change can't take, with an optional override. */
export function SeriesProblemsDialog({ problems, message, canManageAll, busy = false, onApplyAnyway, onClose }: ProblemsProps) {
  const option = problems ? forceOptionFor(problems, canManageAll) : null;
  return (
    <ModalShell
      open={!!problems}
      role="alertdialog"
      title="Some visits can't be changed"
      description={message}
      onClose={onClose}
      busy={busy}
      elevated
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-8 rounded-md text-[14px]">
            Go back
          </Button>
          {option && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => onApplyAnyway(option === "force" ? { force: true } : { forceOutsideHours: true })}
              className="h-8 gap-1.5 rounded-md bg-warning text-[14px] text-white hover:bg-warning"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
              {option === "force" ? "Apply anyway" : "Apply outside hours"}
            </Button>
          )}
        </>
      }
    >
      <ul className="divide-y divide-border-subtle rounded-md border border-border">
        {(problems ?? []).map((p) => (
          <li key={p.appointmentId} className="px-3 py-2 text-[13px]">
            <div className="flex items-baseline gap-2">
              {p.seriesIndex !== null && (
                <span className="text-[12px] tabular-nums text-fg-muted">#{p.seriesIndex}</span>
              )}
              <span className="font-medium tabular-nums text-foreground">{occurrenceWhen(p.dateTime)}</span>
            </div>
            <ul className="mt-0.5 list-disc pl-5 text-warning">
              {describeOccurrenceProblems(p).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {!option && (
        <p className="mt-3 text-[13px] text-fg-secondary">
          {problems?.some((p) => p.problems.includes("past"))
            ? "Visits can't be moved into the past."
            : "Only owners, admins and front desk can override these. Pick another time or change this visit only."}
        </p>
      )}
    </ModalShell>
  );
}

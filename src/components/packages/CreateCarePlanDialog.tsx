"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { DoctorCombobox } from "@/components/patients/DoctorCombobox";
import { ModalShell, FIELD_CLASS, LABEL_CLASS, FormError } from "./ModalShell";
import { RepeatBookingFields } from "./RepeatBookingFields";
import { SeriesPreviewList } from "./SeriesPreviewList";
import { useSeriesPreview } from "./useSeriesPreview";
import { clinicDateKey } from "@/lib/clinic-time";
import { formatMYR } from "@/lib/invoices";
import { TREATMENT_OPTIONS, treatmentLabelFor, defaultDurationFor } from "@/lib/treatment-colors";
import {
  buildRepeatRule,
  defaultWeekdaysForVisits,
  seriesBookedMessage,
  type RepeatFormState,
} from "@/lib/package-ui";
import type { TreatmentType } from "@/types/appointment";
import type { CarePlanJson, PackageTemplateJson, PatientPackageJson } from "@/types/packages";

interface Props {
  open: boolean;
  patientId: string;
  patientName: string;
  branchId: string;
  /** Default doctor — the patient's assigned doctor. */
  defaultDoctor: { id: string; name: string } | null;
  /** A DOCTOR's plans are always their own. */
  canPickDoctor: boolean;
  /** `invoice.manage` + `package.manage`: sell a catalogue package with the plan. */
  canSell: boolean;
  onClose: () => void;
  onCreated: (result: { carePlan: CarePlanJson; message: string }) => void;
}

interface CreateResponse {
  carePlan?: CarePlanJson;
  package?: PatientPackageJson | null;
  series?: { created: unknown[]; skipped: unknown[] } | null;
  message?: string;
  error?: string;
}

/** Package choice: nothing, link one the patient has, or sell a catalogue package now. */
type PackageChoice = "" | `link:${string}` | `sell:${string}`;

/** New care plan: goals and visit frequency, optionally booking the series and selling a package in one go. */
export function CreateCarePlanDialog({
  open,
  patientId,
  patientName,
  branchId,
  defaultDoctor,
  canPickDoctor,
  canSell,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [doctor, setDoctor] = useState<{ id: string; name: string } | null>(defaultDoctor);
  const [visitsPerWeek, setVisitsPerWeek] = useState(3);
  const [totalVisits, setTotalVisits] = useState(12);
  const [startDate, setStartDate] = useState(() => clinicDateKey());
  const [goals, setGoals] = useState("");
  const [book, setBook] = useState(true);
  const [repeat, setRepeat] = useState<RepeatFormState>(() => initialRepeat(3));
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);
  const [time, setTime] = useState("10:00");
  const [treatmentType, setTreatmentType] = useState<TreatmentType | "">("ADJUSTMENT");
  const [duration, setDuration] = useState(defaultDurationFor("ADJUSTMENT"));
  const [skip, setSkip] = useState(false);
  const [packageChoice, setPackageChoice] = useState<PackageChoice>("");
  const [templates, setTemplates] = useState<PackageTemplateJson[]>([]);
  const [owned, setOwned] = useState<PatientPackageJson[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDoctor(defaultDoctor);
    setVisitsPerWeek(3);
    setTotalVisits(12);
    setStartDate(clinicDateKey());
    setGoals("");
    setBook(true);
    setRepeat(initialRepeat(3));
    setWeekdaysTouched(false);
    setTime("10:00");
    setTreatmentType("ADJUSTMENT");
    setDuration(defaultDurationFor("ADJUSTMENT"));
    setSkip(false);
    setPackageChoice("");
    setError(null);
    let cancelled = false;
    void (async () => {
      const [tRes, pRes] = await Promise.all([
        canSell ? fetch(`/api/branches/${branchId}/packages`) : Promise.resolve(null),
        fetch(`/api/patients/${patientId}/packages`),
      ]);
      const t = tRes?.ok ? ((await tRes.json()) as { templates: PackageTemplateJson[] }).templates : [];
      const p = pRes.ok ? ((await pRes.json()) as { packages: PatientPackageJson[] }).packages : [];
      if (cancelled) return;
      setTemplates(t);
      setOwned(p.filter((x) => x.effectiveStatus === "ACTIVE"));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultDoctor, canSell, branchId, patientId]);

  const rule = book ? buildRepeatRule({ ...repeat, endMode: "count", count: totalVisits }, startDate, time) : null;
  const series = useSeriesPreview({
    rule: open && rule?.ok ? rule.rule : null,
    branchId,
    doctorId: doctor?.id,
    patientId,
    duration,
    treatmentType,
  });

  function changeVisitsPerWeek(n: number) {
    setVisitsPerWeek(n);
    if (!weekdaysTouched) setRepeat((r) => ({ ...r, weekdays: defaultWeekdaysForVisits(n) }));
  }

  function pickPackage(value: PackageChoice) {
    setPackageChoice(value);
    if (value.startsWith("sell:")) {
      const t = templates.find((x) => x.id === value.slice(5));
      if (t) {
        setTotalVisits(t.sessions);
        if (t.treatmentTypes.length > 0 && !(t.treatmentTypes as string[]).includes(treatmentType)) {
          setTreatmentType(t.treatmentTypes[0]);
        }
      }
    }
  }

  const blocked = book && !!series.preview && series.preview.summary.withProblems > 0 && !skip;
  const valid =
    title.trim().length > 0 &&
    !!doctor &&
    !!startDate &&
    totalVisits >= 1 &&
    totalVisits <= 200 &&
    (!book || (!!rule?.ok && !!series.preview && !series.loading && series.preview.summary.ok > 0 && !blocked));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !doctor) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        visitsPerWeek,
        totalVisits,
        startDate,
        ...(goals.trim() ? { goals: goals.trim() } : {}),
        ...(canPickDoctor ? { doctorId: doctor.id } : {}),
        ...(packageChoice.startsWith("sell:") ? { packageTemplateId: packageChoice.slice(5) } : {}),
        ...(packageChoice.startsWith("link:") ? { patientPackageId: packageChoice.slice(5) } : {}),
        ...(book && rule?.ok
          ? {
              series: {
                weekdays: rule.rule.weekdays,
                startTime: rule.rule.startTime,
                intervalWeeks: rule.rule.intervalWeeks,
                duration,
                ...(treatmentType ? { treatmentType } : {}),
                skipProblemDates: skip,
              },
            }
          : {}),
      };
      const res = await fetch(`/api/patients/${patientId}/care-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as CreateResponse;
      if (!res.ok || !data.carePlan) {
        setError(
          data.error === "series_problems"
            ? `${data.message ?? "Some dates have problems."} Tick “Skip problem dates” or change the days.`
            : data.message ?? "Couldn't create the care plan.",
        );
        return;
      }
      const parts = ["Care plan created"];
      if (data.series) parts.push(seriesBookedMessage(data.series.created.length, data.series.skipped.length));
      if (data.package) parts.push(`sold ${data.package.name}`);
      onCreated({ carePlan: data.carePlan, message: parts.join(" · ") });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const sellTemplate = packageChoice.startsWith("sell:") ? templates.find((t) => t.id === packageChoice.slice(5)) : null;

  return (
    <ModalShell
      open={open}
      title="New care plan"
      description={`For ${patientName}`}
      onClose={onClose}
      busy={saving}
      widthClass="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-control text-[14px]">
            Cancel
          </Button>
          <Button type="submit" form="care-plan-form" disabled={!valid || saving} className="h-8 gap-1.5 rounded-control text-[14px]">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {book && series.preview ? `Create plan & book ${series.preview.summary.ok}` : "Create plan"}
          </Button>
        </>
      }
    >
      <form id="care-plan-form" onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label htmlFor="care-plan-title" className={LABEL_CLASS}>Title</label>
          <input
            id="care-plan-title"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lumbar corrective care"
            className={FIELD_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {canPickDoctor && (
            <div className="col-span-2">
              <span className={LABEL_CLASS}>Doctor</span>
              <DoctorCombobox value={doctor} onChange={setDoctor} branchId={branchId} />
            </div>
          )}
          <div>
            <label htmlFor="care-plan-per-week" className={LABEL_CLASS}>Visits / week</label>
            <input
              id="care-plan-per-week"
              type="number"
              min={1}
              max={7}
              value={visitsPerWeek}
              onChange={(e) => changeVisitsPerWeek(Number.parseInt(e.target.value, 10) || 1)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="care-plan-total" className={LABEL_CLASS}>Total visits</label>
            <input
              id="care-plan-total"
              type="number"
              min={1}
              max={200}
              value={totalVisits}
              onChange={(e) => setTotalVisits(Number.parseInt(e.target.value, 10) || 1)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="care-plan-start" className={LABEL_CLASS}>Start date</label>
            <DateInput id="care-plan-start" value={startDate} onChange={setStartDate} min={clinicDateKey()} />
          </div>
        </div>
        <div>
          <label htmlFor="care-plan-goals" className={LABEL_CLASS}>Goals (optional)</label>
          <textarea
            id="care-plan-goals"
            value={goals}
            maxLength={4000}
            rows={2}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. Reduce lower back pain to 2/10, return to running"
            className="w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-[14px] text-foreground focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {(owned.length > 0 || templates.length > 0) && (
          <div>
            <label htmlFor="care-plan-package" className={LABEL_CLASS}>Package</label>
            <select
              id="care-plan-package"
              value={packageChoice}
              onChange={(e) => pickPackage(e.target.value as PackageChoice)}
              className={FIELD_CLASS}
            >
              <option value="">No package</option>
              {owned.length > 0 && (
                <optgroup label="Use a package the patient has">
                  {owned.map((p) => (
                    <option key={p.id} value={`link:${p.id}`}>
                      {p.name} — {p.sessionsLeft} of {p.sessionsTotal} left
                    </option>
                  ))}
                </optgroup>
              )}
              {templates.length > 0 && (
                <optgroup label="Sell a package now">
                  {templates.map((t) => (
                    <option key={t.id} value={`sell:${t.id}`}>
                      {t.name} — {t.sessions} sessions, {formatMYR(t.price)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {sellTemplate && (
              <p className="mt-1 text-[12px] text-fg-secondary">
                A sale invoice for {formatMYR(sellTemplate.price)} is created with the plan.
              </p>
            )}
          </div>
        )}

        <div className="rounded-md border border-border px-3 py-3">
          <label className="flex items-center gap-2 text-[14px] font-medium text-foreground">
            <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} className="h-4 w-4 accent-brand" />
            Book the {totalVisits} visits now
          </label>
          {book && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="care-plan-time" className={LABEL_CLASS}>Time</label>
                  <input id="care-plan-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={FIELD_CLASS} />
                </div>
                <div>
                  <label htmlFor="care-plan-treatment" className={LABEL_CLASS}>Treatment</label>
                  <select
                    id="care-plan-treatment"
                    value={treatmentType}
                    onChange={(e) => {
                      const t = e.target.value as TreatmentType | "";
                      setTreatmentType(t);
                      setDuration(defaultDurationFor(t));
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="">— Select —</option>
                    {TREATMENT_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {treatmentLabelFor(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="care-plan-duration" className={LABEL_CLASS}>Minutes</label>
                  <input
                    id="care-plan-duration"
                    type="number"
                    min={5}
                    max={180}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(Number.parseInt(e.target.value, 10) || 30)}
                    className={`${FIELD_CLASS} tabular-nums`}
                  />
                </div>
              </div>
              <RepeatBookingFields
                value={repeat}
                onChange={(v) => {
                  setRepeat(v);
                  setWeekdaysTouched(true);
                }}
                startDate={startDate}
                idPrefix="care-plan-repeat"
                hideEnd
              />
              {rule && !rule.ok ? (
                <p className="text-[13px] text-warning">{rule.error}</p>
              ) : (
                <SeriesPreviewList
                  preview={series.preview}
                  loading={series.loading}
                  error={series.error}
                  skipProblemDates={skip}
                  onSkipChange={setSkip}
                  idPrefix="care-plan-repeat"
                />
              )}
            </div>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

function initialRepeat(visitsPerWeek: number): RepeatFormState {
  return {
    enabled: true,
    weekdays: defaultWeekdaysForVisits(visitsPerWeek),
    intervalWeeks: 1,
    endMode: "count",
    count: 12,
    until: "",
  };
}

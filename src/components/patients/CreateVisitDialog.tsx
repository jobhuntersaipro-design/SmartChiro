"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Loader2, ChevronDown, ChevronUp,
  ClipboardList, Stethoscope, Activity,
  MessageSquare, FileText, Heart,
} from "lucide-react";
import type { CreateVisitData } from "@/types/visit";
import { DISCARD_CHANGES_PROMPT, todayLocalISODate } from "@/lib/format";
import { DateInput } from "@/components/ui/date-input";

interface CreateVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onCreated: () => void;
}

// ─── Shared Styles ───

const inputClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-all duration-200";

const selectClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-colors appearance-none cursor-pointer";

const textareaClass =
  "flex w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-[15px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-all duration-200 resize-none";

const VISIT_TYPES = [
  { value: "initial", label: "Initial" },
  { value: "follow_up", label: "Follow-up" },
  { value: "emergency", label: "Emergency" },
  { value: "reassessment", label: "Reassessment" },
  { value: "discharge", label: "Discharge" },
];

const TECHNIQUES = [
  "Gonstead",
  "Diversified",
  "Activator",
  "Thompson",
  "Drop Table",
  "Flexion-Distraction",
  "SOT",
  "Other",
];

// ─── Section Header ───

function SectionHeader({
  icon: Icon,
  title,
  expanded,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-2.5 px-1 text-left transition-colors hover:bg-surface-muted rounded-md -mx-1"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" strokeWidth={1.5} />
        <span className="text-[15px] font-medium text-foreground">{title}</span>
      </div>
      {expanded ? (
        <ChevronUp className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
      ) : (
        <ChevronDown className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
      )}
    </button>
  );
}

// ─── Slider Field ───

function SliderField({
  label,
  value,
  onChange,
  minLabel,
  maxLabel,
  inverted = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  inverted?: boolean;
}) {
  function colorFor(n: number): string {
    const effective = inverted ? 10 - n : n;
    if (effective >= 7) return "bg-success text-white border-success";
    if (effective >= 4) return "bg-warning text-white border-warning";
    return "bg-danger text-white border-danger";
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[13px] font-medium text-foreground">{label}</label>
        <span className="text-[18px] font-semibold text-brand tabular-nums">{value}<span className="text-[12px] text-fg-secondary font-normal">/10</span></span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-9 rounded-md border text-[13px] font-medium transition-all duration-150 ${
                selected
                  ? `${colorFor(n)} scale-105 shadow-sm`
                  : "bg-white text-foreground border-border hover:border-border-strong hover:bg-surface-muted"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-fg-secondary">{minLabel}</span>
        <span className="text-[11px] text-fg-secondary">{maxLabel}</span>
      </div>
    </div>
  );
}

function blankVisitForm(): CreateVisitData {
  return {
    visitDate: todayLocalISODate(),
    visitType: "follow_up",
    questionnaire: {
      painLevel: 5,
      mobilityScore: 5,
      sleepQuality: 5,
      dailyFunction: 5,
      overallImprovement: 5,
    },
  };
}

// ─── Main Component ───

export function CreateVisitDialog({ open, onOpenChange, patientId, onCreated }: CreateVisitDialogProps) {
  const [form, setForm] = useState<CreateVisitData>(blankVisitForm);
  const [nextVisitDate, setNextVisitDate] = useState<string>("");
  // Opt-in: untouched 5/10 defaults were saved on every visit and skewed the
  // Recovery Trend, which averages these scores.
  const [questionnaireEnabled, setQuestionnaireEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Section expand state
  const [sections, setSections] = useState({
    visitInfo: true,
    questionnaire: true,
    soap: true,
    treatment: true,
    vitals: false,
    recommendations: false,
  });

  const toggleSection = useCallback((key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const updateField = useCallback(<K extends keyof CreateVisitData>(key: K, value: CreateVisitData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateQuestionnaire = useCallback((key: string, value: number | string) => {
    setForm((prev) => ({
      ...prev,
      questionnaire: {
        painLevel: prev.questionnaire?.painLevel ?? 5,
        mobilityScore: prev.questionnaire?.mobilityScore ?? 5,
        sleepQuality: prev.questionnaire?.sleepQuality ?? 5,
        dailyFunction: prev.questionnaire?.dailyFunction ?? 5,
        overallImprovement: prev.questionnaire?.overallImprovement ?? 5,
        ...(prev.questionnaire || {}),
        [key]: value,
      },
    }));
  }, []);

  // Escape goes through the same dirty-check as a backdrop click. No deps
  // array so the listener always sees the current render's form state.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleBackdropClick();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  function handleClose() {
    setForm(blankVisitForm());
    setNextVisitDate("");
    setQuestionnaireEnabled(false);
    setSubmitError(null);
    onOpenChange(false);
  }

  // A stray click outside must not throw away a half-written SOAP note.
  function handleBackdropClick() {
    const dirty = JSON.stringify(form) !== JSON.stringify(blankVisitForm()) || nextVisitDate !== "";
    if (dirty && !window.confirm(DISCARD_CHANGES_PROMPT)) return;
    handleClose();
  }

  function daysFromToday(dateStr: string): number | undefined {
    if (!dateStr) return undefined;
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return days;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreateVisitData = { ...form };
      if (!questionnaireEnabled) {
        delete payload.questionnaire;
      }
      const computedDays = daysFromToday(nextVisitDate);
      if (computedDays !== undefined) {
        payload.nextVisitDays = computedDays;
      }
      const res = await fetch(`/api/patients/${patientId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create visit");
      }
      handleClose();
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create visit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={handleBackdropClick} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-visit-title"
        className="relative z-10 w-full max-w-150 max-h-[90vh] flex flex-col rounded-panel border border-border bg-white animate-in fade-in zoom-in-95 duration-200"
        style={{
          boxShadow:
            "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="create-visit-title" className="text-[18px] font-light text-foreground">Add Visit</h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary transition-all duration-200 hover:bg-surface-muted hover:text-foreground hover:scale-110 hover:rotate-90 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
          {/* ── Section 1: Visit Info ── */}
          <SectionHeader
            icon={ClipboardList}
            title="Visit Info"
            expanded={sections.visitInfo}
            onToggle={() => toggleSection("visitInfo")}
          />
          {sections.visitInfo && (
            <div className="space-y-3 pb-3 pl-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-visit-visit-date" className="block text-[13px] font-medium text-foreground mb-1.5">
                    Visit Date
                  </label>
                  <DateInput
                    id="create-visit-visit-date"
                    value={form.visitDate || ""}
                    onChange={(iso) => updateField("visitDate", iso)}
                    inputClassName={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="create-visit-visit-type" className="block text-[13px] font-medium text-foreground mb-1.5">
                    Visit Type
                  </label>
                  <select
                    id="create-visit-visit-type"
                    value={form.visitType || "follow_up"}
                    onChange={(e) => updateField("visitType", e.target.value)}
                    className={selectClass}
                  >
                    {VISIT_TYPES.map((vt) => (
                      <option key={vt.value} value={vt.value}>
                        {vt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="create-visit-chief-complaint" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Chief Complaint
                </label>
                <input
                  id="create-visit-chief-complaint"
                  type="text"
                  value={form.chiefComplaint || ""}
                  onChange={(e) => updateField("chiefComplaint", e.target.value)}
                  placeholder="e.g. Lower back pain radiating to left leg"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* ── Section 2: Recovery Questionnaire ── */}
          <SectionHeader
            icon={Heart}
            title="Recovery Questionnaire"
            expanded={sections.questionnaire}
            onToggle={() => toggleSection("questionnaire")}
          />
          {sections.questionnaire && (
            <div className="space-y-4 pb-3 pl-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={questionnaireEnabled}
                  onChange={(e) => setQuestionnaireEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-1 focus:ring-brand"
                  style={{ accentColor: "#533afd" }}
                />
                <span className="text-[13px] text-foreground">
                  Record recovery questionnaire for this visit
                </span>
              </label>
              {!questionnaireEnabled && (
                <p className="text-[13px] text-fg-secondary italic pl-6">
                  Not recorded unless you tick this — only real answers count towards the recovery trend.
                </p>
              )}
              {questionnaireEnabled && (
                <>
              <SliderField
                label="Pain Level"
                value={form.questionnaire?.painLevel ?? 5}
                onChange={(v) => updateQuestionnaire("painLevel", v)}
                minLabel="0 — No Pain"
                maxLabel="10 — Worst Pain"
                inverted
              />
              <SliderField
                label="Mobility"
                value={form.questionnaire?.mobilityScore ?? 5}
                onChange={(v) => updateQuestionnaire("mobilityScore", v)}
                minLabel="0 — Immobile"
                maxLabel="10 — Full Range"
              />
              <SliderField
                label="Sleep Quality"
                value={form.questionnaire?.sleepQuality ?? 5}
                onChange={(v) => updateQuestionnaire("sleepQuality", v)}
                minLabel="0 — No Sleep"
                maxLabel="10 — Perfect"
              />
              <SliderField
                label="Daily Function"
                value={form.questionnaire?.dailyFunction ?? 5}
                onChange={(v) => updateQuestionnaire("dailyFunction", v)}
                minLabel="0 — Cannot Function"
                maxLabel="10 — Fully Functional"
              />
              <SliderField
                label="Overall Improvement"
                value={form.questionnaire?.overallImprovement ?? 5}
                onChange={(v) => updateQuestionnaire("overallImprovement", v)}
                minLabel="0 — Much Worse"
                maxLabel="10 — Fully Recovered"
              />
              <div>
                <label htmlFor="create-visit-patient-comments" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Patient Comments
                </label>
                <textarea
                  id="create-visit-patient-comments"
                  value={form.questionnaire?.patientComments || ""}
                  onChange={(e) => updateQuestionnaire("patientComments", e.target.value)}
                  placeholder="Any additional notes from the patient..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
                </>
              )}
            </div>
          )}

          {/* ── Section 3: SOAP Notes ── */}
          <SectionHeader
            icon={FileText}
            title="SOAP Notes"
            expanded={sections.soap}
            onToggle={() => toggleSection("soap")}
          />
          {sections.soap && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label htmlFor="create-visit-subjective" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Subjective
                </label>
                <textarea
                  id="create-visit-subjective"
                  value={form.subjective || ""}
                  onChange={(e) => updateField("subjective", e.target.value)}
                  placeholder="Patient's description of symptoms..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-objective" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Objective
                </label>
                <textarea
                  id="create-visit-objective"
                  value={form.objective || ""}
                  onChange={(e) => updateField("objective", e.target.value)}
                  placeholder="Clinical findings, observations, exam results..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-assessment" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Assessment
                </label>
                <textarea
                  id="create-visit-assessment"
                  value={form.assessment || ""}
                  onChange={(e) => updateField("assessment", e.target.value)}
                  placeholder="Diagnosis, differential diagnosis..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-plan" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Plan
                </label>
                <textarea
                  id="create-visit-plan"
                  value={form.plan || ""}
                  onChange={(e) => updateField("plan", e.target.value)}
                  placeholder="Treatment plan, follow-up actions..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
            </div>
          )}

          {/* ── Section 4: Treatment Details ── */}
          <SectionHeader
            icon={Stethoscope}
            title="Treatment Details"
            expanded={sections.treatment}
            onToggle={() => toggleSection("treatment")}
          />
          {sections.treatment && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label htmlFor="create-visit-areas-adjusted" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Areas Adjusted
                </label>
                <input
                  id="create-visit-areas-adjusted"
                  type="text"
                  value={form.areasAdjusted || ""}
                  onChange={(e) => updateField("areasAdjusted", e.target.value)}
                  placeholder="e.g. C5, T4, L3, SI joint"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-technique-used" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Technique Used
                </label>
                <select
                  id="create-visit-technique-used"
                  value={form.techniqueUsed || ""}
                  onChange={(e) => updateField("techniqueUsed", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select technique...</option>
                  {TECHNIQUES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="create-visit-subluxation-findings" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Subluxation Findings
                </label>
                <textarea
                  id="create-visit-subluxation-findings"
                  value={form.subluxationFindings || ""}
                  onChange={(e) => updateField("subluxationFindings", e.target.value)}
                  placeholder="Subluxation findings and listings..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-treatment-notes" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Treatment Notes
                </label>
                <textarea
                  id="create-visit-treatment-notes"
                  value={form.treatmentNotes || ""}
                  onChange={(e) => updateField("treatmentNotes", e.target.value)}
                  placeholder="Additional treatment notes..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
            </div>
          )}

          {/* ── Section 5: Vitals (collapsed by default) ── */}
          <SectionHeader
            icon={Activity}
            title="Vitals"
            expanded={sections.vitals}
            onToggle={() => toggleSection("vitals")}
          />
          {sections.vitals && (
            <div className="space-y-3 pb-3 pl-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-visit-bp-systolic" className="block text-[13px] font-medium text-foreground mb-1.5">
                    BP Systolic
                  </label>
                  <input
                    id="create-visit-bp-systolic"
                    type="number"
                    value={form.bloodPressureSys ?? ""}
                    onChange={(e) =>
                      updateField("bloodPressureSys", e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="120"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="create-visit-bp-diastolic" className="block text-[13px] font-medium text-foreground mb-1.5">
                    BP Diastolic
                  </label>
                  <input
                    id="create-visit-bp-diastolic"
                    type="number"
                    value={form.bloodPressureDia ?? ""}
                    onChange={(e) =>
                      updateField("bloodPressureDia", e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="80"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="create-visit-heart-rate" className="block text-[13px] font-medium text-foreground mb-1.5">
                    Heart Rate
                  </label>
                  <input
                    id="create-visit-heart-rate"
                    type="number"
                    value={form.heartRate ?? ""}
                    onChange={(e) =>
                      updateField("heartRate", e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="72"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="create-visit-weight-kg" className="block text-[13px] font-medium text-foreground mb-1.5">
                    Weight (kg)
                  </label>
                  <input
                    id="create-visit-weight-kg"
                    type="number"
                    step="0.1"
                    value={form.weight ?? ""}
                    onChange={(e) =>
                      updateField("weight", e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="75"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="create-visit-temp-c" className="block text-[13px] font-medium text-foreground mb-1.5">
                    Temp (C)
                  </label>
                  <input
                    id="create-visit-temp-c"
                    type="number"
                    step="0.1"
                    value={form.temperature ?? ""}
                    onChange={(e) =>
                      updateField("temperature", e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="36.5"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Section 6: Recommendations (collapsed by default) ── */}
          <SectionHeader
            icon={MessageSquare}
            title="Recommendations"
            expanded={sections.recommendations}
            onToggle={() => toggleSection("recommendations")}
          />
          {sections.recommendations && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label htmlFor="create-visit-recommendations" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Recommendations
                </label>
                <textarea
                  id="create-visit-recommendations"
                  value={form.recommendations || ""}
                  onChange={(e) => updateField("recommendations", e.target.value)}
                  placeholder="Home care instructions, exercises..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-referrals" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Referrals
                </label>
                <textarea
                  id="create-visit-referrals"
                  value={form.referrals || ""}
                  onChange={(e) => updateField("referrals", e.target.value)}
                  placeholder="Specialist referrals if any..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label htmlFor="create-visit-next-visit-date" className="block text-[13px] font-medium text-foreground mb-1.5">
                  Next Visit Date
                </label>
                <DateInput
                  id="create-visit-next-visit-date"
                  value={nextVisitDate}
                  min={todayLocalISODate()}
                  onChange={setNextVisitDate}
                  inputClassName={inputClass}
                />
                {nextVisitDate && (
                  <p className="mt-1 text-[12px] text-fg-secondary">
                    {(() => {
                      const d = daysFromToday(nextVisitDate);
                      if (d === undefined) return null;
                      if (d === 0) return "Today";
                      if (d === 1) return "Tomorrow (in 1 day)";
                      if (d > 0) return `In ${d} days`;
                      return `${Math.abs(d)} days ago`;
                    })()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Submit Error */}
          {submitError && (
            <div className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {submitError}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-md border-border text-foreground hover:bg-surface-muted"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            onClick={handleSubmit}
            className="rounded-md bg-primary text-white hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Visit"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Loader2, ChevronDown, ChevronUp,
  ClipboardList, Stethoscope, Activity,
  MessageSquare, FileText, Heart,
} from "lucide-react";
import type { CreateVisitData, Visit } from "@/types/visit";

interface EditVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  visit: Visit | null;
  onSaved: () => void;
}

const inputClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";

const selectClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none cursor-pointer";

const textareaClass =
  "flex w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200 resize-none";

const VISIT_TYPES = [
  { value: "INITIAL_CONSULTATION", label: "Initial Consultation" },
  { value: "FIRST_TREATMENT", label: "First Treatment" },
  { value: "FOLLOW_UP", label: "Follow-Up" },
  { value: "RE_EVALUATION", label: "Re-Evaluation" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "DISCHARGE", label: "Discharge" },
  { value: "OTHER", label: "Other" },
] as const;

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
      className="flex w-full items-center justify-between py-2.5 px-1 text-left transition-colors hover:bg-[#f6f9fc] rounded-[4px] -mx-1"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
        <span className="text-[15px] font-medium text-[#061b31]">{title}</span>
      </div>
      {expanded ? (
        <ChevronUp className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
      ) : (
        <ChevronDown className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
      )}
    </button>
  );
}

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
    if (effective >= 7) return "bg-[#30B130] text-white border-[#30B130]";
    if (effective >= 4) return "bg-[#F5A623] text-white border-[#F5A623]";
    return "bg-[#DF1B41] text-white border-[#DF1B41]";
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[13px] font-medium text-[#273951]">{label}</label>
        <span className="text-[18px] font-semibold text-[#533afd] tabular-nums">{value}<span className="text-[12px] text-[#64748d] font-normal">/10</span></span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-9 rounded-[4px] border text-[13px] font-medium transition-all duration-150 ${
                selected
                  ? `${colorFor(n)} scale-105 shadow-sm`
                  : "bg-white text-[#273951] border-[#e5edf5] hover:border-[#c1c9d2] hover:bg-[#f6f9fc]"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-[#64748d]">{minLabel}</span>
        <span className="text-[11px] text-[#64748d]">{maxLabel}</span>
      </div>
    </div>
  );
}

function visitToFormData(visit: Visit): CreateVisitData {
  return {
    visitDate: visit.visitDate.slice(0, 10),
    visitType: visit.visitType ?? "FOLLOW_UP",
    chiefComplaint: visit.chiefComplaint ?? "",
    subjective: visit.subjective ?? "",
    objective: visit.objective ?? "",
    assessment: visit.assessment ?? "",
    plan: visit.plan ?? "",
    treatmentNotes: visit.treatmentNotes ?? "",
    areasAdjusted: visit.areasAdjusted ?? "",
    techniqueUsed: visit.techniqueUsed ?? "",
    subluxationFindings: visit.subluxationFindings ?? "",
    bloodPressureSys: visit.bloodPressureSys ?? undefined,
    bloodPressureDia: visit.bloodPressureDia ?? undefined,
    heartRate: visit.heartRate ?? undefined,
    weight: visit.weight ?? undefined,
    temperature: visit.temperature ?? undefined,
    recommendations: visit.recommendations ?? "",
    referrals: visit.referrals ?? "",
    nextVisitDays: visit.nextVisitDays ?? undefined,
    questionnaire: visit.questionnaire
      ? {
          painLevel: visit.questionnaire.painLevel,
          mobilityScore: visit.questionnaire.mobilityScore,
          sleepQuality: visit.questionnaire.sleepQuality,
          dailyFunction: visit.questionnaire.dailyFunction,
          overallImprovement: visit.questionnaire.overallImprovement,
          patientComments: visit.questionnaire.patientComments ?? "",
        }
      : {
          painLevel: 5,
          mobilityScore: 5,
          sleepQuality: 5,
          dailyFunction: 5,
          overallImprovement: 5,
        },
  };
}

function daysFromToday(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function daysToDateStr(days: number | null | undefined, fromDate: string): string {
  if (days == null) return "";
  const base = new Date(fromDate);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export function EditVisitDialog({ open, onOpenChange, patientId, visit, onSaved }: EditVisitDialogProps) {
  const [form, setForm] = useState<CreateVisitData>({
    visitDate: new Date().toISOString().slice(0, 10),
    visitType: "FOLLOW_UP",
  });
  const [nextVisitDate, setNextVisitDate] = useState<string>("");
  const [questionnaireEnabled, setQuestionnaireEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [sections, setSections] = useState({
    visitInfo: true,
    questionnaire: true,
    soap: true,
    treatment: true,
    vitals: false,
    recommendations: false,
  });

  useEffect(() => {
    if (visit) {
      setForm(visitToFormData(visit));
      setQuestionnaireEnabled(visit.questionnaire !== null);
      // Derive next visit date from visitDate + nextVisitDays
      setNextVisitDate(daysToDateStr(visit.nextVisitDays, visit.visitDate.slice(0, 10)));
    }
  }, [visit]);

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

  if (!open || !visit) return null;

  function handleClose() {
    setSubmitError(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!visit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreateVisitData = { ...form };
      if (!questionnaireEnabled) {
        delete payload.questionnaire;
      }
      const visitDateStr = form.visitDate || new Date().toISOString().slice(0, 10);
      if (nextVisitDate) {
        // Calculate days between visitDate and nextVisitDate
        const base = new Date(visitDateStr);
        const target = new Date(nextVisitDate);
        base.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        payload.nextVisitDays = Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        payload.nextVisitDays = undefined;
      }
      const res = await fetch(`/api/patients/${patientId}/visits/${visit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update visit");
      }
      handleClose();
      onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update visit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={handleClose} />

      <div
        className="relative z-10 w-full max-w-[600px] max-h-[90vh] flex flex-col rounded-[6px] border border-[#e5edf5] bg-white animate-in fade-in zoom-in-95 duration-200"
        style={{
          boxShadow:
            "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5edf5]">
          <h2 className="text-[18px] font-light text-[#061b31]">Edit Visit</h2>
          <button
            onClick={handleClose}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 hover:rotate-90 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
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
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Visit Date</label>
                  <input
                    type="date"
                    value={form.visitDate || ""}
                    onChange={(e) => updateField("visitDate", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Visit Type</label>
                  <select
                    value={form.visitType || "FOLLOW_UP"}
                    onChange={(e) => updateField("visitType", e.target.value as CreateVisitData["visitType"])}
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
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Chief Complaint</label>
                <input
                  type="text"
                  value={form.chiefComplaint || ""}
                  onChange={(e) => updateField("chiefComplaint", e.target.value)}
                  placeholder="e.g. Lower back pain radiating to left leg"
                  className={inputClass}
                />
              </div>
            </div>
          )}

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
                  className="h-4 w-4 rounded border-[#e5edf5] text-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                  style={{ accentColor: "#533afd" }}
                />
                <span className="text-[13px] text-[#273951]">Record recovery questionnaire for this visit</span>
              </label>
              {!questionnaireEnabled && (
                <p className="text-[13px] text-[#64748d] italic pl-6">
                  Questionnaire is skipped for this visit.
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
                    <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Patient Comments</label>
                    <textarea
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

          <SectionHeader
            icon={FileText}
            title="SOAP Notes"
            expanded={sections.soap}
            onToggle={() => toggleSection("soap")}
          />
          {sections.soap && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Subjective</label>
                <textarea
                  value={form.subjective || ""}
                  onChange={(e) => updateField("subjective", e.target.value)}
                  placeholder="Patient's description of symptoms..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Objective</label>
                <textarea
                  value={form.objective || ""}
                  onChange={(e) => updateField("objective", e.target.value)}
                  placeholder="Clinical findings, observations, exam results..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Assessment</label>
                <textarea
                  value={form.assessment || ""}
                  onChange={(e) => updateField("assessment", e.target.value)}
                  placeholder="Diagnosis, differential diagnosis..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Plan</label>
                <textarea
                  value={form.plan || ""}
                  onChange={(e) => updateField("plan", e.target.value)}
                  placeholder="Treatment plan, follow-up actions..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
            </div>
          )}

          <SectionHeader
            icon={Stethoscope}
            title="Treatment Details"
            expanded={sections.treatment}
            onToggle={() => toggleSection("treatment")}
          />
          {sections.treatment && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Areas Adjusted</label>
                <input
                  type="text"
                  value={form.areasAdjusted || ""}
                  onChange={(e) => updateField("areasAdjusted", e.target.value)}
                  placeholder="e.g. C5, T4, L3, SI joint"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Technique Used</label>
                <select
                  value={form.techniqueUsed || ""}
                  onChange={(e) => updateField("techniqueUsed", e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select technique...</option>
                  {TECHNIQUES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Subluxation Findings</label>
                <textarea
                  value={form.subluxationFindings || ""}
                  onChange={(e) => updateField("subluxationFindings", e.target.value)}
                  placeholder="Subluxation findings and listings..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Treatment Notes</label>
                <textarea
                  value={form.treatmentNotes || ""}
                  onChange={(e) => updateField("treatmentNotes", e.target.value)}
                  placeholder="Additional treatment notes..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
            </div>
          )}

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
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">BP Systolic</label>
                  <input
                    type="number"
                    value={form.bloodPressureSys ?? ""}
                    onChange={(e) => updateField("bloodPressureSys", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="120"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">BP Diastolic</label>
                  <input
                    type="number"
                    value={form.bloodPressureDia ?? ""}
                    onChange={(e) => updateField("bloodPressureDia", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="80"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Heart Rate</label>
                  <input
                    type="number"
                    value={form.heartRate ?? ""}
                    onChange={(e) => updateField("heartRate", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="72"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.weight ?? ""}
                    onChange={(e) => updateField("weight", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="75"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Temp (C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.temperature ?? ""}
                    onChange={(e) => updateField("temperature", e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="36.5"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          <SectionHeader
            icon={MessageSquare}
            title="Recommendations"
            expanded={sections.recommendations}
            onToggle={() => toggleSection("recommendations")}
          />
          {sections.recommendations && (
            <div className="space-y-3 pb-3 pl-1">
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Recommendations</label>
                <textarea
                  value={form.recommendations || ""}
                  onChange={(e) => updateField("recommendations", e.target.value)}
                  placeholder="Home care instructions, exercises..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Referrals</label>
                <textarea
                  value={form.referrals || ""}
                  onChange={(e) => updateField("referrals", e.target.value)}
                  placeholder="Specialist referrals if any..."
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Next Visit Date</label>
                <input
                  type="date"
                  value={nextVisitDate}
                  onChange={(e) => setNextVisitDate(e.target.value)}
                  className={inputClass}
                />
                {nextVisitDate && (
                  <p className="mt-1 text-[12px] text-[#64748d]">
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

          {submitError && (
            <div className="flex items-center gap-2 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2 text-[13px] text-[#DF1B41]">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {submitError}
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5edf5]">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            onClick={handleSubmit}
            className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

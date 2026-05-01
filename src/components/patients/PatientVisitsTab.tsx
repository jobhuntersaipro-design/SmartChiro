"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Loader2, ChevronDown, ChevronUp, Calendar,
  Pencil, Trash2, Image, FileText, Activity, Stethoscope,
  MessageSquare, ArrowUpDown, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecoveryScoreBar } from "@/components/patients/RecoveryScoreBar";
import { CreateVisitDialog } from "@/components/patients/CreateVisitDialog";
import { EditVisitDialog } from "@/components/patients/EditVisitDialog";
import { DeleteVisitDialog } from "@/components/patients/DeleteVisitDialog";
import { ExternalLink } from "@/components/patients/ExternalLink";
import { buildDoctorHref, formatAppointmentDateTime, getAppointmentWeekday } from "@/lib/format";
import type { Visit } from "@/types/visit";

interface PatientVisitsTabProps {
  patientId: string;
}

// ─── Visit type badge config ───

const VISIT_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  initial: { label: "Initial", bg: "bg-[#ededfc]", text: "text-[#533afd]", border: "#533afd" },
  follow_up: { label: "Follow-up", bg: "bg-[rgba(5,112,222,0.1)]", text: "text-[#0570DE]", border: "#0570DE" },
  emergency: { label: "Emergency", bg: "bg-[#FDE8EC]", text: "text-[#DF1B41]", border: "#DF1B41" },
  reassessment: { label: "Reassessment", bg: "bg-[#FFF8E1]", text: "text-[#9b6829]", border: "#9b6829" },
  discharge: { label: "Discharge", bg: "bg-[#E8F5E8]", text: "text-[#30B130]", border: "#30B130" },
};

function getVisitConfig(type: string | null) {
  return VISIT_TYPE_CONFIG[type || "follow_up"] || VISIT_TYPE_CONFIG.follow_up;
}

function VisitTypeBadge({ type }: { type: string | null }) {
  const config = getVisitConfig(type);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

function WeekdayBadge({ label, isWeekend }: { label: string; isWeekend: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] px-1 py-px text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
      style={{
        background: isWeekend ? "#fef3c7" : "#f1f5f9",
        color: isWeekend ? "#854d0e" : "#475569",
      }}
    >
      {label}
    </span>
  );
}

function VisitDateCell({ iso }: { iso: string }) {
  const dow = getAppointmentWeekday(iso);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {dow && <WeekdayBadge label={dow.label} isWeekend={dow.isWeekend} />}
      <time dateTime={iso} className="text-[14px] font-medium text-[#061b31] tabular-nums">
        {formatAppointmentDateTime(iso)}
      </time>
    </span>
  );
}

// ─── Loading Skeleton ───

function VisitSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-[6px] border border-[#e5edf5] bg-white p-4"
          style={{ borderLeft: "4px solid #e5edf5" }}
        >
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-4 w-24 rounded bg-[#e5edf5]" />
            <div className="h-5 w-16 rounded-full bg-[#e5edf5]" />
            <div className="h-4 w-28 rounded bg-[#e5edf5]" />
            <div className="flex-1" />
            <div className="h-4 w-40 rounded bg-[#e5edf5]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full mb-4"
        style={{ backgroundColor: "#ededfc" }}
      >
        <FileText className="h-6 w-6 text-[#533afd]" strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-medium text-[#061b31] mb-1">No visits yet</h3>
      <p className="text-[14px] text-[#64748d] mb-4 max-w-xs">
        Record the first visit to start tracking this patient&apos;s treatment history.
      </p>
      <Button
        onClick={onAdd}
        className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4]"
      >
        <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
        Add First Visit
      </Button>
    </div>
  );
}

// ─── Visit Card ───

function VisitCard({
  visit,
  patientId,
  onEdit,
  onDelete,
}: {
  visit: Visit;
  patientId: string;
  onEdit: (visit: Visit) => void;
  onDelete: (visit: Visit) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = getVisitConfig(visit.visitType);
  const q = visit.questionnaire;

  // Compute a single recovery score if questionnaire exists
  const recoveryScore = q
    ? Math.round(((10 - q.painLevel) + q.mobilityScore + q.sleepQuality + q.dailyFunction + q.overallImprovement) / 5)
    : null;

  // Parse areas adjusted into tags
  const areaTags = visit.areasAdjusted
    ? visit.areasAdjusted.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white transition-shadow duration-200 hover:shadow-sm"
      style={{ borderLeft: `4px solid ${config.border}` }}
    >
      {/* Collapsed Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Date */}
        <VisitDateCell iso={visit.visitDate} />

        {/* Visit Type Badge */}
        <VisitTypeBadge type={visit.visitType} />

        {/* Doctor */}
        <span
          className="text-[13px] whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {visit.doctor.id && visit.doctor.name ? (
            <ExternalLink href={buildDoctorHref(visit.doctor.id)}>
              Dr. {visit.doctor.name}
            </ExternalLink>
          ) : (
            <span className="text-[#64748d]">Dr. {visit.doctor.name || "Unknown"}</span>
          )}
        </span>

        {/* Chief Complaint (truncated) */}
        {visit.chiefComplaint && (
          <span className="text-[13px] text-[#273951] truncate flex-1 min-w-0">
            {visit.chiefComplaint}
          </span>
        )}
        {!visit.chiefComplaint && <span className="flex-1" />}

        {/* Recovery Score Pill */}
        {recoveryScore !== null && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
            style={{
              backgroundColor:
                recoveryScore >= 7 ? "#E8F5E8" : recoveryScore >= 4 ? "#FFF8E1" : "#FDE8EC",
              color:
                recoveryScore >= 7 ? "#30B130" : recoveryScore >= 4 ? "#9b6829" : "#DF1B41",
            }}
          >
            Score: {recoveryScore}/10
          </span>
        )}

        {/* Area tags (max 3 on collapsed) */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          {areaTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#f6f9fc] text-[#273951] border border-[#e5edf5]"
            >
              {tag}
            </span>
          ))}
          {areaTags.length > 3 && (
            <span className="text-[11px] text-[#64748d]">+{areaTags.length - 3}</span>
          )}
        </div>

        {/* Expand icon */}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[#64748d] flex-shrink-0" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#64748d] flex-shrink-0" strokeWidth={1.5} />
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-[#e5edf5]">
          {/* 1. Recovery Questionnaire */}
          {q && (
            <div className="pt-4">
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-3">
                <Activity className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                Recovery Questionnaire
              </h4>
              <div className="grid grid-cols-5 gap-3">
                <RecoveryScoreBar label="Pain" score={q.painLevel} inverted />
                <RecoveryScoreBar label="Mobility" score={q.mobilityScore} />
                <RecoveryScoreBar label="Sleep" score={q.sleepQuality} />
                <RecoveryScoreBar label="Function" score={q.dailyFunction} />
                <RecoveryScoreBar label="Overall" score={q.overallImprovement} />
              </div>
              {q.patientComments && (
                <p className="mt-2 text-[13px] text-[#64748d] italic">
                  &ldquo;{q.patientComments}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* 2. SOAP Notes */}
          {(visit.subjective || visit.objective || visit.assessment || visit.plan) && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-3">
                <FileText className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                SOAP Notes
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "S", label: "Subjective", value: visit.subjective },
                  { key: "O", label: "Objective", value: visit.objective },
                  { key: "A", label: "Assessment", value: visit.assessment },
                  { key: "P", label: "Plan", value: visit.plan },
                ].map(
                  (item) =>
                    item.value && (
                      <div key={item.key} className="rounded-[4px] bg-[#f6f9fc] p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-[3px] bg-[#533afd] text-[11px] font-bold text-white">
                            {item.key}
                          </span>
                          <span className="text-[12px] font-medium text-[#64748d]">{item.label}</span>
                        </div>
                        <p className="text-[13px] text-[#273951] leading-relaxed whitespace-pre-wrap">
                          {item.value}
                        </p>
                      </div>
                    )
                )}
              </div>
            </div>
          )}

          {/* 3. Treatment Details */}
          {(visit.chiefComplaint || visit.areasAdjusted || visit.techniqueUsed || visit.subluxationFindings) && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-3">
                <Stethoscope className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                Treatment Details
              </h4>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <VisitTypeBadge type={visit.visitType} />
                  {visit.techniqueUsed && (
                    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium bg-[#f6f9fc] text-[#273951] border border-[#e5edf5]">
                      {visit.techniqueUsed}
                    </span>
                  )}
                </div>
                {visit.chiefComplaint && (
                  <p className="text-[13px] text-[#273951]">
                    <span className="font-medium text-[#64748d]">Chief Complaint: </span>
                    {visit.chiefComplaint}
                  </p>
                )}
                {areaTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[13px] font-medium text-[#64748d] mr-1">Areas: </span>
                    {areaTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-2.5 py-0.5 text-[12px] font-medium bg-[#ededfc] text-[#533afd]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {visit.subluxationFindings && (
                  <p className="text-[13px] text-[#273951]">
                    <span className="font-medium text-[#64748d]">Subluxation Findings: </span>
                    {visit.subluxationFindings}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 4. Vitals */}
          {(visit.bloodPressureSys || visit.heartRate || visit.weight || visit.temperature) && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-2">
                <Activity className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                Vitals
              </h4>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#273951]">
                {visit.bloodPressureSys && visit.bloodPressureDia && (
                  <span>
                    <span className="font-medium text-[#64748d]">BP: </span>
                    {visit.bloodPressureSys}/{visit.bloodPressureDia} mmHg
                  </span>
                )}
                {visit.heartRate && (
                  <span>
                    <span className="font-medium text-[#64748d]">HR: </span>
                    {visit.heartRate} bpm
                  </span>
                )}
                {visit.weight && (
                  <span>
                    <span className="font-medium text-[#64748d]">Weight: </span>
                    {visit.weight} kg
                  </span>
                )}
                {visit.temperature && (
                  <span>
                    <span className="font-medium text-[#64748d]">Temp: </span>
                    {visit.temperature}&deg;C
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 5. Recommendations */}
          {(visit.recommendations || visit.referrals || visit.nextVisitDays) && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-2">
                <MessageSquare className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                Recommendations
              </h4>
              <div className="space-y-1.5 text-[13px] text-[#273951]">
                {visit.recommendations && (
                  <p className="whitespace-pre-wrap">{visit.recommendations}</p>
                )}
                {visit.referrals && (
                  <p>
                    <span className="font-medium text-[#64748d]">Referrals: </span>
                    {visit.referrals}
                  </p>
                )}
                {visit.nextVisitDays != null && (
                  <p className="text-[#533afd] font-medium">
                    Next visit: {(() => {
                      const base = new Date(visit.visitDate);
                      base.setDate(base.getDate() + visit.nextVisitDays!);
                      return base.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
                    })()}
                    {" "}({visit.nextVisitDays} day{visit.nextVisitDays !== 1 ? "s" : ""} later)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 6. Associated X-Rays */}
          {visit.xrays.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[14px] font-medium text-[#061b31] mb-2">
                <Image className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                Associated X-Rays
              </h4>
              <div className="grid grid-cols-4 gap-2">
                {visit.xrays.map((xray) => (
                  <Link
                    key={xray.id}
                    href={`/dashboard/xrays/${patientId}/${xray.id}/annotate`}
                    className="group relative rounded-[4px] border border-[#e5edf5] overflow-hidden transition-all duration-200 hover:border-[#533afd] hover:shadow-sm"
                  >
                    {xray.thumbnailUrl ? (
                      <img
                        src={xray.thumbnailUrl}
                        alt={xray.title || "X-ray"}
                        className="w-full h-20 object-cover bg-[#1A1F36]"
                      />
                    ) : (
                      <div className="w-full h-20 bg-[#1A1F36] flex items-center justify-center">
                        <Image className="h-6 w-6 text-[#64748d]" strokeWidth={1} />
                      </div>
                    )}
                    <div className="px-2 py-1.5">
                      <p className="text-[11px] font-medium text-[#061b31] truncate">
                        {xray.title || "Untitled"}
                      </p>
                      {xray.bodyRegion && (
                        <p className="text-[10px] text-[#64748d]">{xray.bodyRegion}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 7. Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-[#e5edf5]">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(visit);
              }}
              className="rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc] text-[13px]"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(visit);
              }}
              className="rounded-[4px] border-[#e5edf5] text-[#DF1B41] hover:bg-[#FDE8EC] hover:border-[#DF1B41]/20 text-[13px]"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Options ───

const FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "initial", label: "Initial" },
  { value: "follow_up", label: "Follow-up" },
  { value: "emergency", label: "Emergency" },
  { value: "reassessment", label: "Reassessment" },
  { value: "discharge", label: "Discharge" },
];

// ─── Main Component ───

export function PatientVisitsTab({ patientId }: PatientVisitsTabProps) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("type", filterType);
      params.set("sort", sortNewest ? "newest" : "oldest");

      const res = await fetch(`/api/patients/${patientId}/visits?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load visits");
      }
      const data = await res.json();
      setVisits(data.visits || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load visits");
    } finally {
      setLoading(false);
    }
  }, [patientId, filterType, sortNewest]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  function handleEdit(visit: Visit) {
    setEditVisit(visit);
  }

  function handleDelete(visit: Visit) {
    setDeleteVisit(visit);
  }

  return (
    <div>
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748d] pointer-events-none" strokeWidth={1.5} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-8 rounded-[4px] border border-[#e5edf5] bg-white pl-8 pr-6 text-[13px] text-[#273951] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd]"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Toggle */}
          <button
            onClick={() => setSortNewest(!sortNewest)}
            className="flex items-center gap-1 h-8 px-2.5 rounded-[4px] border border-[#e5edf5] bg-white text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
            {sortNewest ? "Newest" : "Oldest"}
          </button>
        </div>

        {/* Add Visit Button */}
        <Button
          onClick={() => setCreateOpen(true)}
          className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4] text-[13px] h-8"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Add Visit
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <VisitSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-[14px] text-[#DF1B41] mb-2">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVisits}
            className="rounded-[4px] border-[#e5edf5] text-[#273951]"
          >
            Try again
          </Button>
        </div>
      ) : visits.length === 0 ? (
        <EmptyState onAdd={() => setCreateOpen(true)} />
      ) : (
        <div className="space-y-3">
          {visits.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              patientId={patientId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Visit Dialog */}
      <CreateVisitDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        patientId={patientId}
        onCreated={fetchVisits}
      />

      <EditVisitDialog
        open={!!editVisit}
        onOpenChange={(open) => { if (!open) setEditVisit(null); }}
        patientId={patientId}
        visit={editVisit}
        onSaved={fetchVisits}
      />

      <DeleteVisitDialog
        open={!!deleteVisit}
        onOpenChange={(open) => { if (!open) setDeleteVisit(null); }}
        patientId={patientId}
        visit={deleteVisit}
        onDeleted={fetchVisits}
      />
    </div>
  );
}

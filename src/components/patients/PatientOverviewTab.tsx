"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  ClipboardList,
  Calendar,
  CreditCard,
  CalendarDays,
  User,
  Droplets,
  Briefcase,
  Users,
  Heart,
  Share2,
  Clock,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { ExternalLink } from "@/components/patients/ExternalLink";
import { PhoneLinks } from "@/components/patients/PhoneLinks";
import {
  formatDobWithAge,
  buildDoctorHref,
} from "@/lib/format";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import { RECOVERY_METRICS, directionHint, scoreTone, type ScoreTone } from "@/lib/recovery-scores";

interface PatientOverviewTabProps {
  patientId: string;
  patient: {
    icNumber: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    bloodType: string | null;
    occupation: string | null;
    race: string | null;
    maritalStatus: string | null;
    referralSource: string | null;
    createdAt: string;
    emergencyName: string | null;
    emergencyPhone: string | null;
    emergencyRelation: string | null;
    allergies: string | null;
    medicalHistory: string | null;
    notes: string | null;
  };
}

interface VisitItem {
  id: string;
  visitDate: string;
  visitType: string | null;
  chiefComplaint: string | null;
  questionnaire: {
    overallImprovement: number;
  } | null;
  doctor: { id: string; name: string | null };
}

interface AppointmentItem {
  id: string;
  dateTime: string;
  duration: number;
  status: string;
  doctor: { id: string; name: string | null };
}

const visitTypeColors: Record<string, { bg: string; text: string }> = {
  initial: { bg: "bg-[rgba(83,58,253,0.12)]", text: "text-brand" },
  follow_up: { bg: "bg-[rgba(5,112,222,0.12)]", text: "text-info" },
  emergency: { bg: "bg-[rgba(223,27,65,0.12)]", text: "text-danger" },
  reassessment: { bg: "bg-[rgba(245,166,35,0.12)]", text: "text-warning" },
  discharge: { bg: "bg-[rgba(48,177,48,0.12)]", text: "text-success" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "bg-[rgba(83,58,253,0.12)]", text: "text-brand" },
  CHECKED_IN: { bg: "bg-[rgba(48,177,48,0.12)]", text: "text-success" },
  IN_PROGRESS: { bg: "bg-[rgba(5,112,222,0.12)]", text: "text-info" },
  COMPLETED: { bg: "bg-[rgba(48,177,48,0.15)]", text: "text-success" },
  CANCELLED: { bg: "bg-surface-hover", text: "text-fg-secondary" },
  NO_SHOW: { bg: "bg-[rgba(223,27,65,0.12)]", text: "text-danger" },
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatVisitType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SCORE_PILL: Record<ScoreTone, { bg: string; text: string }> = {
  good: { bg: "bg-[rgba(48,177,48,0.12)]", text: "text-success" },
  fair: { bg: "bg-[rgba(245,166,35,0.12)]", text: "text-warning" },
  poor: { bg: "bg-[rgba(223,27,65,0.12)]", text: "text-danger" },
};

/** Pill colours for the overall-improvement score (higher is better). */
function getScoreColor(score: number): { bg: string; text: string } {
  return SCORE_PILL[scoreTone(score, RECOVERY_METRICS.overallImprovement.direction)];
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="px-5 py-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 bg-border animate-pulse rounded" />
      ))}
    </div>
  );
}

function Sparkline({ visits }: { visits: VisitItem[] }) {
  const points = visits
    .filter((v) => v.questionnaire)
    .map((v) => ({
      date: v.visitDate,
      score: v.questionnaire!.overallImprovement,
    }))
    .reverse(); // oldest first for left-to-right

  if (points.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <TrendingUp className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
        <p className="text-[14px] text-fg-secondary">No recovery data yet</p>
      </div>
    );
  }

  const width = 480;
  const height = 160;
  const padX = 40;
  const padTop = 16;
  const padBottom = 28;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padX + i * xStep,
    y: padTop + chartH - (p.score / 10) * chartH,
    ...p,
  }));

  const pathD =
    coords.length === 1
      ? ""
      : coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  // Y-axis grid lines at 0, 2.5, 5, 7.5, 10
  const gridValues = [0, 2.5, 5, 7.5, 10];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {gridValues.map((val) => {
        const y = padTop + chartH - (val / 10) * chartH;
        return (
          <g key={val}>
            <line
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="#e5edf5"
              strokeWidth={1}
            />
            <text
              x={padX - 8}
              y={y + 4}
              textAnchor="end"
              className="text-[10px]"
              fill="#64748d"
            >
              {val % 1 === 0 ? val : ""}
            </text>
          </g>
        );
      })}

      {/* Line */}
      {coords.length > 1 && (
        <path d={pathD} fill="none" stroke="#533afd" strokeWidth={2} strokeLinejoin="round" />
      )}

      {/* Dots */}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={4} fill="#533afd" />
      ))}

      {/* X-axis labels */}
      {coords.map((c, i) => (
        <text
          key={i}
          x={c.x}
          y={height - 4}
          textAnchor="middle"
          className="text-[9px]"
          fill="#64748d"
        >
          {new Date(c.date).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", day: "numeric" })}
        </text>
      ))}
    </svg>
  );
}

export function PatientOverviewTab({ patientId, patient }: PatientOverviewTabProps) {
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [loadingAppts, setLoadingAppts] = useState(true);

  useEffect(() => {
    fetch(`/api/patients/${patientId}/visits?limit=10`)
      .then((r) => r.json())
      .then((data) => setVisits(data.visits ?? []))
      .catch(() => setVisits([]))
      .finally(() => setLoadingVisits(false));

    fetch(`/api/patients/${patientId}/appointments?upcoming=true&limit=3`)
      .then((r) => r.json())
      .then((data) => setAppointments(data.appointments ?? []))
      .catch(() => setAppointments([]))
      .finally(() => setLoadingAppts(false));
  }, [patientId]);

  const recentVisits = visits.slice(0, 5);

  const hasEmergencyContact = !!patient.emergencyName;
  const hasMedicalAlerts =
    !!patient.allergies || !!patient.medicalHistory || !!patient.notes;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Left column */}
      <div className="space-y-6">
        {/* Recovery Trend */}
        <div className="rounded-panel border border-border bg-white">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand" strokeWidth={1.5} />
              <h2 className="text-[15px] font-medium text-foreground">Recovery Trend</h2>
              <span className="ml-auto text-[12px] text-fg-secondary">
                Overall improvement · {directionHint(RECOVERY_METRICS.overallImprovement.direction).toLowerCase()}
              </span>
            </div>
          </div>
          {loadingVisits ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <div className="px-5 py-4">
              <Sparkline visits={visits} />
            </div>
          )}
        </div>

        {/* Recent Visits */}
        <div className="rounded-panel border border-border bg-white">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-info" strokeWidth={1.5} />
              <h2 className="text-[15px] font-medium text-foreground">Recent Visits</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {loadingVisits ? (
              <LoadingSkeleton />
            ) : recentVisits.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <ClipboardList className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
                <p className="text-[14px] text-fg-secondary">No visits recorded yet</p>
              </div>
            ) : (
              recentVisits.map((v) => {
                const typeColors = v.visitType
                  ? visitTypeColors[v.visitType] ?? { bg: "bg-surface-hover", text: "text-fg-secondary" }
                  : null;
                const score = v.questionnaire?.overallImprovement;
                const scoreColor = score != null ? getScoreColor(score) : null;

                return (
                  <div
                    key={v.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-[13px] text-fg-secondary w-16 shrink-0">
                      {formatShortDate(v.visitDate)}
                    </span>
                    {typeColors && v.visitType && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${typeColors.bg} ${typeColors.text}`}
                      >
                        {formatVisitType(v.visitType)}
                      </span>
                    )}
                    <span className="text-[14px] text-foreground truncate flex-1 min-w-0">
                      {v.chiefComplaint ?? "\u2014"}
                    </span>
                    {scoreColor && score != null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${scoreColor.bg} ${scoreColor.text}`}
                      >
                        {score}/10
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="rounded-panel border border-border bg-white">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-warning" strokeWidth={1.5} />
              <h2 className="text-[15px] font-medium text-foreground">Upcoming Appointments</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {loadingAppts ? (
              <LoadingSkeleton />
            ) : appointments.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Calendar className="h-8 w-8 mx-auto text-border mb-2" strokeWidth={1} />
                <p className="text-[14px] text-fg-secondary">No upcoming appointments</p>
              </div>
            ) : (
              appointments.map((a) => {
                const colors = statusColors[a.status] ?? statusColors.SCHEDULED;
                const doctorName = a.doctor.name ?? "Unknown Doctor";
                return (
                  <div
                    key={a.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-[13px] text-foreground w-32 shrink-0">
                      {formatDateTime(a.dateTime)}
                    </span>
                    <span className="text-[14px] truncate flex-1 min-w-0">
                      {a.doctor.id ? (
                        <ExternalLink href={buildDoctorHref(a.doctor.id)}>
                          {doctorName}
                        </ExternalLink>
                      ) : (
                        <span className="text-foreground">{doctorName}</span>
                      )}
                    </span>
                    <span className="text-[13px] text-fg-secondary shrink-0">{a.duration}min</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${colors.bg} ${colors.text}`}
                    >
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        {/* Quick Info */}
        <div className="rounded-panel border border-border bg-white px-5 py-4">
          <h3 className="text-[15px] font-medium text-foreground mb-3">Quick Info</h3>
          <div className="space-y-2.5">
            {patient.icNumber && (
              <InfoRow icon={CreditCard} label="IC Number" value={patient.icNumber} />
            )}
            {patient.dateOfBirth && (
              <InfoRow
                icon={CalendarDays}
                label="Date of Birth"
                value={formatDobWithAge(patient.dateOfBirth) ?? "-"}
              />
            )}
            {patient.gender && (
              <InfoRow icon={User} label="Gender" value={patient.gender} />
            )}
            {patient.bloodType && (
              <InfoRow icon={Droplets} label="Blood Type" value={patient.bloodType} />
            )}
            {patient.occupation && (
              <InfoRow icon={Briefcase} label="Occupation" value={patient.occupation} />
            )}
            {patient.race && (
              <InfoRow icon={Users} label="Race" value={patient.race} />
            )}
            {patient.maritalStatus && (
              <InfoRow icon={Heart} label="Marital Status" value={patient.maritalStatus} />
            )}
            {patient.referralSource && (
              <InfoRow icon={Share2} label="Referral Source" value={patient.referralSource} />
            )}
            <InfoRow
              icon={Clock}
              label="Member Since"
              value={new Date(patient.createdAt).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
                month: "long",
                year: "numeric",
              })}
            />
          </div>
        </div>

        {/* Emergency Contact */}
        {hasEmergencyContact && (
          <div className="rounded-panel border border-border bg-white px-5 py-4">
            <h3 className="text-[15px] font-medium text-foreground mb-3">Emergency Contact</h3>
            <div className="space-y-2.5">
              <InfoRow icon={User} label="Name" value={patient.emergencyName!} />
              {patient.emergencyPhone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-fg-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] text-fg-secondary shrink-0 w-20">Phone</span>
                  <PhoneLinks
                    phone={patient.emergencyPhone}
                    name={patient.emergencyName || "emergency contact"}
                    textClassName="text-[13px] text-foreground"
                    className="-my-1"
                  />
                </div>
              )}
              {patient.emergencyRelation && (
                <InfoRow icon={Users} label="Relationship" value={patient.emergencyRelation} />
              )}
            </div>
          </div>
        )}

        {/* Medical Alerts */}
        {hasMedicalAlerts && (
          <div
            className={`rounded-panel border border-border bg-white px-5 py-4 ${
              patient.allergies
                ? "border-l-4 border-l-danger"
                : patient.medicalHistory
                  ? "border-l-4 border-l-warning"
                  : ""
            }`}
          >
            <h3 className="text-[15px] font-medium text-foreground mb-3">Medical Alerts</h3>
            <div className="space-y-3">
              {patient.allergies && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-danger" strokeWidth={1.5} />
                    <span className="text-[13px] font-medium text-danger">Allergies</span>
                  </div>
                  <p className="text-[13px] text-foreground ml-5.5">{patient.allergies}</p>
                </div>
              )}
              {patient.medicalHistory && (
                <div>
                  <span className="text-[13px] font-medium text-foreground">Medical History</span>
                  <p className="text-[13px] text-fg-secondary mt-0.5">{patient.medicalHistory}</p>
                </div>
              )}
              {patient.notes && (
                <div>
                  <span className="text-[13px] font-medium text-foreground">Clinical Notes</span>
                  <p className="text-[13px] text-fg-secondary mt-0.5">{patient.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-fg-secondary mt-0.5 shrink-0" strokeWidth={1.5} />
      <span className="text-[13px] text-fg-secondary shrink-0 w-20">{label}</span>
      <span className="text-[13px] text-foreground">{value}</span>
    </div>
  );
}

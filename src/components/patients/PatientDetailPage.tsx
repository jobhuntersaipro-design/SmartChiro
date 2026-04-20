"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  CalendarCheck,
  ImageIcon,
  TrendingUp,
  Mail,
  Phone,
  User,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Patient } from "@/types/patient";
import { EditPatientDialog } from "@/components/patients/EditPatientDialog";
import { DeletePatientDialog } from "@/components/patients/DeletePatientDialog";
import { PatientOverviewTab } from "@/components/patients/PatientOverviewTab";
import { PatientVisitsTab } from "@/components/patients/PatientVisitsTab";
import { PatientXraysTab } from "@/components/patients/PatientXraysTab";
import { PatientProfileTab } from "@/components/patients/PatientProfileTab";

interface PatientDetailPageProps {
  patientId: string;
  currentUserId: string;
}

interface PatientDetail extends Patient {
  branchName: string;
  recoveryTrend: number | null;
  nextAppointment: string | null;
  visitsByType: Record<string, number>;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "visits", label: "Visits" },
  { id: "xrays", label: "X-Rays" },
  { id: "profile", label: "Profile" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return "PT";
}

function formatAge(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return `${age}y`;
}

function formatGender(gender: string | null): string | null {
  if (!gender) return null;
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let classes = "bg-[#F0F3F7] text-[#64748d]";
  if (lower === "active") {
    classes = "bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)]";
  } else if (lower === "inactive") {
    classes = "bg-[rgba(245,166,35,0.2)] text-[#b57a14] border border-[rgba(245,166,35,0.4)]";
  } else if (lower === "discharged") {
    classes = "bg-[#F0F3F7] text-[#64748d] border border-[#e5edf5]";
  }
  return (
    <span className={`rounded-[4px] px-[8px] py-[2px] text-[11px] font-light ${classes}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function PatientDetailPage({ patientId, currentUserId }: PatientDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "overview";

  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchPatient = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/patients/${patientId}?include=detail`);
      if (res.ok) {
        const data = await res.json();
        setPatient(data.patient ?? null);
      } else if (res.status === 404) {
        setPatient(null);
      } else {
        setError("Failed to load patient details.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/dashboard/patients/${patientId}/details?tab=${tab}`, { scroll: false });
  }

  async function handleSave(pid: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/patients/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update patient");
    await fetchPatient();
  }

  async function handleDelete(pid: string) {
    const res = await fetch(`/api/patients/${pid}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete patient");
    router.push("/dashboard/patients");
  }

  async function handleToggleStatus() {
    if (!patient) return;
    const newStatus = patient.status.toLowerCase() === "active" ? "INACTIVE" : "ACTIVE";
    const res = await fetch(`/api/patients/${patientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      await fetchPatient();
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-28 rounded bg-[#e5edf5] animate-pulse" />
        <div className="h-32 rounded-[6px] bg-[#e5edf5] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-[6px] bg-[#e5edf5] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-12 text-center">
        <User className="h-12 w-12 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">{error}</p>
        <Link href="/dashboard/patients" className="text-[14px] text-[#533afd] hover:underline mt-2 inline-block">
          Back to Patients
        </Link>
      </div>
    );
  }

  // Not found state
  if (!patient) {
    return (
      <div className="py-12 text-center">
        <User className="h-12 w-12 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">Patient not found or you don&apos;t have access.</p>
        <Link href="/dashboard/patients" className="text-[14px] text-[#533afd] hover:underline mt-2 inline-block">
          Back to Patients
        </Link>
      </div>
    );
  }

  const initials = getInitials(patient.firstName, patient.lastName);
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const age = formatAge(patient.dateOfBirth);
  const gender = formatGender(patient.gender);
  const isActive = patient.status.toLowerCase() === "active";

  const statCards = [
    { label: "Total Visits", value: patient.totalVisits, icon: Users, color: "#533afd" },
    { label: "X-Rays", value: patient.totalXrays, icon: ImageIcon, color: "#0570DE" },
    {
      label: "Next Appointment",
      value: patient.nextAppointment
        ? new Date(patient.nextAppointment).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
        : "None",
      icon: CalendarCheck,
      color: "#30B130",
    },
    {
      label: "Recovery Trend",
      value: patient.recoveryTrend != null ? `${patient.recoveryTrend > 0 ? "+" : ""}${patient.recoveryTrend}%` : "N/A",
      icon: TrendingUp,
      color: "#F5A623",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/patients"
        className="inline-flex items-center gap-1.5 text-[14px] text-[#64748d] hover:text-[#061b31] transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Back to Patients
      </Link>

      {/* Header card */}
      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white px-6 py-5"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[16px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[23px] font-light text-[#061b31]">
                  {fullName}
                </h1>
                <StatusBadge status={patient.status} />
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-[14px] text-[#64748d]">
                {patient.icNumber && (
                  <span className="flex items-center gap-1.5">
                    IC: {patient.icNumber}
                  </span>
                )}
                {gender && (
                  <span>{gender}</span>
                )}
                {age && (
                  <span>{age}</span>
                )}
                {patient.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {patient.email}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-[13px] text-[#64748d]">
                {patient.doctorName && (
                  <span>
                    Doctor: <span className="text-[#273951]">{patient.doctorName}</span>
                  </span>
                )}
                {patient.branchName && (
                  <span>
                    Branch: <span className="text-[#273951]">{patient.branchName}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              className="h-9 rounded-[4px] text-[14px] border-[#e5edf5] gap-1.5"
              onClick={handleToggleStatus}
            >
              {isActive ? (
                <ToggleRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <ToggleLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
              {isActive ? "Deactivate" : "Activate"}
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-[4px] text-[14px] border-[#e5edf5] gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              Edit
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-[4px] text-[14px] border-[#e5edf5] gap-1.5 text-[#DF1B41] hover:text-[#DF1B41] hover:bg-red-50"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={1.5} />
              <span className="text-[13px] text-[#64748d]">{s.label}</span>
            </div>
            <div
              className="text-[22px] font-light text-[#061b31]"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-[#e5edf5]">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#533afd] text-[#533afd]"
                  : "border-transparent text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <PatientOverviewTab patientId={patientId} patient={patient} />
      )}
      {activeTab === "visits" && (
        <PatientVisitsTab patientId={patientId} />
      )}
      {activeTab === "xrays" && (
        <PatientXraysTab
          patientId={patientId}
          uploadedById={currentUserId}
          xrays={patient.xrays ?? []}
          onRefresh={fetchPatient}
        />
      )}
      {activeTab === "profile" && (
        <PatientProfileTab patient={patient} />
      )}

      {/* Dialogs */}
      <EditPatientDialog
        patient={patient}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSave}
      />
      <DeletePatientDialog
        patient={patient}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDelete={handleDelete}
      />
    </div>
  );
}

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
  User,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Receipt,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { BranchRole } from "@prisma/client";
import type { Patient } from "@/types/patient";
import { EditPatientDialog } from "@/components/patients/EditPatientDialog";
import { DeletePatientDialog } from "@/components/patients/DeletePatientDialog";
import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { PatientOverviewTab } from "@/components/patients/PatientOverviewTab";
import { PatientHistoryTab } from "@/components/patients/PatientHistoryTab";
import { PatientXraysTab } from "@/components/patients/PatientXraysTab";
import { PatientProfileTab } from "@/components/patients/PatientProfileTab";
import { PatientCareTab, canViewPatientPackages } from "@/components/packages/PatientCareTab";
import { ExternalLink } from "@/components/patients/ExternalLink";
import { PhoneLinks } from "@/components/patients/PhoneLinks";
import {
  buildMailtoUrl,
  buildDoctorHref,
  buildBranchHref,
  formatDobWithAge,
  formatAppointmentDateTime,
} from "@/lib/format";
import { replaceUrl } from "@/lib/url-state";
import { can } from "@/lib/permissions";
import { billingAccess } from "@/lib/billing-access";
import { isMalaysianPatient } from "@/lib/invoices";
import { PatientInvoicesPanel } from "@/components/invoices/PatientInvoicesPanel";
import { PatientBalanceChip } from "@/components/invoices/PatientBalanceChip";

interface PatientDetailPageProps {
  patientId: string;
  branchRole: BranchRole | null;
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
  { id: "history", label: "History" },
  { id: "xrays", label: "X-Rays" },
  { id: "care", label: "Care & packages" },
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Billing" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Backwards-compat: existing deep-links use ?tab=visits. Map them to the new
// `history` top-level tab + `visits` sub-tab so old bookmarks still land in
// the right place.
function resolveInitialTab(raw: string | null): TabId {
  if (raw === "visits") return "history";
  if (raw === "history" || raw === "overview" || raw === "xrays" || raw === "profile" || raw === "care" || raw === "billing") {
    return raw;
  }
  return "overview";
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return "PT";
}

function formatGender(gender: string | null): string | null {
  if (!gender) return null;
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
}

function StatusBadge({ status }: { status: string }) {
  // Dot + colored text — consistent with patients table.
  const lower = status.toLowerCase();
  const config: Record<string, { text: string; dot: string; label: string }> = {
    active:     { text: "#15803d", dot: "#22c55e", label: "Active"     },
    inactive:   { text: "#854d0e", dot: "#eab308", label: "Inactive"   },
    discharged: { text: "#585858", dot: "#7d7d7d", label: "Discharged" },
  };
  const c = config[lower] ?? { text: "#585858", dot: "#7d7d7d", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

export function PatientDetailPage({ patientId, branchRole, currentUserId }: PatientDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Front desk sees demographics and appointments only (no visits / X-rays).
  const clinical = can(branchRole, "clinical.read");
  // Billing tab: whoever issues invoices and takes payment in the patient's branch.
  const canBill = billingAccess(branchRole).manage;
  const requestedTab: TabId = resolveInitialTab(searchParams.get("tab"));
  // Front desk also sees packages (no care plans — those are clinical) and
  // billing; billing needs invoice.manage.
  const nonClinicalTabs: readonly TabId[] = ["history", "care", "profile", "billing"];
  const tabAllowed = (id: TabId) => (clinical || nonClinicalTabs.includes(id)) && (id !== "billing" || canBill);
  const initialTab: TabId = tabAllowed(requestedTab) ? requestedTab : clinical ? "overview" : "history";

  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createAppointmentOpen, setCreateAppointmentOpen] = useState(false);
  // Bumped after booking so the tabs re-fetch (a full reload would drop the booking toast).
  const [bookingVersion, setBookingVersion] = useState(0);
  // Header balance refresh + header "New invoice" → Billing tab's dialog.
  const [billingKey, setBillingKey] = useState(0);
  const [newInvoiceRequested, setNewInvoiceRequested] = useState(false);
  const handleNewInvoiceRequest = useCallback(() => setNewInvoiceRequested(false), []);

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
    // History is split into Visits/Appointments sub-tabs — default to Visits
    // so the old "Visits" landing experience is preserved (legacy ?tab=visits
    // also resolves to History/Visits).
    const sub = tab === "history" ? "&sub=visits" : "";
    replaceUrl(`/dashboard/patients/${patientId}/details?tab=${tab}${sub}`);
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
        <div className="h-5 w-28 rounded bg-border animate-pulse" />
        <div className="h-32 rounded-panel bg-border animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-panel bg-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-12 text-center">
        <User className="h-12 w-12 mx-auto text-border mb-3" strokeWidth={1} />
        <p className="text-[15px] text-fg-secondary">{error}</p>
        <Link href="/dashboard/patients" className="text-[14px] text-brand hover:underline mt-2 inline-block">
          Back to Patients
        </Link>
      </div>
    );
  }

  // Not found state
  if (!patient) {
    return (
      <div className="py-12 text-center">
        <User className="h-12 w-12 mx-auto text-border mb-3" strokeWidth={1} />
        <p className="text-[15px] text-fg-secondary">Patient not found or you don&apos;t have access.</p>
        <Link href="/dashboard/patients" className="text-[14px] text-brand hover:underline mt-2 inline-block">
          Back to Patients
        </Link>
      </div>
    );
  }

  const showCareTab = canViewPatientPackages(branchRole, patient.doctorId, currentUserId);
  const visibleTabs = TABS.filter(
    (t) => tabAllowed(t.id) && (t.id !== "care" || showCareTab),
  ).map((t) => (t.id === "care" && !clinical ? { ...t, label: "Packages" } : t));
  const initials = getInitials(patient.firstName, patient.lastName);
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const dobDisplay = formatDobWithAge(patient.dateOfBirth);
  const gender = formatGender(patient.gender);
  const isActive = patient.status.toLowerCase() === "active";
  const mailtoHref = buildMailtoUrl(patient.email);

  const allStatCards = [
    { label: "Total Visits", value: patient.totalVisits, icon: Users, color: "#7747ff" },
    { label: "X-Rays", value: patient.totalXrays, icon: ImageIcon, color: "#0570DE" },
    {
      label: "Next Appointment",
      value: patient.nextAppointment
        ? formatAppointmentDateTime(patient.nextAppointment) ?? "None"
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
  const statCards = clinical
    ? allStatCards
    : allStatCards.filter((c) => c.label !== "X-Rays" && c.label !== "Recovery Trend");

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/patients"
        className="inline-flex items-center gap-1.5 text-[14px] text-fg-secondary hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Back to Patients
      </Link>

      {/* Header card */}
      <div
        className="rounded-panel border border-border bg-white px-6 py-5"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="bg-brand-subtle text-brand text-[16px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[23px] font-medium text-foreground">
                  {fullName}
                </h1>
                <StatusBadge status={patient.status} />
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-[14px] text-fg-secondary">
                {patient.icNumber && (
                  <span className="flex items-center gap-1.5">
                    IC: {patient.icNumber}
                  </span>
                )}
                {gender && (
                  <span>{gender}</span>
                )}
                {dobDisplay && (
                  <span>{dobDisplay}</span>
                )}
                {patient.phone && (
                  <PhoneLinks phone={patient.phone} name={fullName} textClassName="text-foreground" />
                )}
                {patient.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {mailtoHref ? (
                      <ExternalLink href={mailtoHref}>{patient.email}</ExternalLink>
                    ) : (
                      patient.email
                    )}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1 text-[13px] text-fg-secondary">
                {patient.doctorName && patient.doctorId && (
                  <span>
                    Doctor:{" "}
                    <ExternalLink href={buildDoctorHref(patient.doctorId)}>
                      {patient.doctorName}
                    </ExternalLink>
                  </span>
                )}
                {patient.branchName && patient.branchId && (
                  <span>
                    Branch:{" "}
                    <ExternalLink href={buildBranchHref(patient.branchId)}>
                      {patient.branchName}
                    </ExternalLink>
                  </span>
                )}
                {canBill && (
                  <PatientBalanceChip
                    patientId={patient.id}
                    branchId={patient.branchId}
                    refreshKey={billingKey}
                    onClick={() => handleTabChange("billing")}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-control text-[14px] border-border gap-1.5"
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
              className="h-9 rounded-control text-[14px] border-border gap-1.5"
              onClick={() => setCreateAppointmentOpen(true)}
            >
              <CalendarCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              New Appointment
            </Button>
            {canBill && (
              <Button
                variant="outline"
                className="h-9 rounded-control text-[14px] border-border gap-1.5"
                onClick={() => {
                  handleTabChange("billing");
                  setNewInvoiceRequested(true);
                }}
              >
                <Receipt className="h-3.5 w-3.5" strokeWidth={1.5} />
                New invoice
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9 rounded-control text-[14px] border-border gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              Edit
            </Button>
            {can(branchRole, "patient.delete") && (
              <Button
                variant="outline"
                className="h-9 rounded-control text-[14px] border-border gap-1.5 text-danger hover:text-danger hover:bg-red-50"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-panel border border-border bg-white px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={1.5} />
              <span className="text-[13px] text-fg-secondary">{s.label}</span>
            </div>
            <div
              className="text-[22px] font-medium text-foreground"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-brand text-brand"
                  : "border-transparent text-fg-secondary hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && clinical && (
        <PatientOverviewTab patientId={patientId} patient={patient} />
      )}
      {activeTab === "history" && (
        <PatientHistoryTab key={bookingVersion} patientId={patientId} branchRole={branchRole} />
      )}
      {activeTab === "xrays" && clinical && (
        <PatientXraysTab
          patientId={patientId}
          xrays={patient.xrays ?? []}
          onRefresh={fetchPatient}
        />
      )}
      {activeTab === "care" && showCareTab && (
        <PatientCareTab key={bookingVersion} patient={patient} branchRole={branchRole} currentUserId={currentUserId} />
      )}
      {activeTab === "profile" && (
        <PatientProfileTab patient={patient} showClinical={clinical} onPatientChange={fetchPatient} />
      )}
      {activeTab === "billing" && canBill && (
        <PatientInvoicesPanel
          patient={{ ...patient, isMalaysian: isMalaysianPatient(patient) }}
          branchName={patient.branchName}
          branchRole={branchRole}
          newInvoiceRequested={newInvoiceRequested}
          onNewInvoiceRequestHandled={handleNewInvoiceRequest}
          onChanged={() => setBillingKey((k) => k + 1)}
        />
      )}

      {/* Dialogs */}
      <EditPatientDialog
        patient={patient}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSave}
        showClinical={clinical}
      />
      <DeletePatientDialog
        patient={patient}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDelete={handleDelete}
      />
      <CreateAppointmentDialog
        open={createAppointmentOpen}
        isAdmin={can(branchRole, "appointment.manageAll")}
        currentUserId={currentUserId}
        prefilledPatient={patient ? {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          phone: patient.phone,
          branchId: patient.branchId,
        } : null}
        onClose={() => setCreateAppointmentOpen(false)}
        onCreated={() => {
          setCreateAppointmentOpen(false);
          // Refresh the next-appointment card and the tabs
          void fetchPatient();
          setBookingVersion((v) => v + 1);
        }}
      />
    </div>
  );
}

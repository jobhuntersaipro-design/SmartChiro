"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BranchDetail, OperatingHoursMap, DayHours } from "@/types/branch";
import { parseOperatingHours, hasAnyHours } from "@/lib/operating-hours";
import { CLINIC_TYPE_OPTIONS, formatClinicType, normalizeWebsite } from "@/lib/branch-fields";
import { DeleteBranchDialog } from "./DeleteBranchDialog";
import { BranchActivityLog } from "./BranchActivityLog";
import { BranchReminderSettingsCard } from "@/components/branches/BranchReminderSettingsCard";
import { PackageCatalogCard } from "@/components/packages/PackageCatalogCard";
import { can } from "@/lib/permissions";
import { BranchBillingSettingsCard } from "@/components/branches/BranchBillingSettingsCard";
import { OnlineBookingCard } from "@/components/branches/OnlineBookingCard";
import { BranchPortalSettingsCard } from "@/components/branches/BranchPortalSettingsCard";
import { CommissionRulesCard } from "@/components/commissions/CommissionRulesCard";
import { useRouter } from "next/navigation";

interface BranchSettingsTabProps {
  branch: BranchDetail;
  isOwner: boolean;
  onSave: () => Promise<void>;
}

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

export function BranchSettingsTab({ branch, isOwner, onSave }: BranchSettingsTabProps) {
  const router = useRouter();

  // Form state
  const [form, setForm] = useState({
    name: branch.name,
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    website: branch.website ?? "",
    address: branch.address ?? "",
    city: branch.city ?? "",
    state: branch.state ?? "",
    zip: branch.zip ?? "",
    treatmentRooms: branch.treatmentRooms?.toString() ?? "",
    clinicType: branch.clinicType ?? "",
    licenseNumber: branch.licenseNumber ?? "",
    specialties: branch.specialties ?? "",
    insuranceProviders: branch.insuranceProviders ?? "",
    billingContactName: branch.billingContactName ?? "",
    billingContactEmail: branch.billingContactEmail ?? "",
    billingContactPhone: branch.billingContactPhone ?? "",
  });

  // Operating hours
  const [hours, setHours] = useState<OperatingHoursMap>(() => parseOperatingHours(branch.operatingHours));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
    setSuccess(false);
  }

  function toggleDay(day: keyof OperatingHoursMap) {
    setHours((prev) => {
      if (prev[day]) {
        const next = { ...prev };
        delete next[day];
        return next;
      }
      return { ...prev, [day]: { open: "09:00", close: "18:00" } };
    });
  }

  function updateDayHours(day: keyof OperatingHoursMap, field: keyof DayHours, value: string) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, [field]: value },
    }));
  }

  async function handleSave() {
    const badDay = DAY_ORDER.find((d) => hours[d] && hours[d]!.open >= hours[d]!.close);
    if (badDay) {
      setError(`${DAY_LABELS[badDay]}: opening time must be before closing time`);
      return;
    }
    const website = normalizeWebsite(form.website);
    if (!website.ok) {
      setError(website.error);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          website: website.value ?? "",
          treatmentRooms: form.treatmentRooms ? parseInt(form.treatmentRooms, 10) : null,
          operatingHours: JSON.stringify(hours),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }

      setSuccess(true);
      await onSave();
      // The sidebar's branch switcher shows the name too.
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBranch() {
    const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? data.error ?? "Couldn't delete the branch.");
    }
    router.push("/dashboard/branches");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Branch Info */}
      <Section title="Branch Info">
        <FieldRow label="Branch Name">
          <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Phone">
          <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Email">
          <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Website">
          <Input value={form.website} onChange={(e) => updateField("website", e.target.value)} placeholder="www.yourclinic.com" className="settings-input" />
        </FieldRow>
      </Section>

      {/* Location */}
      <Section title="Location">
        <FieldRow label="Street Address">
          <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} className="settings-input" />
        </FieldRow>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldRow label="City">
            <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} className="settings-input" />
          </FieldRow>
          <FieldRow label="State">
            <Input value={form.state} onChange={(e) => updateField("state", e.target.value)} className="settings-input" />
          </FieldRow>
          <FieldRow label="ZIP">
            <Input value={form.zip} onChange={(e) => updateField("zip", e.target.value)} className="settings-input" />
          </FieldRow>
        </div>
      </Section>

      {/* Operating Hours */}
      <Section title="Operating Hours">
        {!hasAnyHours(hours) && (
          <p className="mb-3 rounded-control border border-warning/25 bg-warning-subtle px-3 py-2 text-[13px] text-warning">
            Opening hours aren&apos;t set — bookings can&apos;t be checked against them. Set the days this branch is open.
          </p>
        )}
        <div className="space-y-2">
          {DAY_ORDER.map((day) => {
            const isOpen = !!hours[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-24 text-left text-[14px] font-medium cursor-pointer ${
                    isOpen ? "text-foreground" : "text-border-strong"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
                {isOpen ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={hours[day]?.open ?? "09:00"}
                      onChange={(e) => updateDayHours(day, "open", e.target.value)}
                      className="w-30 h-8 px-2 rounded-control border-border text-[14px]"
                    />
                    <span className="text-[13px] text-fg-secondary">to</span>
                    <Input
                      type="time"
                      value={hours[day]?.close ?? "18:00"}
                      onChange={(e) => updateDayHours(day, "close", e.target.value)}
                      className="w-30 h-8 px-2 rounded-control border-border text-[14px]"
                    />
                    <button
                      onClick={() => toggleDay(day)}
                      className="text-[12px] text-danger hover:underline cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleDay(day)}
                    className="text-[13px] text-brand hover:underline cursor-pointer"
                  >
                    Set hours
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Practice Details */}
      <Section title="Practice Details">
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Treatment Rooms">
            <Input type="number" min="0" value={form.treatmentRooms} onChange={(e) => updateField("treatmentRooms", e.target.value)} className="settings-input" />
          </FieldRow>
          <FieldRow label="Clinic Type">
            <select
              aria-label="Clinic Type"
              value={form.clinicType}
              onChange={(e) => updateField("clinicType", e.target.value)}
              className="h-8 w-full rounded-control border border-input bg-transparent px-2 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">Not set</option>
              {[...CLINIC_TYPE_OPTIONS, ...(form.clinicType && !(CLINIC_TYPE_OPTIONS as readonly string[]).includes(form.clinicType) ? [form.clinicType] : [])].map((t) => (
                <option key={t} value={t}>
                  {formatClinicType(t)}
                </option>
              ))}
            </select>
          </FieldRow>
        </div>
        <FieldRow label="License Number">
          <Input value={form.licenseNumber} onChange={(e) => updateField("licenseNumber", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Specialties">
          <Input value={form.specialties} onChange={(e) => updateField("specialties", e.target.value)} placeholder="Comma-separated" className="settings-input" />
        </FieldRow>
        <FieldRow label="Insurance Providers">
          <Input value={form.insuranceProviders} onChange={(e) => updateField("insuranceProviders", e.target.value)} placeholder="Comma-separated" className="settings-input" />
        </FieldRow>
      </Section>

      {/* Billing Contact */}
      <Section title="Billing Contact">
        <FieldRow label="Contact Name">
          <Input value={form.billingContactName} onChange={(e) => updateField("billingContactName", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Contact Email">
          <Input type="email" value={form.billingContactEmail} onChange={(e) => updateField("billingContactEmail", e.target.value)} className="settings-input" />
        </FieldRow>
        <FieldRow label="Contact Phone">
          <Input value={form.billingContactPhone} onChange={(e) => updateField("billingContactPhone", e.target.value)} className="settings-input" />
        </FieldRow>
      </Section>

      {/* Save — OWNER only per 2026-05-05 RBAC tightening */}
      {isOwner && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-6 bg-primary hover:bg-primary/90 text-white rounded-control text-[14px] font-medium cursor-pointer"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          {error && <p className="text-[14px] text-danger">{error}</p>}
          {success && <p className="text-[14px] text-success">Saved successfully</p>}
        </div>
      )}
      {!isOwner && (
        <p className="text-[13px] text-fg-secondary">
          Only the branch owner can edit these settings.
        </p>
      )}

      {/* Appointment Reminders */}
      <BranchReminderSettingsCard
        branchId={branch.id}
        canEdit={true}
        branch={{ name: branch.name, address: branch.address, phone: branch.phone }}
      />

      {/* Packages catalogue (Phase 3) */}
      <PackageCatalogCard branchId={branch.id} canManage={can(branch.userRole, "package.manage")} />
      {/* Billing & tax — OWNER edits, ADMIN reads */}
      {(isOwner || branch.userRole === "ADMIN") && <BranchBillingSettingsCard branchId={branch.id} />}
      {/* Online booking link — OWNER + ADMIN */}
      {(isOwner || branch.userRole === "ADMIN") && <OnlineBookingCard branchId={branch.id} />}
      {(isOwner || branch.userRole === "ADMIN") && <BranchPortalSettingsCard branchId={branch.id} />}
      {/* Commission rules (Phase 8.2) — OWNER / ADMIN */}
      {can(branch.userRole, "commissions.manage") && <CommissionRulesCard branchId={branch.id} />}

      {/* Activity Log — visible to OWNER + ADMIN per 2026-05-05 RBAC */}
      {(isOwner || branch.userRole === "ADMIN") && (
        <BranchActivityLog branchId={branch.id} />
      )}

      {/* Danger Zone */}
      {isOwner && (
        <div className="rounded-panel border border-danger/20 bg-danger-subtle px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-danger">Danger Zone</h3>
          </div>
          <p className="text-[13px] text-fg-secondary mb-3">
            Permanently delete this branch and all its data. This cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="rounded-md border-danger/30 text-danger hover:bg-danger hover:text-white text-[14px] cursor-pointer"
          >
            Delete Branch
          </Button>

          <DeleteBranchDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            branchName={branch.name}
            branchId={branch.id}
            onConfirm={handleDeleteBranch}
          />
        </div>
      )}

      <style jsx>{`
        :global(.settings-input) {
          height: 36px;
          border-radius: 1.125rem;
          border-color: var(--border);
          font-size: 14px;
          background: var(--surface-muted);
        }
        :global(.settings-input:focus) {
          border-color: var(--brand);
          background: var(--surface);
          box-shadow: 0 0 0 3px rgb(119 71 255 / .15);
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-medium text-foreground mb-3 pb-2 border-b border-border">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-fg-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}

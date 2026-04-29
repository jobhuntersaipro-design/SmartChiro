"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BranchDetail, OperatingHoursMap, DayHours } from "@/types/branch";
import { DeleteBranchDialog } from "./DeleteBranchDialog";
import { BranchReminderSettingsCard } from "@/components/branches/BranchReminderSettingsCard";
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
  let initialHours: OperatingHoursMap = {};
  try {
    if (branch.operatingHours) initialHours = JSON.parse(branch.operatingHours);
  } catch { /* ignore */ }
  const [hours, setHours] = useState<OperatingHoursMap>(initialHours);

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
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
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
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBranch() {
    const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    router.push("/dashboard/branches");
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
          <Input value={form.website} onChange={(e) => updateField("website", e.target.value)} placeholder="https://" className="settings-input" />
        </FieldRow>
      </Section>

      {/* Location */}
      <Section title="Location">
        <FieldRow label="Street Address">
          <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} className="settings-input" />
        </FieldRow>
        <div className="grid grid-cols-3 gap-3">
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
        <div className="space-y-2">
          {DAY_ORDER.map((day) => {
            const isOpen = !!hours[day];
            return (
              <div key={day} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-24 text-left text-[14px] font-medium cursor-pointer ${
                    isOpen ? "text-[#061b31]" : "text-[#c1c9d2]"
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
                      className="w-28 h-8 rounded-[4px] border-[#e5edf5] text-[14px]"
                    />
                    <span className="text-[13px] text-[#64748d]">to</span>
                    <Input
                      type="time"
                      value={hours[day]?.close ?? "18:00"}
                      onChange={(e) => updateDayHours(day, "close", e.target.value)}
                      className="w-28 h-8 rounded-[4px] border-[#e5edf5] text-[14px]"
                    />
                    <button
                      onClick={() => toggleDay(day)}
                      className="text-[12px] text-[#DF1B41] hover:underline cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleDay(day)}
                    className="text-[13px] text-[#533afd] hover:underline cursor-pointer"
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
            <Input value={form.clinicType} onChange={(e) => updateField("clinicType", e.target.value)} placeholder="e.g. Solo, Group" className="settings-input" />
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

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-6 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer"
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {error && <p className="text-[14px] text-[#DF1B41]">{error}</p>}
        {success && <p className="text-[14px] text-[#30B130]">Saved successfully</p>}
      </div>

      {/* Appointment Reminders */}
      <BranchReminderSettingsCard branchId={branch.id} canEdit={true} />

      {/* Danger Zone */}
      {isOwner && (
        <div className="rounded-[6px] border border-[#DF1B41]/20 bg-[#FEF2F4] px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[#DF1B41]" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#DF1B41]">Danger Zone</h3>
          </div>
          <p className="text-[13px] text-[#64748d] mb-3">
            Permanently delete this branch and all its data. This cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="rounded-[4px] border-[#DF1B41]/30 text-[#DF1B41] hover:bg-[#DF1B41] hover:text-white text-[14px] cursor-pointer"
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
          border-radius: 4px;
          border-color: #e5edf5;
          font-size: 14px;
          background: #f6f9fc;
        }
        :global(.settings-input:focus) {
          border-color: #533afd;
          box-shadow: 0 0 0 1px #533afd;
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-medium text-[#061b31] mb-3 pb-2 border-b border-[#e5edf5]">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[#64748d] mb-1">{label}</label>
      {children}
    </div>
  );
}

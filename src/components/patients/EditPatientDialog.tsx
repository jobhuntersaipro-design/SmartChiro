"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { Patient } from "@/types/patient";

interface EditPatientDialogProps {
  patient: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patientId: string, data: Record<string, unknown>) => Promise<void>;
  branchDoctors?: { id: string; name: string }[];
  isAdmin?: boolean;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[#273951] mb-1">{label}</label>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d] mb-3 mt-5 first:mt-0 border-b border-[#e5edf5] pb-2">
      {children}
    </h3>
  );
}

const inputClass = "flex h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";
const selectClass = "flex h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none";
const textareaClass = "flex w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[15px] text-[#061b31] placeholder:text-[#64748d] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200 resize-none";

const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Wilayah Persekutuan Kuala Lumpur", "Wilayah Persekutuan Putrajaya",
  "Wilayah Persekutuan Labuan",
];

export function EditPatientDialog({ patient, open, onOpenChange, onSave, branchDoctors, isAdmin }: EditPatientDialogProps) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (patient && open) {
      setForm({
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email || "",
        phone: patient.phone || "",
        icNumber: patient.icNumber || "",
        dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.split("T")[0] : "",
        gender: patient.gender || "",
        occupation: patient.occupation || "",
        race: patient.race || "",
        maritalStatus: patient.maritalStatus || "",
        bloodType: patient.bloodType || "",
        allergies: patient.allergies || "",
        referralSource: patient.referralSource || "",
        addressLine1: patient.addressLine1 || "",
        addressLine2: patient.addressLine2 || "",
        city: patient.city || "",
        state: patient.state || "",
        postcode: patient.postcode || "",
        emergencyName: patient.emergencyName || "",
        emergencyPhone: patient.emergencyPhone || "",
        emergencyRelation: patient.emergencyRelation || "",
        medicalHistory: patient.medicalHistory || "",
        notes: patient.notes || "",
        doctorId: patient.doctorId,
        initialTreatmentFee: patient.initialTreatmentFee != null ? String(patient.initialTreatmentFee) : "",
        firstTreatmentFee: patient.firstTreatmentFee != null ? String(patient.firstTreatmentFee) : "",
        standardFollowUpFee: patient.standardFollowUpFee != null ? String(patient.standardFollowUpFee) : "",
      });
      setSubmitError(null);
    }
  }, [patient, open]);

  if (!open || !patient) return null;

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName?.trim() || !form.lastName?.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      // Convert pricing strings to numbers (or null if empty)
      for (const key of ["initialTreatmentFee", "firstTreatmentFee", "standardFollowUpFee"] as const) {
        const val = form[key];
        payload[key] = val === "" || val === undefined ? null : Number(val);
      }
      await onSave(patient!.id, payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update patient");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-[640px] max-h-[90vh] rounded-[8px] border border-[#e5edf5] bg-white overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-[18px] font-light text-[#061b31]">Edit Patient</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 hover:rotate-90 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-130px)] px-5 pb-5">
          {submitError && (
            <div className="mt-4 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2">
              <p className="text-[13px] text-[#DF1B41]">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <SectionHeading>Personal Information</SectionHeading>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name">
                  <input type="text" value={form.firstName || ""} onChange={(e) => update("firstName", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Last Name">
                  <input type="text" value={form.lastName || ""} onChange={(e) => update("lastName", e.target.value)} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="IC Number">
                  <input type="text" value={form.icNumber || ""} onChange={(e) => update("icNumber", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Date of Birth">
                  <input type="date" value={form.dateOfBirth || ""} onChange={(e) => update("dateOfBirth", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Gender">
                  <select value={form.gender || ""} onChange={(e) => update("gender", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Race">
                  <select value={form.race || ""} onChange={(e) => update("race", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    <option value="Malay">Malay</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Indian">Indian</option>
                    <option value="Others">Others</option>
                  </select>
                </FormField>
                <FormField label="Marital Status">
                  <select value={form.maritalStatus || ""} onChange={(e) => update("maritalStatus", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </FormField>
                <FormField label="Blood Type">
                  <select value={form.bloodType || ""} onChange={(e) => update("bloodType", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Occupation">
                  <input type="text" value={form.occupation || ""} onChange={(e) => update("occupation", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Referral Source">
                  <select value={form.referralSource || ""} onChange={(e) => update("referralSource", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {["Walk-in", "Doctor Referral", "Online Search", "Social Media", "Friend/Family", "Insurance Panel", "Other"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>

            <SectionHeading>Contact & Address</SectionHeading>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Email">
                  <input type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Phone">
                  <input type="tel" value={form.phone || ""} onChange={(e) => update("phone", e.target.value)} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Address Line 1">
                  <input type="text" value={form.addressLine1 || ""} onChange={(e) => update("addressLine1", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Address Line 2">
                  <input type="text" value={form.addressLine2 || ""} onChange={(e) => update("addressLine2", e.target.value)} className={inputClass} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="City">
                  <input type="text" value={form.city || ""} onChange={(e) => update("city", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="State">
                  <select value={form.state || ""} onChange={(e) => update("state", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {MALAYSIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Postcode">
                  <input type="text" value={form.postcode || ""} onChange={(e) => update("postcode", e.target.value)} className={inputClass} />
                </FormField>
              </div>
            </div>

            <SectionHeading>Emergency Contact & Medical</SectionHeading>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Emergency Name">
                  <input type="text" value={form.emergencyName || ""} onChange={(e) => update("emergencyName", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Emergency Phone">
                  <input type="tel" value={form.emergencyPhone || ""} onChange={(e) => update("emergencyPhone", e.target.value)} className={inputClass} />
                </FormField>
                <FormField label="Relationship">
                  <select value={form.emergencyRelation || ""} onChange={(e) => update("emergencyRelation", e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    {["Spouse", "Parent", "Sibling", "Friend", "Other"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Allergies">
                <input type="text" value={form.allergies || ""} onChange={(e) => update("allergies", e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Medical History">
                <textarea value={form.medicalHistory || ""} onChange={(e) => update("medicalHistory", e.target.value)} rows={3} className={textareaClass} />
              </FormField>
              <FormField label="Notes">
                <textarea value={form.notes || ""} onChange={(e) => update("notes", e.target.value)} rows={2} className={textareaClass} />
              </FormField>
              {isAdmin && branchDoctors && branchDoctors.length > 0 && (
                <FormField label="Assigned Doctor">
                  <select value={form.doctorId || ""} onChange={(e) => update("doctorId", e.target.value)} className={selectClass}>
                    {branchDoctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>

            <SectionHeading>Pricing (RM)</SectionHeading>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Initial Treatment Fee">
                <input type="number" min={0} step="0.01" value={form.initialTreatmentFee || ""} onChange={(e) => update("initialTreatmentFee", e.target.value)} placeholder="250.00" className={inputClass} />
              </FormField>
              <FormField label="First Treatment">
                <input type="number" min={0} step="0.01" value={form.firstTreatmentFee || ""} onChange={(e) => update("firstTreatmentFee", e.target.value)} placeholder="180.00" className={inputClass} />
              </FormField>
              <FormField label="Standard Follow-Up">
                <input type="number" min={0} step="0.01" value={form.standardFollowUpFee || ""} onChange={(e) => update("standardFollowUpFee", e.target.value)} placeholder="120.00" className={inputClass} />
              </FormField>
            </div>

            <div className="flex justify-end gap-2 pt-5">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-8 px-3 text-[15px] font-medium rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="h-8 px-3 text-[15px] font-medium rounded-[4px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

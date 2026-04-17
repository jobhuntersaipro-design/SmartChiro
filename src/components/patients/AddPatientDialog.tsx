"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Loader2, User, CreditCard, Calendar, Users, Heart,
  Droplets, Briefcase, Megaphone, Mail, Phone, MapPin,
  Building2, Hash, ShieldAlert, Stethoscope, FileText,
  StickyNote, ChevronRight, ChevronLeft, Check, UserPlus,
} from "lucide-react";
import { CreatePatientData } from "@/types/patient";

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (patient: CreatePatientData) => Promise<void>;
  branchDoctors?: { id: string; name: string }[];
  isAdmin?: boolean;
}

// ─── Shared Styles ───

const inputClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-9 pr-3 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";

const inputNoIconClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";

const selectClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-9 pr-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none cursor-pointer";

const selectNoIconClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none cursor-pointer";

const textareaClass =
  "flex w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-9 pr-3 py-2 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200 resize-none";

const errorInputClass = "border-[#DF1B41]/50 focus:ring-[#DF1B41] focus:border-[#DF1B41]";

// ─── Sub-components ───

function FormField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[#273951] mb-1.5">
        {label} {required && <span className="text-[#DF1B41]">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[12px] text-[#DF1B41] mt-1" role="alert">
          <ShieldAlert className="h-3 w-3 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  );
}

function IconInput({ icon: Icon, children }: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748d] pointer-events-none" strokeWidth={1.5} />
      {children}
    </div>
  );
}

function IconTextarea({ icon: Icon, children }: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-3 h-4 w-4 text-[#64748d] pointer-events-none" strokeWidth={1.5} />
      {children}
    </div>
  );
}

// ─── Step definitions ───

const STEPS = [
  { id: 1, label: "Personal", icon: User, description: "Basic identity" },
  { id: 2, label: "Contact", icon: Phone, description: "Contact & address" },
  { id: 3, label: "Medical", icon: Stethoscope, description: "Health & notes" },
] as const;

const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "W.P. Kuala Lumpur", "W.P. Putrajaya", "W.P. Labuan",
];

// ─── Main Component ───

export function AddPatientDialog({ open, onOpenChange, onAdd, branchDoctors, isAdmin }: AddPatientDialogProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreatePatientData>({ firstName: "", lastName: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof CreatePatientData>(key: K, value: CreatePatientData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
    // Clear error on change
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  if (!open) return null;

  // ─── Validation per step ───

  function validateStep(stepNum: number): boolean {
    const newErrors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!form.firstName?.trim()) newErrors.firstName = "First name is required";
      if (!form.lastName?.trim()) newErrors.lastName = "Last name is required";
      if (form.icNumber && !/^\d{6}-?\d{2}-?\d{4}$/.test(form.icNumber)) {
        newErrors.icNumber = "Expected 12 digits: YYMMDD-SS-XXXX";
      }
    }

    if (stepNum === 2) {
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        newErrors.email = "Invalid email address";
      }
      if (form.phone && !/^[+\d\s\-()]{7,}$/.test(form.phone)) {
        newErrors.phone = "Invalid phone number";
      }
      if (form.postcode && !/^\d{5}$/.test(form.postcode)) {
        newErrors.postcode = "Must be 5 digits";
      }
    }

    if (stepNum === 3) {
      // No required fields in step 3 — all optional
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 3));
    }
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep(step)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAdd(form);
      // Reset
      setForm({ firstName: "", lastName: "" });
      setErrors({});
      setTouched({});
      setStep(1);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create patient");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm({ firstName: "", lastName: "" });
    setErrors({});
    setTouched({});
    setStep(1);
    setSubmitError(null);
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={handleClose} />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-[660px] max-h-[92vh] rounded-[8px] border border-[#e5edf5] bg-white overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.1)" }}
      >
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-[6px] bg-[#ededfc]">
              <UserPlus className="h-4.5 w-4.5 text-[#533afd]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-[18px] font-medium text-[#061b31] tracking-[-0.01em]">Add New Patient</h2>
              <p className="text-[13px] text-[#64748d]">Step {step} of 3 — {STEPS[step - 1].description}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center h-8 w-8 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31]"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* ─── Step Indicator ─── */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const StepIcon = s.icon;
              const isActive = step === s.id;
              const isCompleted = step > s.id;

              return (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      // Allow going back to completed steps, or clicking current
                      if (s.id < step) setStep(s.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[4px] w-full transition-all duration-200 ${
                      isActive
                        ? "bg-[#533afd] text-white"
                        : isCompleted
                          ? "bg-[#E8F5E8] text-[#30B130] cursor-pointer hover:bg-[#d4edd4]"
                          : "bg-[#f6f9fc] text-[#a3acb9]"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4 shrink-0" strokeWidth={2} />
                    ) : (
                      <StepIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    )}
                    <span className="text-[13px] font-medium truncate">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className={`h-4 w-4 mx-1 shrink-0 ${isCompleted ? "text-[#30B130]" : "text-[#d1d5db]"}`} strokeWidth={1.5} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Form Body ─── */}
        <form onSubmit={handleSubmit}>
          <div className="overflow-y-auto max-h-[calc(92vh-240px)] px-6 pb-2">
            {submitError && (
              <div className="mb-4 rounded-[6px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-4 py-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-[#DF1B41] shrink-0 mt-0.5" strokeWidth={1.5} />
                <p className="text-[13px] text-[#DF1B41]">{submitError}</p>
              </div>
            )}

            {/* ═══ Step 1: Personal Information ═══ */}
            <div className={step === 1 ? "animate-in fade-in slide-in-from-right-2 duration-200" : "hidden"}>
              <div className="space-y-4">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="First Name" required error={errors.firstName}>
                    <IconInput icon={User}>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => updateField("firstName", e.target.value)}
                        placeholder="Ahmad"
                        className={`${inputClass} ${errors.firstName ? errorInputClass : ""}`}
                        autoFocus
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="Last Name" required error={errors.lastName}>
                    <IconInput icon={User}>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => updateField("lastName", e.target.value)}
                        placeholder="Rahman"
                        className={`${inputClass} ${errors.lastName ? errorInputClass : ""}`}
                      />
                    </IconInput>
                  </FormField>
                </div>

                {/* IC + DOB + Gender */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="IC Number (NRIC)" error={errors.icNumber}>
                    <IconInput icon={CreditCard}>
                      <input
                        type="text"
                        value={form.icNumber || ""}
                        onChange={(e) => updateField("icNumber", e.target.value)}
                        placeholder="850315-08-5234"
                        className={`${inputClass} ${errors.icNumber ? errorInputClass : ""}`}
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="Date of Birth">
                    <IconInput icon={Calendar}>
                      <input
                        type="date"
                        value={form.dateOfBirth || ""}
                        onChange={(e) => updateField("dateOfBirth", e.target.value)}
                        className={inputClass}
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="Gender">
                    <IconInput icon={Users}>
                      <select
                        value={form.gender || ""}
                        onChange={(e) => updateField("gender", e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </IconInput>
                  </FormField>
                </div>

                {/* Race + Marital + Blood */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Race">
                    <IconInput icon={Users}>
                      <select value={form.race || ""} onChange={(e) => updateField("race", e.target.value)} className={selectClass}>
                        <option value="">Select...</option>
                        <option value="Malay">Malay</option>
                        <option value="Chinese">Chinese</option>
                        <option value="Indian">Indian</option>
                        <option value="Others">Others</option>
                      </select>
                    </IconInput>
                  </FormField>
                  <FormField label="Marital Status">
                    <IconInput icon={Heart}>
                      <select value={form.maritalStatus || ""} onChange={(e) => updateField("maritalStatus", e.target.value)} className={selectClass}>
                        <option value="">Select...</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </IconInput>
                  </FormField>
                  <FormField label="Blood Type">
                    <IconInput icon={Droplets}>
                      <select value={form.bloodType || ""} onChange={(e) => updateField("bloodType", e.target.value)} className={selectClass}>
                        <option value="">Select...</option>
                        {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((bt) => (
                          <option key={bt} value={bt}>{bt}</option>
                        ))}
                      </select>
                    </IconInput>
                  </FormField>
                </div>

                {/* Occupation + Referral */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Occupation">
                    <IconInput icon={Briefcase}>
                      <input type="text" value={form.occupation || ""} onChange={(e) => updateField("occupation", e.target.value)} placeholder="Engineer" className={inputClass} />
                    </IconInput>
                  </FormField>
                  <FormField label="Referral Source">
                    <IconInput icon={Megaphone}>
                      <select value={form.referralSource || ""} onChange={(e) => updateField("referralSource", e.target.value)} className={selectClass}>
                        <option value="">How did they find us?</option>
                        {["Walk-in", "Doctor Referral", "Online Search", "Social Media", "Friend/Family", "Insurance Panel", "Other"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </IconInput>
                  </FormField>
                </div>
              </div>
            </div>

            {/* ═══ Step 2: Contact & Address ═══ */}
            <div className={step === 2 ? "animate-in fade-in slide-in-from-right-2 duration-200" : "hidden"}>
              <div className="space-y-4">
                {/* Email + Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Email" error={errors.email}>
                    <IconInput icon={Mail}>
                      <input
                        type="email"
                        value={form.email || ""}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="ahmad@email.com"
                        className={`${inputClass} ${errors.email ? errorInputClass : ""}`}
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="Phone" error={errors.phone}>
                    <IconInput icon={Phone}>
                      <input
                        type="tel"
                        value={form.phone || ""}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="+60 12-345 6789"
                        className={`${inputClass} ${errors.phone ? errorInputClass : ""}`}
                      />
                    </IconInput>
                  </FormField>
                </div>

                {/* Address section label */}
                <div className="flex items-center gap-2 pt-1">
                  <MapPin className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Address</span>
                  <div className="flex-1 h-px bg-[#e5edf5]" />
                </div>

                {/* Address Lines */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Street Address">
                    <IconInput icon={MapPin}>
                      <input type="text" value={form.addressLine1 || ""} onChange={(e) => updateField("addressLine1", e.target.value)} placeholder="123 Jalan Bukit" className={inputClass} />
                    </IconInput>
                  </FormField>
                  <FormField label="Apt / Unit / Floor">
                    <input type="text" value={form.addressLine2 || ""} onChange={(e) => updateField("addressLine2", e.target.value)} placeholder="Unit 4A" className={inputNoIconClass} />
                  </FormField>
                </div>

                {/* City + State + Postcode */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="City">
                    <IconInput icon={Building2}>
                      <input type="text" value={form.city || ""} onChange={(e) => updateField("city", e.target.value)} placeholder="Kuala Lumpur" className={inputClass} />
                    </IconInput>
                  </FormField>
                  <FormField label="State">
                    <select value={form.state || ""} onChange={(e) => updateField("state", e.target.value)} className={selectNoIconClass}>
                      <option value="">Select state...</option>
                      {MALAYSIAN_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Postcode" error={errors.postcode}>
                    <IconInput icon={Hash}>
                      <input
                        type="text"
                        value={form.postcode || ""}
                        onChange={(e) => updateField("postcode", e.target.value)}
                        placeholder="50450"
                        maxLength={5}
                        className={`${inputClass} ${errors.postcode ? errorInputClass : ""}`}
                      />
                    </IconInput>
                  </FormField>
                </div>
              </div>
            </div>

            {/* ═══ Step 3: Emergency & Medical ═══ */}
            <div className={step === 3 ? "animate-in fade-in slide-in-from-right-2 duration-200" : "hidden"}>
              <div className="space-y-4">
                {/* Emergency contact section label */}
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[#F5A623]" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Emergency Contact</span>
                  <div className="flex-1 h-px bg-[#e5edf5]" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Contact Name">
                    <IconInput icon={User}>
                      <input type="text" value={form.emergencyName || ""} onChange={(e) => updateField("emergencyName", e.target.value)} placeholder="Fatimah Rahman" className={inputClass} />
                    </IconInput>
                  </FormField>
                  <FormField label="Contact Phone">
                    <IconInput icon={Phone}>
                      <input type="tel" value={form.emergencyPhone || ""} onChange={(e) => updateField("emergencyPhone", e.target.value)} placeholder="+60 13-456 7890" className={inputClass} />
                    </IconInput>
                  </FormField>
                  <FormField label="Relationship">
                    <IconInput icon={Heart}>
                      <select value={form.emergencyRelation || ""} onChange={(e) => updateField("emergencyRelation", e.target.value)} className={selectClass}>
                        <option value="">Select...</option>
                        {["Spouse", "Parent", "Sibling", "Friend", "Other"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </IconInput>
                  </FormField>
                </div>

                {/* Medical section label */}
                <div className="flex items-center gap-2 pt-1">
                  <Stethoscope className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Medical Information</span>
                  <div className="flex-1 h-px bg-[#e5edf5]" />
                </div>

                <FormField label="Allergies">
                  <IconInput icon={ShieldAlert}>
                    <input type="text" value={form.allergies || ""} onChange={(e) => updateField("allergies", e.target.value)} placeholder="Penicillin, latex, NSAIDs..." className={inputClass} />
                  </IconInput>
                </FormField>

                <FormField label="Medical History">
                  <IconTextarea icon={FileText}>
                    <textarea value={form.medicalHistory || ""} onChange={(e) => updateField("medicalHistory", e.target.value)} placeholder="Chronic lower back pain since 2018, previous surgery on L4-L5..." rows={3} className={textareaClass} />
                  </IconTextarea>
                </FormField>

                <FormField label="Notes">
                  <IconTextarea icon={StickyNote}>
                    <textarea value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} placeholder="Patient prefers morning appointments, needs wheelchair access..." rows={2} className={textareaClass} />
                  </IconTextarea>
                </FormField>

                {/* Doctor assignment (admin only) */}
                {isAdmin && branchDoctors && branchDoctors.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-1">
                      <Stethoscope className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
                      <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Assignment</span>
                      <div className="flex-1 h-px bg-[#e5edf5]" />
                    </div>
                    <FormField label="Assigned Doctor">
                      <IconInput icon={Stethoscope}>
                        <select value={form.doctorId || ""} onChange={(e) => updateField("doctorId", e.target.value)} className={selectClass}>
                          <option value="">Current user (default)</option>
                          {branchDoctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </IconInput>
                    </FormField>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ─── Footer Navigation ─── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#e5edf5] bg-[#fafbfc]">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="h-9 px-4 text-[14px] font-medium rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc] gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                className="h-9 px-4 text-[14px] font-medium rounded-[4px] text-[#64748d] hover:text-[#273951] hover:bg-[#f6f9fc]"
              >
                Cancel
              </Button>

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="h-9 px-5 text-[14px] font-medium rounded-[4px] gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Next
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-5 text-[14px] font-medium rounded-[4px] gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2} />
                  )}
                  {submitting ? "Creating..." : "Add Patient"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

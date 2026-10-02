"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Loader2, User, CreditCard, Users, Heart,
  Droplets, Briefcase, Megaphone, Mail, Phone, MapPin,
  Building2, Hash, ShieldAlert, Stethoscope, FileText,
  StickyNote, ChevronRight, ChevronLeft, Check, UserPlus,
  Banknote,
} from "lucide-react";
import { CreatePatientData } from "@/types/patient";
import { DISCARD_CHANGES_PROMPT, todayLocalISODate } from "@/lib/format";
import { DateInput } from "@/components/ui/date-input";
import { NationalitySelect } from "@/components/patients/NationalitySelect";
import { effectiveNationality } from "@/lib/nationality";
import {
  defaultReminderChannel,
  reminderChannelError,
  type ReminderChannelValue,
} from "@/lib/reminder-channel";
import { PATIENT_LANGUAGES, type PatientLanguage } from "@/lib/outreach/consent";
import { MarketingConsentCheckbox } from "@/components/patients/MarketingConsentCheckbox";

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (patient: CreatePatientData) => Promise<void>;
  branchDoctors?: { id: string; name: string }[];
  isAdmin?: boolean;
  /** Medical history / notes fields — false for front desk. */
  showClinical?: boolean;
}

// ─── Shared Styles ───

const inputClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted pl-9 pr-3 text-[15px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-all duration-200";

const inputNoIconClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-all duration-200";

const selectClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted pl-9 pr-3 text-[15px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-colors appearance-none cursor-pointer";

const selectNoIconClass =
  "flex h-9 w-full rounded-md border border-border bg-surface-muted px-3 text-[15px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-colors appearance-none cursor-pointer";

const textareaClass =
  "flex w-full rounded-md border border-border bg-surface-muted pl-9 pr-3 py-2 text-[15px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:bg-white transition-all duration-200 resize-none";

const errorInputClass = "border-danger/50 focus:ring-danger focus:border-danger";

// ─── Sub-components ───

function FormField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-foreground mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[12px] text-danger mt-1" role="alert">
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
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-secondary pointer-events-none" strokeWidth={1.5} />
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
      <Icon className="absolute left-3 top-3 h-4 w-4 text-fg-secondary pointer-events-none" strokeWidth={1.5} />
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

export function AddPatientDialog({ open, onOpenChange, onAdd, branchDoctors, isAdmin, showClinical = true }: AddPatientDialogProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreatePatientData>({ firstName: "", lastName: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  // Set synchronously so a second click/Enter can't POST again before the
  // `submitting` state re-renders the button as disabled.
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Validation message from the DOB field's typed text (null when empty or valid)
  const [dobError, setDobError] = useState<string | null>(null);

  // Until the user picks one, the reminder channel follows the contact details entered
  const reminderChannel: ReminderChannelValue = form.reminderChannel ?? defaultReminderChannel(form);
  const channelError = reminderChannelError(reminderChannel, form);

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

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ─── Validation per step ───

  function validateStep(stepNum: number): boolean {
    const newErrors: Record<string, string> = {};

    if (stepNum === 1) {
      if (!form.firstName?.trim()) newErrors.firstName = "First name is required";
      if (!form.lastName?.trim()) newErrors.lastName = "Last name is required";
      if (form.icNumber && !/^\d{6}-?\d{2}-?\d{4}$/.test(form.icNumber)) {
        newErrors.icNumber = "Expected 12 digits: YYMMDD-SS-XXXX";
      }
      if (dobError) newErrors.dateOfBirth = dobError;
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
      if (channelError) newErrors.reminderChannel = channelError;
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
    // Only the final step saves; Enter on earlier steps moves forward.
    if (step !== 3) {
      handleNext();
      return;
    }
    if (submittingRef.current || !validateStep(step)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAdd({ ...form, reminderChannel, nationality: effectiveNationality(form.nationality, form.icNumber) });
      // Reset
      setForm({ firstName: "", lastName: "" });
      setDobError(null);
      setErrors({});
      setTouched({});
      setStep(1);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create patient");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  /** Backdrop, Esc, X and Cancel all confirm before discarding typed input. */
  function requestClose() {
    if (submittingRef.current) return;
    const dirty = Object.values(touched).some(Boolean);
    if (dirty && !window.confirm(DISCARD_CHANGES_PROMPT)) return;
    handleClose();
  }

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  function handleClose() {
    setForm({ firstName: "", lastName: "" });
    setDobError(null);
    setErrors({});
    setTouched({});
    setStep(1);
    setSubmitError(null);
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={requestClose} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-patient-title"
        className="relative z-10 w-full max-w-165 max-h-[92vh] rounded-2xl border border-border bg-white overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.1)" }}
      >
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-panel bg-brand-subtle">
              <UserPlus className="h-4.5 w-4.5 text-brand" strokeWidth={1.5} />
            </div>
            <div>
              <h2 id="add-patient-title" className="text-[18px] font-medium text-foreground tracking-[-0.01em]">Add New Patient</h2>
              <p className="text-[13px] text-fg-secondary">Step {step} of 3 — {STEPS[step - 1].description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex items-center justify-center h-8 w-8 rounded-md text-fg-secondary transition-all duration-200 hover:bg-surface-muted hover:text-foreground"
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-md w-full transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-white"
                        : isCompleted
                          ? "bg-success-subtle text-success cursor-pointer hover:bg-success-subtle"
                          : "bg-surface-muted text-fg-disabled"
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
                    <ChevronRight className={`h-4 w-4 mx-1 shrink-0 ${isCompleted ? "text-success" : "text-border-strong"}`} strokeWidth={1.5} />
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
              <div className="mb-4 rounded-panel border border-danger/20 bg-danger-subtle px-4 py-3 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-danger shrink-0 mt-0.5" strokeWidth={1.5} />
                <p className="text-[13px] text-danger">{submitError}</p>
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
                  <FormField label="Date of Birth" error={errors.dateOfBirth}>
                    <DateInput
                      aria-label="Date of Birth"
                      value={form.dateOfBirth || ""}
                      onChange={(iso) => updateField("dateOfBirth", iso)}
                      onErrorChange={(msg) => {
                        setDobError(msg);
                        if (!msg) clearError("dateOfBirth");
                      }}
                      min="1900-01-01"
                      max={todayLocalISODate()}
                      showError={!errors.dateOfBirth}
                      inputClassName={`${inputNoIconClass} ${errors.dateOfBirth ? errorInputClass : ""}`}
                    />
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

                {/* Nationality — defaults to Malaysia for a MyKad; SST applies to non-Malaysians */}
                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Nationality">
                    <NationalitySelect
                      value={effectiveNationality(form.nationality, form.icNumber)}
                      onChange={(code) => updateField("nationality", code)}
                      hint={form.nationality === undefined && effectiveNationality(undefined, form.icNumber) ? "From MyKad" : null}
                    />
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
                  <MapPin className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Address</span>
                  <div className="flex-1 h-px bg-border" />
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
                  <ShieldAlert className="h-4 w-4 text-warning" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Emergency Contact</span>
                  <div className="flex-1 h-px bg-border" />
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

                {/* Reminders section */}
                <div className="flex items-center gap-2 pt-1">
                  <Phone className="h-4 w-4 text-brand" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Reminder Preferences</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Reminder channel" error={channelError ?? undefined}>
                    <select
                      aria-label="Reminder channel"
                      value={reminderChannel}
                      onChange={(e) => updateField("reminderChannel", e.target.value as ReminderChannelValue)}
                      className={`${selectClass} ${channelError ? errorInputClass : ""}`}
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="EMAIL">Email</option>
                      <option value="BOTH">Both</option>
                      <option value="NONE">None</option>
                    </select>
                  </FormField>
                  <FormField label="Preferred language">
                    <select
                      value={form.preferredLanguage ?? "en"}
                      onChange={(e) => updateField("preferredLanguage", e.target.value as PatientLanguage)}
                      className={selectClass}
                    >
                      {PATIENT_LANGUAGES.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <MarketingConsentCheckbox
                  checked={form.marketingConsent ?? false}
                  onChange={(v) => updateField("marketingConsent", v)}
                />

                {/* Medical section label */}
                <div className="flex items-center gap-2 pt-1">
                  <Stethoscope className="h-4 w-4 text-brand" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Medical Information</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <FormField label="Allergies">
                  <IconInput icon={ShieldAlert}>
                    <input type="text" value={form.allergies || ""} onChange={(e) => updateField("allergies", e.target.value)} placeholder="Penicillin, latex, NSAIDs..." className={inputClass} />
                  </IconInput>
                </FormField>

                {showClinical && (
                  <>
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
                  </>
                )}

                {/* Pricing section */}
                <div className="flex items-center gap-2 pt-1">
                  <Banknote className="h-4 w-4 text-success" strokeWidth={1.5} />
                  <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Pricing (RM)</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField label="Initial Treatment Fee">
                    <IconInput icon={Banknote}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.initialTreatmentFee ?? ""}
                        onChange={(e) => updateField("initialTreatmentFee", e.target.value === "" ? undefined : Number(e.target.value))}
                        placeholder="250.00"
                        className={inputClass}
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="First Treatment">
                    <IconInput icon={Banknote}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.firstTreatmentFee ?? ""}
                        onChange={(e) => updateField("firstTreatmentFee", e.target.value === "" ? undefined : Number(e.target.value))}
                        placeholder="180.00"
                        className={inputClass}
                      />
                    </IconInput>
                  </FormField>
                  <FormField label="Standard Follow-Up">
                    <IconInput icon={Banknote}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.standardFollowUpFee ?? ""}
                        onChange={(e) => updateField("standardFollowUpFee", e.target.value === "" ? undefined : Number(e.target.value))}
                        placeholder="120.00"
                        className={inputClass}
                      />
                    </IconInput>
                  </FormField>
                </div>

                {/* Doctor assignment (admin only) */}
                {isAdmin && branchDoctors && branchDoctors.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 pt-1">
                      <Stethoscope className="h-4 w-4 text-fg-secondary" strokeWidth={1.5} />
                      <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Assignment</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <FormField label="Assigned Doctor">
                      <IconInput icon={Stethoscope}>
                        <select value={form.doctorId || ""} onChange={(e) => updateField("doctorId", e.target.value)} className={selectClass}>
                          {/* Front desk doesn't treat patients, so they must pick a doctor. */}
                          <option value="">{showClinical ? "Current user (default)" : "Choose a doctor"}</option>
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-subtle">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="h-9 px-4 text-[14px] font-medium rounded-md border-border text-foreground hover:bg-surface-muted gap-1.5"
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
                onClick={requestClose}
                className="h-9 px-4 text-[14px] font-medium rounded-md text-fg-secondary hover:text-foreground hover:bg-surface-muted"
              >
                Cancel
              </Button>

              {/* Distinct keys: reusing one <button> and flipping its type to
                  "submit" mid-click submitted the form from step 2. */}
              {step < 3 ? (
                <Button
                  key="next"
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNext();
                  }}
                  className="h-9 px-5 text-[14px] font-medium rounded-md gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Next
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              ) : (
                <Button
                  key="submit"
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-5 text-[14px] font-medium rounded-md gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
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

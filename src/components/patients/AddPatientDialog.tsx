"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (patient: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
  }) => Promise<void>;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[#425466] mb-1">
        {label} {required && <span className="text-[#DF1B41]">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass = "flex h-8 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 text-[15px] text-[#0A2540] placeholder:text-[#697386] focus:outline-none focus:ring-1 focus:ring-[#635BFF] focus:border-[#635BFF] focus:bg-white transition-colors";
const selectClass = "flex h-8 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 text-[15px] text-[#0A2540] focus:outline-none focus:ring-1 focus:ring-[#635BFF] focus:border-[#635BFF] focus:bg-white transition-colors appearance-none";

export function AddPatientDialog({ open, onOpenChange, onAdd }: AddPatientDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open) return null;

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = "First name is required";
    if (!lastName.trim()) newErrors.lastName = "Last name is required";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email address";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAdd({ firstName: firstName.trim(), lastName: lastName.trim(), email, phone, dateOfBirth, gender });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setDateOfBirth("");
      setGender("");
      setErrors({});
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create patient");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-[520px] rounded-[8px] border border-[#E3E8EE] bg-white p-6"
        style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[18px] font-semibold text-[#0A2540]">Add New Patient</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#697386] transition-colors hover:bg-[#F0F3F7] hover:text-[#0A2540]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2">
            <p className="text-[13px] text-[#DF1B41]">{submitError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" required>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className={inputClass} />
              {errors.firstName && <p className="text-[12px] text-[#DF1B41] mt-0.5">{errors.firstName}</p>}
            </FormField>
            <FormField label="Last Name" required>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className={inputClass} />
              {errors.lastName && <p className="text-[12px] text-[#DF1B41] mt-0.5">{errors.lastName}</p>}
            </FormField>
          </div>

          <FormField label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john.doe@email.com" className={inputClass} />
            {errors.email && <p className="text-[12px] text-[#DF1B41] mt-0.5">{errors.email}</p>}
          </FormField>

          <FormField label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" className={inputClass} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date of Birth">
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Gender">
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-8 px-3 text-[15px] font-medium rounded-[4px] border-[#E3E8EE] text-[#425466] hover:bg-[#F0F3F7]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="h-8 px-3 text-[15px] font-medium rounded-[4px]">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Add Patient
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Building2,
  MapPin,
  Stethoscope,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import type { OperatingHoursMap, DayHours, BranchWithStats } from "@/types/branch";
import {
  branchToFormData,
  computePatchPayload,
  parseOperatingHoursJson,
  type EditBranchFormData,
} from "./edit-branch-form";

interface EditBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: BranchWithStats | null;
  ownerName: string | null;
  onSubmit: (
    branchId: string,
    payload: Partial<EditBranchFormData>
  ) => Promise<void>;
}

const steps = [
  { id: 1, label: "Clinic Info", icon: Building2 },
  { id: 2, label: "Location", icon: MapPin },
  { id: 3, label: "Practice", icon: Stethoscope },
  { id: 4, label: "Billing", icon: CreditCard },
] as const;

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

const inputClass =
  "h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[15px] focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";
const inputErrorClass =
  "h-9 rounded-[4px] border-[#df1b41] bg-[#FDE8EC]/30 text-[15px] focus:ring-1 focus:ring-[#df1b41] focus:border-[#df1b41] focus:bg-white transition-all duration-200";
const timeInputClass =
  "h-8 w-[90px] rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] px-2 text-[14px] text-[#061b31] text-center focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all duration-200";

const defaultHours: DayHours = { open: "09:00", close: "18:00" };

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[14px] font-medium text-[#273951] mb-1.5">
      {children} {required && <span className="text-[#df1b41]">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[12px] text-[#df1b41] mt-1">{message}</p>;
}

export function EditBranchDialog({
  open,
  onOpenChange,
  branch,
  ownerName,
  onSubmit,
}: EditBranchDialogProps) {
  const [step, setStep] = useState(1);
  const [initial, setInitial] = useState<EditBranchFormData | null>(null);
  const [data, setData] = useState<EditBranchFormData | null>(null);
  const [hours, setHours] = useState<OperatingHoursMap>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (branch && open) {
      const seed = branchToFormData(branch);
      setInitial(seed);
      setData(seed);
      setHours(parseOperatingHoursJson(branch.operatingHours));
      setStep(1);
      setErrors({});
    }
  }, [branch, open]);

  if (!branch || !data || !initial) return null;

  function update(field: keyof EditBranchFormData, value: string | number | null) {
    setData((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (errors[field]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  }

  function toggleDay(day: string) {
    setHours((prev) => {
      const next = { ...prev };
      if (next[day as keyof OperatingHoursMap]) {
        delete next[day as keyof OperatingHoursMap];
      } else {
        next[day as keyof OperatingHoursMap] = { ...defaultHours };
      }
      return next;
    });
  }

  function updateDayHours(day: string, field: keyof DayHours, value: string) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day as keyof OperatingHoursMap]!, [field]: value },
    }));
  }

  function validateStep(): boolean {
    const newErrors: Record<string, string> = {};
    if (!data) return false;

    if (step === 1) {
      if (!data.name.trim()) newErrors.name = "Clinic name is required";
      if (!data.phone.trim()) newErrors.phone = "Phone number is required";
      else if (data.phone.replace(/[^\d]/g, "").length < 7)
        newErrors.phone = "Must have at least 7 digits";
      if (!data.email.trim()) newErrors.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
        newErrors.email = "Invalid email format";
      if (data.website && !/^https?:\/\/.+/.test(data.website))
        newErrors.website = "Must start with http:// or https://";
    }
    if (step === 2) {
      if (!data.address.trim()) newErrors.address = "Street address is required";
      if (!data.city.trim()) newErrors.city = "City is required";
      if (!data.state.trim()) newErrors.state = "State is required";
      if (!data.zip.trim()) newErrors.zip = "ZIP code is required";
    }
    if (step === 3) {
      if (data.treatmentRooms !== null && data.treatmentRooms < 0)
        newErrors.treatmentRooms = "Must be a positive number";
    }
    if (step === 4) {
      if (
        data.billingContactEmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.billingContactEmail)
      )
        newErrors.billingContactEmail = "Invalid email format";
      if (
        data.billingContactPhone &&
        data.billingContactPhone.replace(/[^\d]/g, "").length < 7
      )
        newErrors.billingContactPhone = "Must have at least 7 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, 4));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    if (!validateStep() || !branch || !data || !initial) return;
    setLoading(true);
    setErrors({});
    try {
      // Stringify operating hours for the payload, then diff against initial
      const submitData: EditBranchFormData = {
        ...data,
        operatingHours: JSON.stringify(hours),
      };
      const initialWithHours: EditBranchFormData = {
        ...initial,
        operatingHours: initial.operatingHours, // already-stringified original
      };
      const payload = computePatchPayload(initialWithHours, submitData);

      if (Object.keys(payload).length === 0) {
        // No changes — close without API call
        onOpenChange(false);
        return;
      }

      await onSubmit(branch.id, payload);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save changes. Please try again.";
      setErrors({ _form: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] rounded-[8px] border border-[#e5edf5] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-light tracking-[-0.18px] text-[#061b31]">
            Edit Clinic
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pb-5">
          {steps.map((s, i) => {
            const isActive = step === s.id;
            const isDone = step > s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-[#ededfc] text-[#533afd]"
                      : isDone
                        ? "text-[#15be53] hover:bg-[#ECFDF5]"
                        : "text-[#64748d] hover:bg-[#f6f9fc]"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-1 transition-colors duration-300 ${
                      isDone ? "bg-[#15be53]" : "bg-[#e5edf5]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div>
                <Label required>Clinic Name</Label>
                <Input
                  value={data.name}
                  onChange={(e) => update("name", e.target.value)}
                  className={errors.name ? inputErrorClass : inputClass}
                />
                <FieldError message={errors.name} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required>Phone</Label>
                  <Input
                    value={data.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={errors.phone ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.phone} />
                </div>
                <div>
                  <Label required>Email</Label>
                  <Input
                    value={data.email}
                    onChange={(e) => update("email", e.target.value)}
                    type="email"
                    className={errors.email ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.email} />
                </div>
              </div>
              <div>
                <Label>Owner Name</Label>
                <Input
                  value={ownerName ?? ""}
                  readOnly
                  disabled
                  className="h-9 rounded-[4px] border-[#e5edf5] bg-[#e5edf5]/50 text-[15px] text-[#64748d] cursor-not-allowed"
                />
                <p className="text-[12px] text-[#64748d] mt-1">
                  Owner is set when the clinic is created and cannot be changed here.
                </p>
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  value={data.website}
                  onChange={(e) => update("website", e.target.value)}
                  placeholder="https://www.smartchiro.com"
                  className={errors.website ? inputErrorClass : inputClass}
                />
                <FieldError message={errors.website} />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div>
                <Label required>Street Address</Label>
                <Input
                  value={data.address}
                  onChange={(e) => update("address", e.target.value)}
                  className={errors.address ? inputErrorClass : inputClass}
                />
                <FieldError message={errors.address} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label required>City</Label>
                  <Input
                    value={data.city}
                    onChange={(e) => update("city", e.target.value)}
                    className={errors.city ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.city} />
                </div>
                <div>
                  <Label required>State</Label>
                  <Input
                    value={data.state}
                    onChange={(e) => update("state", e.target.value)}
                    className={errors.state ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.state} />
                </div>
                <div>
                  <Label required>ZIP</Label>
                  <Input
                    value={data.zip}
                    onChange={(e) => update("zip", e.target.value)}
                    className={errors.zip ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.zip} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div>
                <Label>Treatment Rooms</Label>
                <Input
                  type="number"
                  min="1"
                  value={data.treatmentRooms ?? ""}
                  onChange={(e) =>
                    update(
                      "treatmentRooms",
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  className={errors.treatmentRooms ? inputErrorClass : inputClass}
                />
                <FieldError message={errors.treatmentRooms} />
              </div>

              <div>
                <Label>Operating Hours</Label>
                <div className="rounded-[6px] border border-[#e5edf5] divide-y divide-[#e5edf5] mt-1">
                  {DAYS.map(({ key, label }) => {
                    const dayHours = hours[key as keyof OperatingHoursMap];
                    const isOpen = !!dayHours;
                    return (
                      <div key={key} className="flex items-center gap-3 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDay(key)}
                          className={`flex items-center justify-center w-10 h-7 rounded-[4px] text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                            isOpen
                              ? "bg-[#ededfc] text-[#533afd]"
                              : "bg-[#f6f9fc] text-[#64748d] hover:bg-[#e5edf5]"
                          }`}
                        >
                          {label}
                        </button>
                        {isOpen ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={dayHours.open}
                              onChange={(e) => updateDayHours(key, "open", e.target.value)}
                              className={timeInputClass}
                            />
                            <span className="text-[13px] text-[#64748d]">to</span>
                            <input
                              type="time"
                              value={dayHours.close}
                              onChange={(e) => updateDayHours(key, "close", e.target.value)}
                              className={timeInputClass}
                            />
                          </div>
                        ) : (
                          <span className="text-[13px] text-[#64748d]">Closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <div>
                <Label>Billing Contact Name</Label>
                <Input
                  value={data.billingContactName}
                  onChange={(e) => update("billingContactName", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Billing Email</Label>
                  <Input
                    value={data.billingContactEmail}
                    onChange={(e) => update("billingContactEmail", e.target.value)}
                    type="email"
                    className={errors.billingContactEmail ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.billingContactEmail} />
                </div>
                <div>
                  <Label>Billing Phone</Label>
                  <Input
                    value={data.billingContactPhone}
                    onChange={(e) => update("billingContactPhone", e.target.value)}
                    className={errors.billingContactPhone ? inputErrorClass : inputClass}
                  />
                  <FieldError message={errors.billingContactPhone} />
                </div>
              </div>
            </div>
          )}

          {errors._form && (
            <div className="mt-4 rounded-[4px] border border-[#df1b41]/20 bg-[#FDE8EC] px-3 py-2 animate-in fade-in duration-200">
              <p className="text-[13px] text-[#df1b41]">{errors._form}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#e5edf5]">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="h-9 px-4 rounded-[4px] border-[#e5edf5] text-[14px] text-[#061b31] cursor-pointer transition-all duration-200 hover:translate-x-[-2px]"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[#64748d] mr-2">
                Step {step} of {steps.length}
              </span>
              {step < 4 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="h-9 px-4 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" strokeWidth={1.5} />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="h-9 px-5 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer disabled:opacity-50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

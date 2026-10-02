"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSIGNABLE_STAFF_ROLES, ROLE_LABELS } from "@/lib/permissions";
import type { CreateDoctorData } from "@/types/doctor";

type StaffRole = NonNullable<CreateDoctorData["role"]>;

interface Branch {
  id: string;
  name: string;
}

interface CreateDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  onCreated: () => void;
}

export function CreateDoctorDialog({
  open,
  onOpenChange,
  branches,
  onCreated,
}: CreateDoctorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [role, setRole] = useState<StaffRole>("DOCTOR");

  // Professional fields
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [education, setEducation] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setBranchId(branches[0]?.id ?? "");
    setRole("DOCTOR");
    setLicenseNumber("");
    setSpecialties("");
    setEducation("");
    setYearsExperience("");
    setError(null);
    setShowPassword(false);
    setShowConfirm(false);
  }

  const isValid =
    name.trim() &&
    email.trim() &&
    password.length >= 8 &&
    password === confirmPassword &&
    branchId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        password,
        branchId,
        role,
      };
      if (phone.trim()) body.phone = phone.trim();
      if (licenseNumber.trim()) body.licenseNumber = licenseNumber.trim();
      if (specialties.trim()) {
        body.specialties = specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (education.trim()) body.education = education.trim();
      if (yearsExperience.trim()) {
        body.yearsExperience = parseInt(yearsExperience, 10);
      }

      const res = await fetch("/api/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create doctor");
        return;
      }

      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-140 rounded-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-[18px] font-medium text-foreground">
            Add Staff Member
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6">
          {error && (
            <div className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
              {error}
            </div>
          )}

          {/* Account section */}
          <div className="mt-5">
            <h3 className="text-[14px] font-medium text-foreground mb-3">
              Account
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[13px] text-foreground mb-1 block">
                  Full Name <span className="text-danger">*</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Sarah Chen"
                  className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Email <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@clinic.com"
                    className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Phone
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+60 12-345 6789"
                    className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Password <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 rounded-control border-border bg-white text-[14px] pr-9 focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-secondary hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {password && password.length < 8 && (
                    <p className="text-[12px] text-danger mt-1">
                      Min 8 characters
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Confirm Password <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-9 rounded-control border-border bg-white text-[14px] pr-9 focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-secondary hover:text-foreground"
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-[12px] text-danger mt-1">
                      Passwords don&apos;t match
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Branch <span className="text-danger">*</span>
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="flex h-9 w-full rounded-control border border-border bg-white px-3 text-[14px] text-foreground focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) =>
                      setRole(e.target.value as StaffRole)
                    }
                    className="flex h-9 w-full rounded-control border border-border bg-white px-3 text-[14px] text-foreground focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  >
                    {ASSIGNABLE_STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Professional section (not for front desk — no doctor profile) */}
          {role !== "FRONT_DESK" && (
          <div className="mt-5">
            <h3 className="text-[14px] font-medium text-foreground mb-3">
              Professional (Optional)
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    License Number
                  </label>
                  <Input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="DC-12345"
                    className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-[13px] text-foreground mb-1 block">
                    Years Experience
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={70}
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(e.target.value)}
                    placeholder="8"
                    className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] text-foreground mb-1 block">
                  Specialties (comma separated)
                </label>
                <Input
                  value={specialties}
                  onChange={(e) => setSpecialties(e.target.value)}
                  placeholder="Sports Chiro, Pediatric"
                  className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>

              <div>
                <label className="text-[13px] text-foreground mb-1 block">
                  Education
                </label>
                <Input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="Doctor of Chiropractic, Palmer College"
                  className="h-9 rounded-control border-border bg-white text-[14px] focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
          )}

          <DialogFooter className="mt-6 flex items-center justify-between gap-3 sm:justify-between">
            <p className="text-[13px] text-fg-secondary">
              The doctor will use these credentials to log in.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="h-9 rounded-control text-[14px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || loading}
                className="h-9 rounded-control bg-primary hover:bg-primary/90 text-white text-[14px] font-medium px-4"
              >
                {loading ? "Creating..." : "Create Doctor"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

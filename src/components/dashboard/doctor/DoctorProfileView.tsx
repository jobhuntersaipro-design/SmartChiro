"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "./TagInput";
import { ScheduleGrid } from "./ScheduleGrid";
import type { DoctorDetail, UpdateDoctorData, WorkingSchedule } from "@/types/doctor";

const SPECIALTY_SUGGESTIONS = [
  "Sports",
  "Pediatric",
  "Rehabilitation",
  "Geriatric",
  "Prenatal",
  "Neurology",
  "Orthopedic",
  "Wellness",
  "Nutrition",
  "Acupuncture",
];

interface DoctorProfileViewProps {
  doctor: DoctorDetail;
  currentUserId: string;
  canEdit: boolean;
  canToggleStatus: boolean;
}

export function DoctorProfileView({
  doctor: initialDoctor,
  currentUserId,
  canEdit,
  canToggleStatus,
}: DoctorProfileViewProps) {
  const [doctor, setDoctor] = useState(initialDoctor);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState(doctor.name ?? "");
  const [phone, setPhone] = useState(doctor.phone ?? "");
  const [licenseNumber, setLicenseNumber] = useState(doctor.profile?.licenseNumber ?? "");
  const [specialties, setSpecialties] = useState<string[]>(doctor.profile?.specialties ?? []);
  const [yearsExperience, setYearsExperience] = useState(doctor.profile?.yearsExperience?.toString() ?? "");
  const [education, setEducation] = useState(doctor.profile?.education ?? "");
  const [workingSchedule, setWorkingSchedule] = useState<WorkingSchedule | null>(doctor.profile?.workingSchedule ?? null);
  const [treatmentRoom, setTreatmentRoom] = useState(doctor.profile?.treatmentRoom ?? "");
  const [consultationFee, setConsultationFee] = useState(doctor.profile?.consultationFee?.toString() ?? "");
  const [bio, setBio] = useState(doctor.profile?.bio ?? "");
  const [languages, setLanguages] = useState<string[]>(doctor.profile?.languages ?? []);
  const [insurancePlans, setInsurancePlans] = useState<string[]>(doctor.profile?.insurancePlans ?? []);

  const hasChanges = useCallback(() => {
    return (
      name !== (doctor.name ?? "") ||
      phone !== (doctor.phone ?? "") ||
      licenseNumber !== (doctor.profile?.licenseNumber ?? "") ||
      JSON.stringify(specialties) !== JSON.stringify(doctor.profile?.specialties ?? []) ||
      yearsExperience !== (doctor.profile?.yearsExperience?.toString() ?? "") ||
      education !== (doctor.profile?.education ?? "") ||
      JSON.stringify(workingSchedule) !== JSON.stringify(doctor.profile?.workingSchedule ?? null) ||
      treatmentRoom !== (doctor.profile?.treatmentRoom ?? "") ||
      consultationFee !== (doctor.profile?.consultationFee?.toString() ?? "") ||
      bio !== (doctor.profile?.bio ?? "") ||
      JSON.stringify(languages) !== JSON.stringify(doctor.profile?.languages ?? []) ||
      JSON.stringify(insurancePlans) !== JSON.stringify(doctor.profile?.insurancePlans ?? [])
    );
  }, [name, phone, licenseNumber, specialties, yearsExperience, education, workingSchedule, treatmentRoom, consultationFee, bio, languages, insurancePlans, doctor]);

  function resetForm() {
    setName(doctor.name ?? "");
    setPhone(doctor.phone ?? "");
    setLicenseNumber(doctor.profile?.licenseNumber ?? "");
    setSpecialties(doctor.profile?.specialties ?? []);
    setYearsExperience(doctor.profile?.yearsExperience?.toString() ?? "");
    setEducation(doctor.profile?.education ?? "");
    setWorkingSchedule(doctor.profile?.workingSchedule ?? null);
    setTreatmentRoom(doctor.profile?.treatmentRoom ?? "");
    setConsultationFee(doctor.profile?.consultationFee?.toString() ?? "");
    setBio(doctor.profile?.bio ?? "");
    setLanguages(doctor.profile?.languages ?? []);
    setInsurancePlans(doctor.profile?.insurancePlans ?? []);
  }

  async function handleSave() {
    setSaving(true);
    setToast(null);

    const data: UpdateDoctorData = {};
    if (name !== (doctor.name ?? "")) data.name = name;
    if (phone !== (doctor.phone ?? "")) data.phone = phone;
    if (licenseNumber !== (doctor.profile?.licenseNumber ?? "")) data.licenseNumber = licenseNumber || null;
    if (JSON.stringify(specialties) !== JSON.stringify(doctor.profile?.specialties ?? [])) data.specialties = specialties;
    if (yearsExperience !== (doctor.profile?.yearsExperience?.toString() ?? "")) {
      data.yearsExperience = yearsExperience ? parseInt(yearsExperience, 10) : null;
    }
    if (education !== (doctor.profile?.education ?? "")) data.education = education || null;
    if (JSON.stringify(workingSchedule) !== JSON.stringify(doctor.profile?.workingSchedule ?? null)) data.workingSchedule = workingSchedule;
    if (treatmentRoom !== (doctor.profile?.treatmentRoom ?? "")) data.treatmentRoom = treatmentRoom || null;
    if (consultationFee !== (doctor.profile?.consultationFee?.toString() ?? "")) {
      data.consultationFee = consultationFee ? parseFloat(consultationFee) : null;
    }
    if (bio !== (doctor.profile?.bio ?? "")) data.bio = bio || null;
    if (JSON.stringify(languages) !== JSON.stringify(doctor.profile?.languages ?? [])) data.languages = languages;
    if (JSON.stringify(insurancePlans) !== JSON.stringify(doctor.profile?.insurancePlans ?? [])) data.insurancePlans = insurancePlans;

    try {
      const res = await fetch(`/api/doctors/${doctor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: json.error ?? "Failed to save" });
      } else {
        setDoctor(json.doctor);
        setToast({ type: "success", message: "Profile saved" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
    setSaving(false);
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    setToast(null);
    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch(`/api/doctors/${doctor.id}/photo`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: json.error ?? "Failed to upload photo" });
      } else {
        setDoctor((prev) => ({ ...prev, image: json.imageUrl }));
        setToast({ type: "success", message: "Photo updated" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
    setUploadingPhoto(false);
  }

  async function handleToggleStatus() {
    const newStatus = !(doctor.profile?.isActive ?? true);
    const confirm = window.confirm(
      newStatus
        ? `Reactivate ${doctor.name ?? "this doctor"}?`
        : `Deactivating ${doctor.name ?? "this doctor"} will hide them from patient assignment. Continue?`
    );
    if (!confirm) return;

    try {
      const res = await fetch(`/api/doctors/${doctor.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const json = await res.json();
      if (res.ok) {
        setDoctor((prev) => ({
          ...prev,
          profile: prev.profile
            ? { ...prev.profile, isActive: json.isActive }
            : { licenseNumber: null, specialties: [], yearsExperience: null, education: null, workingSchedule: null, treatmentRoom: null, consultationFee: null, bio: null, languages: [], insurancePlans: [], isActive: json.isActive },
        }));
        setToast({ type: "success", message: newStatus ? "Doctor reactivated" : "Doctor deactivated" });
      } else {
        setToast({ type: "error", message: json.error ?? "Failed to update status" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to toggle status" });
    }
  }

  // Clear toast after 3s
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const initials = (doctor.name || doctor.email || "?")
    .split(" ")
    .map((n) => n[0] ?? "")
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  const isActive = doctor.profile?.isActive ?? true;
  const isSelf = currentUserId === doctor.id;

  return (
    <div className="max-w-[1000px] mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-[6px] text-[14px] font-medium shadow-md transition-all ${
            toast.type === "success"
              ? "bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]"
              : "bg-[#fef2f2] text-[#df1b41] border border-[#fecaca]"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column — Avatar + Info */}
        <div className="w-full lg:w-[280px] shrink-0">
          <div className="rounded-[6px] border border-[#e5edf5] bg-white p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
            {/* Avatar */}
            <div className="flex justify-center mb-4">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  {doctor.image && <AvatarImage src={doctor.image} alt={doctor.name ?? "Doctor"} />}
                  <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[20px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {canEdit && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* Name */}
            <h2 className="text-center text-[18px] font-medium text-[#061b31] mb-1">
              {doctor.name ?? "Unnamed"}
            </h2>
            <p className="text-center text-[13px] text-[#64748d] mb-3">
              {doctor.email}
            </p>

            {/* Role badges */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {doctor.branches.map((b) => (
                <Badge
                  key={b.id}
                  variant="secondary"
                  className="rounded-full bg-[#ededfc] text-[#533afd] text-[12px] font-medium border-0 hover:bg-[#ededfc]"
                >
                  {b.role === "OWNER" ? "Owner" : b.role === "ADMIN" ? "Admin" : "Doctor"} — {b.name}
                </Badge>
              ))}
            </div>

            {/* Active/Inactive status */}
            <div className="flex justify-center mb-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                  isActive
                    ? "bg-[#ecfdf5] text-[#059669]"
                    : "bg-[#fef2f2] text-[#df1b41]"
                }`}
              >
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Toggle status button */}
            {canToggleStatus && (
              <Button
                onClick={handleToggleStatus}
                variant="outline"
                size="sm"
                className="w-full rounded-[4px] border-[#e5edf5] text-[13px] cursor-pointer"
              >
                {isActive ? "Deactivate Doctor" : "Reactivate Doctor"}
              </Button>
            )}

            {/* Stats */}
            <div className="mt-4 pt-4 border-t border-[#e5edf5] space-y-2">
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748d]">Patients</span>
                <span className="font-medium text-[#061b31]">{doctor.stats.patientCount}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748d]">Total Visits</span>
                <span className="font-medium text-[#061b31]">{doctor.stats.totalVisits}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748d]">X-Rays</span>
                <span className="font-medium text-[#061b31]">{doctor.stats.totalXrays}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Tabs */}
        <div className="flex-1 min-w-0">
          <div className="rounded-[6px] border border-[#e5edf5] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
            <Tabs defaultValue="professional" className="w-full">
              <TabsList className="w-full justify-start border-b border-[#e5edf5] rounded-none bg-transparent px-5 pt-1 h-auto">
                <TabsTrigger
                  value="professional"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#533afd] data-[state=active]:text-[#533afd] data-[state=active]:shadow-none text-[14px] text-[#64748d] pb-2.5 px-3"
                >
                  Professional
                </TabsTrigger>
                <TabsTrigger
                  value="schedule"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#533afd] data-[state=active]:text-[#533afd] data-[state=active]:shadow-none text-[14px] text-[#64748d] pb-2.5 px-3"
                >
                  Schedule & Clinic
                </TabsTrigger>
                <TabsTrigger
                  value="additional"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#533afd] data-[state=active]:text-[#533afd] data-[state=active]:shadow-none text-[14px] text-[#64748d] pb-2.5 px-3"
                >
                  Additional
                </TabsTrigger>
                <TabsTrigger
                  value="contact"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#533afd] data-[state=active]:text-[#533afd] data-[state=active]:shadow-none text-[14px] text-[#64748d] pb-2.5 px-3"
                >
                  Contact
                </TabsTrigger>
              </TabsList>

              {/* Professional Info */}
              <TabsContent value="professional" className="p-5 space-y-4 mt-0">
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">License / NPI Number</label>
                  <Input
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. NPI-1234567890"
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31]"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Specialties</label>
                  <TagInput
                    value={specialties}
                    onChange={setSpecialties}
                    suggestions={SPECIALTY_SUGGESTIONS}
                    placeholder="Type a specialty and press Enter..."
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Years of Experience</label>
                  <Input
                    type="number"
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. 10"
                    min={0}
                    max={70}
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] w-[120px]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Education & Certifications</label>
                  <textarea
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Degrees, certifications, training..."
                    maxLength={1000}
                    rows={3}
                    className="w-full rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] px-3 py-2 text-[14px] text-[#061b31] placeholder:text-[#64748d] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] outline-none resize-none disabled:opacity-50"
                  />
                </div>
              </TabsContent>

              {/* Schedule & Clinic */}
              <TabsContent value="schedule" className="p-5 space-y-4 mt-0">
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Working Schedule</label>
                  <ScheduleGrid
                    value={workingSchedule}
                    onChange={setWorkingSchedule}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Treatment Room</label>
                  <Input
                    value={treatmentRoom}
                    onChange={(e) => setTreatmentRoom(e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. Room 3"
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] w-[200px]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Consultation Fee</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] text-[#64748d]">MYR</span>
                    <Input
                      type="number"
                      value={consultationFee}
                      onChange={(e) => setConsultationFee(e.target.value)}
                      disabled={!canEdit}
                      placeholder="0.00"
                      min={0}
                      max={99999.99}
                      step={0.01}
                      className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] w-[150px]"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Additional Info */}
              <TabsContent value="additional" className="p-5 space-y-4 mt-0">
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">
                    Bio <span className="text-[#a3acb9]">({bio.length}/2000)</span>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Patient-facing bio..."
                    maxLength={2000}
                    rows={4}
                    className="w-full rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] px-3 py-2 text-[14px] text-[#061b31] placeholder:text-[#64748d] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd] outline-none resize-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Languages Spoken</label>
                  <TagInput
                    value={languages}
                    onChange={setLanguages}
                    placeholder="Type a language and press Enter..."
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Insurance Plans</label>
                  <TagInput
                    value={insurancePlans}
                    onChange={setInsurancePlans}
                    placeholder="Type an insurance plan and press Enter..."
                    maxItems={50}
                    disabled={!canEdit}
                  />
                </div>
              </TabsContent>

              {/* Contact */}
              <TabsContent value="contact" className="p-5 space-y-4 mt-0">
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Email</label>
                  <Input
                    value={doctor.email}
                    disabled
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#f6f9fc] text-[14px] text-[#64748d] w-full"
                  />
                  <p className="text-[12px] text-[#a3acb9] mt-1">Email cannot be changed here.</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Phone</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. +60 12 345 6789"
                    maxLength={20}
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] w-full"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1">Name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Full name"
                    maxLength={100}
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] w-full"
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Save/Cancel bar */}
            {canEdit && (
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e5edf5]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetForm}
                  disabled={!hasChanges() || saving}
                  className="rounded-[4px] border-[#e5edf5] text-[13px] cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges() || saving}
                  className="rounded-[4px] bg-[#533afd] hover:bg-[#4434d4] text-white text-[13px] cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

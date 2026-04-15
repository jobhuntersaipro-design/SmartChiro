"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Patient, PatientXray } from "@/types/patient";
import { Mail, Phone, MapPin, Calendar, User, FileText, ScanLine, AlertCircle, Upload, ExternalLink } from "lucide-react";
import { XrayUpload } from "@/components/xray/XrayUpload";

interface PatientDetailSheetProps {
  patient: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="h-4 w-4 text-[#64748d] mt-0.5 shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[13px] text-[#64748d]">{label}</p>
        <p className="text-[15px] text-[#061b31] break-words">{value}</p>
      </div>
    </div>
  );
}

function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-4 first:mt-0">
      <h4 className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
        {children}
      </h4>
      {action}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-center">
      <p className="text-[18px] font-semibold text-[#061b31]">{value}</p>
      <p className="text-[13px] text-[#64748d]">{label}</p>
    </div>
  );
}

const bodyRegionLabels: Record<string, string> = {
  CERVICAL: "Cervical",
  THORACIC: "Thoracic",
  LUMBAR: "Lumbar",
  PELVIS: "Pelvis",
  FULL_SPINE: "Full Spine",
};

function XrayCard({ xray, patientId }: { xray: PatientXray; patientId: string }) {
  return (
    <a
      href={`/dashboard/xrays/${patientId}/${xray.id}/annotate`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-[6px] border border-[#e5edf5] bg-white p-3 transition-colors hover:bg-[#f6f9fc] hover:border-[#C1C9D2] cursor-pointer"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-[#1A1F36]">
        <ScanLine className="h-5 w-5 text-[#64748d]" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-[#061b31] truncate group-hover:text-[#533afd] transition-colors">
          {xray.title || "Untitled X-Ray"}
        </p>
        <p className="text-[13px] text-[#64748d]">
          {bodyRegionLabels[xray.bodyRegion || ""] || xray.bodyRegion || "—"} · {xray.viewType || "—"} · {new Date(xray.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {xray.annotationCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-[#ededfc] px-1.5 py-0.5 text-[12px] font-medium text-[#533afd]">
            {xray.annotationCount} ann.
          </span>
        )}
        <ExternalLink className="h-3.5 w-3.5 text-[#64748d] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
      </div>
    </a>
  );
}

export function PatientDetailSheet({ patient, open, onOpenChange }: PatientDetailSheetProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadedXrayIds, setUploadedXrayIds] = useState<string[]>([]);

  if (!patient) return null;

  const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setShowUpload(false);
        setUploadedXrayIds([]);
      }
    }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-5 pb-4 border-b border-[#e5edf5]">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[15px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-[18px] font-semibold text-[#061b31]">
                {fullName}
              </SheetTitle>
              <SheetDescription className="text-[13px] text-[#64748d]">
                {age ? `${age} y/o` : ""} {patient.gender || ""} — Patient since {new Date(patient.createdAt).toLocaleDateString("en-MY", { month: "short", year: "numeric" })}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="p-5 space-y-1">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Visits" value={patient.totalVisits} />
            <StatCard label="X-Rays" value={patient.totalXrays + uploadedXrayIds.length} />
            <StatCard
              label="Last Visit"
              value={patient.lastVisit
                ? new Date(patient.lastVisit).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
                : "—"
              }
            />
          </div>

          {/* X-Rays Section */}
          <SectionHeading
            action={
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="flex items-center gap-1 rounded-[4px] px-2 py-1 text-[13px] font-medium text-[#533afd] transition-colors hover:bg-[#ededfc]"
              >
                <Upload className="h-3 w-3" strokeWidth={2} />
                {showUpload ? "Cancel" : "Upload X-Ray"}
              </button>
            }
          >
            X-Rays
          </SectionHeading>

          {/* Upload area */}
          {showUpload && (
            <div className="mb-3">
              <XrayUpload
                patientId={patient.id}
                uploadedById={patient.doctorId}
                onUploadComplete={(xrayId) => {
                  setUploadedXrayIds((prev) => [xrayId, ...prev]);
                  setShowUpload(false);
                }}
              />
            </div>
          )}

          {/* Newly uploaded X-rays */}
          {uploadedXrayIds.length > 0 && (
            <div className="space-y-2 mb-2">
              {uploadedXrayIds.map((xrayId) => (
                <a
                  key={xrayId}
                  href={`/dashboard/xrays/${patient.id}/${xrayId}/annotate`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-[6px] border border-[#e5edf5] bg-[#E8F5E8] p-3 transition-colors hover:bg-[#d4edd4] cursor-pointer"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-[#1A1F36]">
                    <ScanLine className="h-5 w-5 text-[#64748d]" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-[#061b31] group-hover:text-[#533afd] transition-colors">
                      New Upload
                    </p>
                    <p className="text-[13px] text-[#30B130]">
                      Just uploaded — click to annotate
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-[#64748d] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" strokeWidth={1.5} />
                </a>
              ))}
            </div>
          )}

          {/* X-ray gallery */}
          {patient.xrays.length > 0 ? (
            <div className="space-y-2">
              {patient.xrays.map((xray) => (
                <XrayCard key={xray.id} xray={xray} patientId={patient.id} />
              ))}
            </div>
          ) : uploadedXrayIds.length === 0 ? (
            <div className="rounded-[6px] border border-[#e5edf5] bg-[#f6f9fc] p-4 text-center">
              <ScanLine className="h-5 w-5 text-[#64748d] mx-auto mb-1" strokeWidth={1.5} />
              <p className="text-[13px] text-[#64748d]">No X-rays yet</p>
              <button
                onClick={() => setShowUpload(true)}
                className="mt-2 text-[13px] font-medium text-[#533afd] hover:underline"
              >
                Upload first X-ray
              </button>
            </div>
          ) : null}

          {/* Contact Information */}
          <SectionHeading>Contact</SectionHeading>
          <DetailRow icon={Mail} label="Email" value={patient.email} />
          <DetailRow icon={Phone} label="Phone" value={patient.phone} />
          <DetailRow icon={MapPin} label="Address" value={patient.address} />
          <DetailRow icon={AlertCircle} label="Emergency Contact" value={patient.emergencyContact} />

          {/* Clinical */}
          <SectionHeading>Clinical</SectionHeading>
          <DetailRow icon={User} label="Assigned Doctor" value={patient.doctorName} />
          <DetailRow icon={Calendar} label="Date of Birth" value={
            patient.dateOfBirth
              ? new Date(patient.dateOfBirth).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })
              : null
          } />
          <DetailRow icon={FileText} label="Medical History" value={patient.medicalHistory} />
          <DetailRow icon={ScanLine} label="Notes" value={patient.notes} />

          {/* Recent Visits placeholder */}
          <SectionHeading>Recent Visits</SectionHeading>
          <div className="rounded-[6px] border border-[#e5edf5] bg-[#f6f9fc] p-4 text-center">
            <p className="text-[13px] text-[#64748d]">Visit history will appear here once visits are recorded</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

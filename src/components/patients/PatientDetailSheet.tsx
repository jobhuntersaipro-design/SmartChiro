"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { MockPatient } from "@/lib/mock-data";
import { Mail, Phone, MapPin, Calendar, User, FileText, ScanLine, AlertCircle } from "lucide-react";

interface PatientDetailSheetProps {
  patient: MockPatient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Icon className="h-4 w-4 text-[#697386] mt-0.5 shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[13px] text-[#697386]">{label}</p>
        <p className="text-[15px] text-[#0A2540] break-words">{value}</p>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386] mb-2 mt-4 first:mt-0">
      {children}
    </h4>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 py-2 text-center">
      <p className="text-[18px] font-semibold text-[#0A2540]">{value}</p>
      <p className="text-[13px] text-[#697386]">{label}</p>
    </div>
  );
}

export function PatientDetailSheet({ patient, open, onOpenChange }: PatientDetailSheetProps) {
  if (!patient) return null;

  const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const statusConfig = {
    active: { label: "Active", bg: "bg-[#E8F5E8]", text: "text-[#30B130]" },
    inactive: { label: "Inactive", bg: "bg-[#F0F3F7]", text: "text-[#697386]" },
  } as const;
  const status = statusConfig[patient.status];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto p-0">
        <SheetHeader className="p-5 pb-4 border-b border-[#E3E8EE]">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-[#F0EEFF] text-[#635BFF] text-[15px] font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-[18px] font-semibold text-[#0A2540]">
                {fullName}
              </SheetTitle>
              <SheetDescription className="text-[13px] text-[#697386]">
                {age ? `${age} y/o` : ""} {patient.gender || ""} — Patient since {new Date(patient.createdAt).toLocaleDateString("en-MY", { month: "short", year: "numeric" })}
              </SheetDescription>
            </div>
          </div>
          <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[13px] font-medium mt-2 ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        </SheetHeader>

        <div className="p-5 space-y-1">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard label="Visits" value={patient.totalVisits} />
            <StatCard label="X-Rays" value={patient.totalXrays} />
            <StatCard
              label="Last Visit"
              value={patient.lastVisit
                ? new Date(patient.lastVisit).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
                : "—"
              }
            />
          </div>

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
          <div className="rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] p-4 text-center">
            <p className="text-[13px] text-[#697386]">Visit history will appear here once connected to the database</p>
          </div>

          {/* X-Rays placeholder */}
          <SectionHeading>X-Rays</SectionHeading>
          <div className="rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] p-4 text-center">
            <p className="text-[13px] text-[#697386]">X-ray images will appear here once connected to the database</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

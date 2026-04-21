"use client";

import { AlertTriangle } from "lucide-react";
import { ExternalLink } from "@/components/patients/ExternalLink";
import {
  formatDobWithAge,
  buildWhatsAppUrl,
  buildMailtoUrl,
  buildMapsUrl,
  buildDoctorHref,
  buildBranchHref,
} from "@/lib/format";

interface PatientProfileTabProps {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    icNumber: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    occupation: string | null;
    race: string | null;
    maritalStatus: string | null;
    bloodType: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    emergencyRelation: string | null;
    allergies: string | null;
    medicalHistory: string | null;
    referralSource: string | null;
    notes: string | null;
    status: string;
    initialTreatmentFee?: number | null;
    firstTreatmentFee?: number | null;
    standardFollowUpFee?: number | null;
    doctorId: string;
    doctorName: string;
    branchId: string;
    branchName?: string;
    createdAt: string;
    updatedAt?: string;
  };
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFullAddress(patient: PatientProfileTabProps["patient"]): string {
  const parts = [
    patient.addressLine1,
    patient.addressLine2,
    patient.city,
    patient.state,
    patient.postcode,
    patient.country,
  ].filter(Boolean);
  return parts.join(", ") || "-";
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailRow({
  label,
  value,
  mono,
  danger,
  icon,
  href,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
  href?: string | null;
}) {
  const display = value || "-";
  const shouldLink = !!href && !!value;
  const valueClasses = `text-[14px] mt-0.5 ${
    danger ? "text-[#DF1B41] font-medium" : "text-[#061b31]"
  } ${mono ? "font-mono text-[13px]" : ""}`;

  const inner = shouldLink ? (
    <ExternalLink href={href!} className="text-[#533afd] hover:underline break-words">
      {display}
    </ExternalLink>
  ) : (
    display
  );

  return (
    <div>
      <p className="text-[13px] text-[#64748d]">{label}</p>
      <p className={valueClasses}>
        {icon ? (
          <span className="inline-flex items-center gap-1">
            {icon}
            {inner}
          </span>
        ) : (
          inner
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 mb-4">
      <h4 className="text-[15px] font-medium text-[#061b31] mb-3">{title}</h4>
      {children}
    </div>
  );
}

export function PatientProfileTab({ patient }: PatientProfileTabProps) {
  const dobDisplay = formatDobWithAge(patient.dateOfBirth);
  const hasAllergies = !!patient.allergies && patient.allergies.trim().length > 0;
  const fullAddress = buildFullAddress(patient);
  const addressForLink = fullAddress === "-" ? null : fullAddress;
  const phoneHref = buildWhatsAppUrl(patient.phone);
  const emailHref = buildMailtoUrl(patient.email);
  const mapsHref = buildMapsUrl(addressForLink);
  const emergencyPhoneHref = buildWhatsAppUrl(patient.emergencyPhone);

  return (
    <div>
      {/* Personal Information */}
      <Section title="Personal Information">
        <div className="grid grid-cols-2 gap-y-3 gap-x-8">
          <DetailRow
            label="Full Name"
            value={`${patient.firstName} ${patient.lastName}`}
          />
          <DetailRow label="IC Number" value={patient.icNumber} mono />
          <DetailRow label="Date of Birth" value={dobDisplay} />
          <DetailRow label="Gender" value={patient.gender ? formatStatus(patient.gender) : null} />
          <DetailRow label="Occupation" value={patient.occupation} />
          <DetailRow label="Race" value={patient.race} />
          <DetailRow label="Marital Status" value={patient.maritalStatus ? formatStatus(patient.maritalStatus) : null} />
          <DetailRow label="Blood Type" value={patient.bloodType} />
        </div>
      </Section>

      {/* Contact Information */}
      <Section title="Contact Information">
        <div className="grid grid-cols-2 gap-y-3 gap-x-8">
          <DetailRow label="Email" value={patient.email} href={emailHref} />
          <DetailRow label="Phone" value={patient.phone} href={phoneHref} />
          <div className="col-span-2">
            <DetailRow label="Address" value={fullAddress} href={mapsHref} />
          </div>
        </div>
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact">
        <div className="grid grid-cols-2 gap-y-3 gap-x-8">
          <DetailRow label="Name" value={patient.emergencyName} />
          <DetailRow label="Phone" value={patient.emergencyPhone} href={emergencyPhoneHref} />
          <DetailRow label="Relationship" value={patient.emergencyRelation} />
        </div>
      </Section>

      {/* Clinical Information */}
      <Section title="Clinical Information">
        <div className="grid grid-cols-2 gap-y-3 gap-x-8">
          <DetailRow
            label="Allergies"
            value={patient.allergies}
            danger={hasAllergies}
            icon={
              hasAllergies ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#DF1B41] inline-flex shrink-0" />
              ) : undefined
            }
          />
          <DetailRow label="Referral Source" value={patient.referralSource} />
          <div className="col-span-2">
            <DetailRow label="Medical History" value={patient.medicalHistory} />
          </div>
          <div className="col-span-2">
            <DetailRow label="Notes" value={patient.notes} />
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section title="Pricing (MYR)">
        <div className="grid grid-cols-3 gap-y-3 gap-x-8">
          <DetailRow
            label="Initial Treatment Fee"
            value={patient.initialTreatmentFee != null ? `RM ${patient.initialTreatmentFee.toFixed(2)}` : null}
          />
          <DetailRow
            label="First Treatment"
            value={patient.firstTreatmentFee != null ? `RM ${patient.firstTreatmentFee.toFixed(2)}` : null}
          />
          <DetailRow
            label="Standard Follow-Up"
            value={patient.standardFollowUpFee != null ? `RM ${patient.standardFollowUpFee.toFixed(2)}` : null}
          />
        </div>
      </Section>

      {/* Administrative */}
      <Section title="Administrative">
        <div className="grid grid-cols-2 gap-y-3 gap-x-8">
          <DetailRow label="Patient ID" value={patient.id} mono />
          <DetailRow
            label="Doctor"
            value={patient.doctorName}
            href={patient.doctorId ? buildDoctorHref(patient.doctorId) : null}
          />
          <DetailRow
            label="Branch"
            value={patient.branchName || null}
            href={patient.branchId ? buildBranchHref(patient.branchId) : null}
          />
          <DetailRow label="Status" value={formatStatus(patient.status)} />
          <DetailRow label="Created" value={formatDateTime(patient.createdAt)} />
          <DetailRow
            label="Updated"
            value={patient.updatedAt ? formatDateTime(patient.updatedAt) : null}
          />
        </div>
      </Section>
    </div>
  );
}

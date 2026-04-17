"use client";

import {
  Award, GraduationCap, Clock, Languages, Building2, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import type { DoctorDetail } from "@/types/doctor";

interface DoctorProfessionalTabProps {
  doctor: DoctorDetail;
}

export function DoctorProfessionalTab({ doctor }: DoctorProfessionalTabProps) {
  const profile = doctor.profile;

  if (!profile) {
    return (
      <div className="py-12 text-center">
        <Award className="h-10 w-10 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">No professional profile has been set up yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bio */}
      {profile.bio && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
            About
          </h3>
          <p className="text-[14px] text-[#273951] leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Credentials */}
      {(profile.licenseNumber || profile.education || profile.yearsExperience != null) && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
            Credentials
          </h3>
          <div className="space-y-3">
            {profile.licenseNumber && (
              <div className="flex items-start gap-3">
                <Award className="h-4 w-4 text-[#533afd] mt-0.5 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[12px] text-[#64748d]">License Number</p>
                  <p className="text-[14px] text-[#061b31]">{profile.licenseNumber}</p>
                </div>
              </div>
            )}
            {profile.education && (
              <div className="flex items-start gap-3">
                <GraduationCap className="h-4 w-4 text-[#0570DE] mt-0.5 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[12px] text-[#64748d]">Education</p>
                  <p className="text-[14px] text-[#061b31]">{profile.education}</p>
                </div>
              </div>
            )}
            {profile.yearsExperience != null && (
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-[#F5A623] mt-0.5 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-[12px] text-[#64748d]">Experience</p>
                  <p className="text-[14px] text-[#061b31]">{profile.yearsExperience} years</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Specialties */}
      {profile.specialties.length > 0 && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
            Specialties
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.specialties.map((s) => (
              <span
                key={s}
                className="text-[13px] text-[#533afd] bg-[#ededfc] rounded-full px-3 py-1"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {profile.languages.length > 0 && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
            <div className="flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5" strokeWidth={1.5} />
              Languages
            </div>
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.languages.map((l) => (
              <span
                key={l}
                className="text-[13px] text-[#0570DE] bg-[rgba(5,112,222,0.1)] rounded-full px-3 py-1"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Branches */}
      {doctor.branches.length > 0 && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
          <h3 className="text-[13px] font-medium text-[#273951] uppercase tracking-wide mb-3 pb-2 border-b border-[#e5edf5]">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Branch Memberships
            </div>
          </h3>
          <div className="space-y-2.5">
            {doctor.branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between">
                <Link
                  href={`/dashboard/branches/${b.id}`}
                  className="text-[14px] text-[#061b31] hover:text-[#533afd] transition-colors flex items-center gap-1"
                >
                  {b.name}
                  <ChevronRight className="h-3 w-3 text-[#c1c9d2]" strokeWidth={1.5} />
                </Link>
                <span className="text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5">
                  {b.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

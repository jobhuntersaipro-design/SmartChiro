"use client";

import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, User, Calendar, Image } from "lucide-react";
import type { PatientXray } from "@/types/patient";

interface PatientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContact: string | null;
  medicalHistory: string | null;
  notes: string | null;
  doctorName: string;
  createdAt: string;
  xrays: PatientXray[];
}

export function PatientDetailView({ patient }: { patient: PatientData }) {
  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      {/* Back link */}
      <Link
        href="/dashboard/patients"
        className="mb-6 inline-flex items-center gap-1.5 text-sm transition-colors hover:underline"
        style={{ color: "#697386" }}
      >
        <ArrowLeft size={14} />
        Back to Patients
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="flex items-center justify-center rounded-full text-lg font-semibold"
          style={{
            width: 56,
            height: 56,
            backgroundColor: "#F0EEFF",
            color: "#635BFF",
          }}
        >
          {patient.firstName[0]}
          {patient.lastName[0]}
        </div>
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "#0A2540" }}
          >
            {fullName}
          </h1>
          <p className="text-sm" style={{ color: "#697386" }}>
            Patient since{" "}
            {new Date(patient.createdAt).toLocaleDateString("en-MY", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" · "}Dr. {patient.doctorName}
          </p>
        </div>
      </div>

      {/* Contact Info Card */}
      <div
        className="mb-6 p-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E3E8EE",
          borderRadius: 6,
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)",
        }}
      >
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: "#0A2540" }}
        >
          Contact Information
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {patient.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail size={14} style={{ color: "#697386" }} />
              <span style={{ color: "#425466" }}>{patient.email}</span>
            </div>
          )}
          {patient.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone size={14} style={{ color: "#697386" }} />
              <span style={{ color: "#425466" }}>{patient.phone}</span>
            </div>
          )}
          {patient.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={14} style={{ color: "#697386" }} />
              <span style={{ color: "#425466" }}>{patient.address}</span>
            </div>
          )}
          {patient.gender && (
            <div className="flex items-center gap-2 text-sm">
              <User size={14} style={{ color: "#697386" }} />
              <span style={{ color: "#425466" }}>{patient.gender}</span>
            </div>
          )}
          {patient.dateOfBirth && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={14} style={{ color: "#697386" }} />
              <span style={{ color: "#425466" }}>
                {new Date(patient.dateOfBirth).toLocaleDateString("en-MY", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* X-Rays */}
      <div
        className="p-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E3E8EE",
          borderRadius: 6,
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)",
        }}
      >
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: "#0A2540" }}
        >
          X-Rays ({patient.xrays.length})
        </h2>

        {patient.xrays.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "#697386" }}>
            No X-rays uploaded yet
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {patient.xrays.map((xray) => (
              <Link
                key={xray.id}
                href={`/dashboard/xrays/${patient.id}/${xray.id}/annotate`}
                className="group overflow-hidden transition-shadow hover:shadow-md"
                style={{
                  border: "1px solid #E3E8EE",
                  borderRadius: 6,
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    height: 140,
                    backgroundColor: "#1A1F36",
                  }}
                >
                  {xray.thumbnailUrl ? (
                    <img
                      src={xray.thumbnailUrl}
                      alt={xray.title ?? "X-ray"}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Image size={32} style={{ color: "#425466" }} />
                  )}
                </div>
                <div className="p-3">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "#0A2540" }}
                  >
                    {xray.title ?? "Untitled X-ray"}
                  </p>
                  <p className="text-xs" style={{ color: "#697386" }}>
                    {new Date(xray.createdAt).toLocaleDateString("en-MY", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {xray.annotationCount > 0 &&
                      ` · ${xray.annotationCount} annotation${xray.annotationCount > 1 ? "s" : ""}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

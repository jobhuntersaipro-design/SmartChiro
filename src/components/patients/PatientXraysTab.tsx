"use client";

import { useState } from "react";
import { ScanLine, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { XrayUpload } from "@/components/xray/XrayUpload";

interface PatientXraysTabProps {
  patientId: string;
  xrays: {
    id: string;
    title: string | null;
    bodyRegion: string | null;
    viewType?: string | null;
    status?: string;
    thumbnailUrl?: string | null;
    annotationCount?: number;
    createdAt: string;
  }[];
  onRefresh: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatBodyRegion(region: string | null): string {
  if (!region) return "Unknown";
  return region
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PatientXraysTab({
  patientId,
  xrays,
  onRefresh,
}: PatientXraysTabProps) {
  const [showUpload, setShowUpload] = useState(false);

  const sortedXrays = [...xrays].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function handleUploadComplete() {
    setShowUpload(false);
    onRefresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-medium text-[#061b31]">
          X-Rays ({xrays.length})
        </h3>
        <Button
          onClick={() => setShowUpload(!showUpload)}
          className="h-8 rounded-[4px] bg-[#533afd] text-white text-[13px] font-medium hover:bg-[#4434d4] px-3"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Upload X-Ray
        </Button>
      </div>

      {/* Upload Area */}
      {showUpload && (
        <div className="mb-4 rounded-[6px] border border-[#e5edf5] bg-white p-4">
          <XrayUpload
            patientId={patientId}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      )}

      {/* Empty State */}
      {sortedXrays.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-[#f6f9fc] flex items-center justify-center mb-3">
            <ScanLine className="w-6 h-6 text-[#64748d]" />
          </div>
          <p className="text-[14px] text-[#64748d]">
            No X-rays uploaded yet
          </p>
          <p className="text-[13px] text-[#97a3b6] mt-1">
            Upload an X-ray to start annotating
          </p>
        </div>
      )}

      {/* X-Ray Grid */}
      {sortedXrays.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedXrays.map((xray) => (
            <a
              key={xray.id}
              href={`/dashboard/xrays/${patientId}/${xray.id}/annotate`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden cursor-pointer hover:border-[#c1c9d2] transition group"
            >
              {/* Thumbnail */}
              <div className="h-[160px] bg-[#1A1F36] flex items-center justify-center overflow-hidden">
                {xray.thumbnailUrl ? (
                  <img
                    src={xray.thumbnailUrl}
                    alt={xray.title || "X-ray"}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ScanLine className="w-10 h-10 text-[#4a5568] opacity-40" />
                )}
              </div>

              {/* Info */}
              <div className="px-3 py-2.5">
                <p className="text-[14px] font-medium text-[#061b31] truncate">
                  {xray.title || "Untitled"}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {xray.bodyRegion && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] bg-[#f6f9fc] text-[#64748d]">
                      {formatBodyRegion(xray.bodyRegion)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-[#97a3b6]">
                    <Calendar className="w-3 h-3" />
                    {formatDate(xray.createdAt)}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

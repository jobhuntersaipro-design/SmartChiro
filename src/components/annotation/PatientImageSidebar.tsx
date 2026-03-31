"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

interface PatientXray {
  id: string;
  title: string | null;
  bodyRegion: string | null;
  viewType: string | null;
  fileUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface PatientImageSidebarProps {
  patientId: string;
  currentXrayId: string;
  onSelectXray: (xray: PatientXray) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function PatientImageSidebar({
  patientId,
  currentXrayId,
  onSelectXray,
  isOpen,
  onToggle,
}: PatientImageSidebarProps) {
  const [xrays, setXrays] = useState<PatientXray[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchXrays() {
      try {
        const res = await fetch(`/api/xrays?patientId=${patientId}&limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        setXrays(data.xrays ?? []);
      } catch {
        // Silently fail — sidebar is non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchXrays();
  }, [patientId]);

  return (
    <div className="relative flex" style={{ height: "100%" }}>
      {/* Sidebar Panel */}
      {isOpen && (
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: 200,
            backgroundColor: "#FFFFFF",
            borderRight: "1px solid #E3E8EE",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid #E3E8EE" }}
          >
            <ImageIcon size={14} style={{ color: "#697386" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0A2540" }}>
              Patient X-Rays
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#697386",
                marginLeft: "auto",
              }}
            >
              {xrays.length}
            </span>
          </div>

          {/* Thumbnail List */}
          <div className="flex-1 overflow-y-auto p-2" style={{ gap: 6, display: "flex", flexDirection: "column" }}>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontSize: 12, color: "#697386" }}>Loading...</span>
              </div>
            )}

            {!loading && xrays.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontSize: 12, color: "#697386" }}>No X-rays found</span>
              </div>
            )}

            {xrays.map((xray) => {
              const isCurrent = xray.id === currentXrayId;
              const src = xray.thumbnailUrl ?? xray.fileUrl;
              const date = new Date(xray.createdAt);
              const dateStr = date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });

              return (
                <button
                  key={xray.id}
                  onClick={() => onSelectXray(xray)}
                  className="flex flex-col overflow-hidden text-left transition-colors"
                  style={{
                    borderRadius: 4,
                    border: isCurrent
                      ? "2px solid #635BFF"
                      : "1px solid #E3E8EE",
                    backgroundColor: isCurrent ? "#F0EEFF" : "#FFFFFF",
                    padding: 0,
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{
                      height: 100,
                      backgroundColor: "#1A1F36",
                    }}
                  >
                    <img
                      src={src}
                      alt={xray.title ?? "X-ray"}
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                    {isCurrent && (
                      <div
                        className="absolute right-1 top-1"
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: "#FFFFFF",
                          backgroundColor: "#635BFF",
                          borderRadius: 9999,
                          padding: "1px 6px",
                        }}
                      >
                        Current
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-2 py-1.5">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#0A2540",
                      }}
                    >
                      {xray.title ?? "Untitled"}
                    </div>
                    <div
                      className="flex items-center gap-1"
                      style={{ fontSize: 10, color: "#697386" }}
                    >
                      {xray.bodyRegion && (
                        <span className="capitalize">
                          {xray.bodyRegion.toLowerCase().replace(/_/g, " ")}
                        </span>
                      )}
                      {xray.bodyRegion && xray.viewType && <span>·</span>}
                      {xray.viewType && (
                        <span>{xray.viewType}</span>
                      )}
                      {(xray.bodyRegion || xray.viewType) && <span>·</span>}
                      <span>{dateStr}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle Button (right edge) */}
      <button
        onClick={onToggle}
        className="absolute top-3 flex items-center justify-center transition-colors"
        style={{
          right: -16,
          width: 16,
          height: 32,
          backgroundColor: "#FFFFFF",
          borderRadius: "0 4px 4px 0",
          borderTop: "1px solid #E3E8EE",
          borderRight: "1px solid #E3E8EE",
          borderBottom: "1px solid #E3E8EE",
          color: "#697386",
          zIndex: 10,
        }}
        title={isOpen ? "Hide patient images" : "Show patient images"}
      >
        {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>
    </div>
  );
}

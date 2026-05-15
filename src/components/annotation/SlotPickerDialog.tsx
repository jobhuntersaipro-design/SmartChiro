"use client";

/**
 * Slot picker for the multi-view annotation grid.
 *
 * Two ways for the user to populate an empty slot in side-by-side / 2x2
 * mode: pick an existing X-ray from this patient, or upload a new one.
 * Same-patient only by design — cross-patient comparison is out of scope
 * (per spec for the AI Landmark Detection branch).
 *
 * Returns the picked X-ray via `onPick`; the canvas then calls
 * `setGridSlots` with a populated `ViewportSlot`.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine, Upload, X } from "lucide-react";
import { XrayUpload } from "@/components/xray/XrayUpload";
import type { ViewportSlot } from "@/types/annotation";

interface PickerXray {
  id: string;
  title: string | null;
  bodyRegion: string | null;
  viewType: string | null;
  thumbnailUrl: string | null;
  fileUrl: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface SlotPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** X-ray IDs already loaded in any slot — hidden from the picker grid so
   *  the user can't pick the same X-ray into two slots. */
  excludeXrayIds: string[];
  /** Called when the user picks an X-ray or finishes uploading one. */
  onPick: (slot: ViewportSlot) => void;
}

function xrayToSlot(x: PickerXray): ViewportSlot {
  return {
    xrayId: x.id,
    imageUrl: x.fileUrl,
    imageWidth: x.width ?? 1024,
    imageHeight: x.height ?? 768,
    title: x.title ?? "Untitled X-ray",
  };
}

export function SlotPickerDialog({
  open,
  onOpenChange,
  patientId,
  excludeXrayIds,
  onPick,
}: SlotPickerDialogProps) {
  const [tab, setTab] = useState<"existing" | "upload">("existing");
  const [xrays, setXrays] = useState<PickerXray[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reload the X-ray list each time the dialog opens — fresh upload from
  // another tab/window should show up.
  useEffect(() => {
    if (!open) return;
    setTab("existing");
    setLoading(true);
    setError(null);
    fetch(`/api/xrays?patientId=${encodeURIComponent(patientId)}&limit=100`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load X-rays (${res.status})`);
        const data = (await res.json()) as { xrays: PickerXray[] };
        setXrays(data.xrays ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load X-rays."))
      .finally(() => setLoading(false));
  }, [open, patientId]);

  const excludeSet = useMemo(() => new Set(excludeXrayIds), [excludeXrayIds]);
  const visibleXrays = useMemo(
    () => (xrays ?? []).filter((x) => !excludeSet.has(x.id)),
    [xrays, excludeSet],
  );

  function pickExisting(x: PickerXray) {
    onPick(xrayToSlot(x));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-[16px] font-medium text-[#061b31]">
            Choose an X-ray
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-4 border-b border-[#e5edf5] -mx-4 px-4 mt-1">
          <button
            type="button"
            onClick={() => setTab("existing")}
            className="flex items-center gap-1.5 pb-2 text-[13px] font-medium transition-colors"
            style={{
              color: tab === "existing" ? "#533afd" : "#64748d",
              borderBottom: tab === "existing" ? "2px solid #533afd" : "2px solid transparent",
            }}
          >
            <ScanLine className="h-4 w-4" /> Patient X-rays
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className="flex items-center gap-1.5 pb-2 text-[13px] font-medium transition-colors"
            style={{
              color: tab === "upload" ? "#533afd" : "#64748d",
              borderBottom: tab === "upload" ? "2px solid #533afd" : "2px solid transparent",
            }}
          >
            <Upload className="h-4 w-4" /> Upload new
          </button>
        </div>

        {/* Tab body */}
        <div className="min-h-70 max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {tab === "existing" && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-12 text-[13px] text-[#64748d]">
                  Loading X-rays…
                </div>
              )}
              {error && (
                <div className="flex items-center justify-center py-12 text-[13px] text-[#DF1B41]">
                  {error}
                </div>
              )}
              {!loading && !error && visibleXrays.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-[13px] text-[#64748d]">
                    No other X-rays available for this patient.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setTab("upload")}
                    className="mt-2 text-[13px] text-[#533afd] hover:bg-transparent hover:underline px-0"
                  >
                    Upload one instead
                  </Button>
                </div>
              )}
              {!loading && !error && visibleXrays.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 pb-1">
                  {visibleXrays.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => pickExisting(x)}
                      className="text-left group rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden transition-colors hover:border-[#533afd]"
                    >
                      <div className="h-30 bg-[#1A1F36] flex items-center justify-center overflow-hidden">
                        {x.thumbnailUrl ? (
                          <Image
                            src={x.thumbnailUrl}
                            alt={x.title ?? "X-ray"}
                            width={240}
                            height={120}
                            sizes="(max-width: 640px) 50vw, 33vw"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <ScanLine className="w-8 h-8 text-[#4a5568] opacity-40" />
                        )}
                      </div>
                      <div className="px-2.5 py-1.5">
                        <p className="text-[12px] font-medium text-[#061b31] truncate">
                          {x.title || "Untitled"}
                        </p>
                        <p className="text-[10px] text-[#64748d]">
                          {new Date(x.createdAt).toLocaleDateString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "upload" && (
            <div className="pt-3">
              <XrayUpload
                patientId={patientId}
                onUploadComplete={async (uploadedId) => {
                  // XrayUpload only hands back the new X-ray's ID. Look up
                  // its row so we can populate the slot with the fileUrl
                  // and dimensions the canvas needs. If the lookup fails
                  // (race / network), fall back to switching to the
                  // "existing" tab and let the user pick manually.
                  try {
                    const res = await fetch(
                      `/api/xrays?patientId=${encodeURIComponent(patientId)}&limit=100`,
                    );
                    if (!res.ok) throw new Error(`lookup failed (${res.status})`);
                    const data = (await res.json()) as { xrays: PickerXray[] };
                    const fresh = data.xrays.find((x) => x.id === uploadedId);
                    if (fresh) {
                      onPick(xrayToSlot(fresh));
                      onOpenChange(false);
                      return;
                    }
                    // Not visible yet — refresh the list and switch tabs.
                    setXrays(data.xrays);
                    setTab("existing");
                  } catch (err) {
                    console.error("post-upload lookup failed:", err);
                    setError("Upload succeeded but could not load the new X-ray. Refresh and try again.");
                  }
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

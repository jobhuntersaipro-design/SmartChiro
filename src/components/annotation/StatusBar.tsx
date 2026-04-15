"use client";

import type { Point } from "@/types/annotation";

type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "failed";

interface StatusBarProps {
  cursorPosition: Point | null;
  selectedCount: number;
  isDirty: boolean;
  activeTool: string;
  shapeCount: number;
  saveStatus?: SaveStatus;
  saveError?: string | null;
  sizeWarning?: string | null;
  onRetrySave?: () => void;
  isCalibrated?: boolean;
  pixelsPerMm?: number | null;
  calibrationNote?: string | null;
}

export function StatusBar({
  cursorPosition,
  selectedCount,
  isDirty,
  activeTool,
  shapeCount,
  saveStatus = "idle",
  saveError,
  sizeWarning,
  onRetrySave,
  isCalibrated = false,
  pixelsPerMm = null,
  calibrationNote = null,
}: StatusBarProps) {
  const renderSaveStatus = () => {
    switch (saveStatus) {
      case "saving":
        return <span style={{ color: "#0570DE" }}>Saving...</span>;
      case "saved":
        return <span style={{ color: "#30B130" }}>Saved</span>;
      case "retrying":
        return <span style={{ color: "#F5A623" }}>{saveError ?? "Save failed — retrying..."}</span>;
      case "failed":
        return (
          <span className="flex items-center gap-1.5">
            <span style={{ color: "#DF1B41" }}>{saveError ?? "Save failed"}</span>
            {onRetrySave && (
              <button
                onClick={onRetrySave}
                className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-[#F0F3F7]"
                style={{ color: "#635BFF" }}
              >
                Retry
              </button>
            )}
          </span>
        );
      default:
        if (isDirty) {
          return <span style={{ color: "#F5A623" }}>Unsaved changes</span>;
        }
        return null;
    }
  };

  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 28,
        backgroundColor: "#FFFFFF",
        borderTop: "1px solid #E3E8EE",
        fontSize: 12,
        color: "#697386",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="tabular-nums">
          {cursorPosition
            ? `X: ${Math.round(cursorPosition.x)}  Y: ${Math.round(cursorPosition.y)}`
            : "—"}
        </span>
        {selectedCount > 0 && (
          <span>
            {selectedCount} shape{selectedCount !== 1 ? "s" : ""} selected
          </span>
        )}
        <span
          className="flex items-center gap-1"
          title={calibrationNote ?? undefined}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: isCalibrated ? "#30B130" : "#A3ACB9",
              display: "inline-block",
            }}
          />
          {isCalibrated && pixelsPerMm
            ? `Calibrated: ${pixelsPerMm.toFixed(2)} px/mm`
            : "Uncalibrated"}
        </span>
        {sizeWarning && (
          <span style={{ color: "#F5A623" }}>{sizeWarning}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span>{shapeCount} annotation{shapeCount !== 1 ? "s" : ""}</span>
        <span className="capitalize">{activeTool.replace("_", " ")} tool</span>
        {renderSaveStatus()}
      </div>
    </div>
  );
}

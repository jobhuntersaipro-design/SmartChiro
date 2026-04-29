"use client";

import { Undo2, Redo2 } from "lucide-react";
import type { Point, ViewMode } from "@/types/annotation";

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
  viewMode?: ViewMode;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
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
  viewMode = "single",
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
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
                className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-[#f6f9fc]"
                style={{ color: "#533afd" }}
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
        borderTop: "1px solid #e5edf5",
        fontSize: 12,
        color: "#64748d",
      }}
    >
      <div className="flex items-center gap-4">
        {viewMode !== "single" ? (
          <span style={{ color: "#0570DE", fontWeight: 500 }}>
            Comparison Mode — {viewMode === "side-by-side" ? "Side by Side" : "2\u00d72 Grid"}
          </span>
        ) : (
          <span className="tabular-nums">
            {cursorPosition
              ? `X: ${Math.round(cursorPosition.x)}  Y: ${Math.round(cursorPosition.y)}`
              : "—"}
          </span>
        )}
        {selectedCount > 0 && (
          <span>
            {selectedCount} shape{selectedCount !== 1 ? "s" : ""} selected
          </span>
        )}
        {sizeWarning && (
          <span style={{ color: "#F5A623" }}>{sizeWarning}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span>{shapeCount} annotation{shapeCount !== 1 ? "s" : ""}</span>
        <span className="capitalize">{activeTool.replace("_", " ")} tool</span>
        {renderSaveStatus()}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            className="flex items-center justify-center rounded-[4px] hover:bg-[#f6f9fc] disabled:cursor-not-allowed"
            style={{ width: 24, height: 24, color: canUndo ? "#425466" : "#A3ACB9" }}
          >
            <Undo2 size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            className="flex items-center justify-center rounded-[4px] hover:bg-[#f6f9fc] disabled:cursor-not-allowed"
            style={{ width: 24, height: 24, color: canRedo ? "#425466" : "#A3ACB9" }}
          >
            <Redo2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

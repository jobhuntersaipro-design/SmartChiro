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
        {/* Undo/Redo buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex items-center justify-center rounded-[4px] transition-colors hover:bg-[#F0F3F7] disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ width: 22, height: 22 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
            </svg>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="flex items-center justify-center rounded-[4px] transition-colors hover:bg-[#F0F3F7] disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ width: 22, height: 22 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13" />
            </svg>
          </button>
        </div>
        <div style={{ width: 1, height: 16, backgroundColor: "#E3E8EE" }} />
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

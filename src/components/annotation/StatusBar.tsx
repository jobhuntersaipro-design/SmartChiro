"use client";

import { Undo2, Redo2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { ViewMode } from "@/types/annotation";
import type { CursorStore } from "@/lib/cursor-store";
import type { SaveStatus } from "@/lib/annotation-saver";
import type { AiUsageToday } from "@/types/pelvis";

interface StatusBarProps {
  cursorStore: CursorStore;
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
  /** AI analyses used today and the daily limit. */
  aiUsage?: AiUsageToday | null;
}

/** "AI analyses today: 3 of 10" (or that the limit is reached). */
export function aiUsageLabel({ used, limit }: AiUsageToday): string {
  return used >= limit
    ? `AI analyses today: ${used} of ${limit}. Daily limit reached; re-running an X-ray already analysed today still works. Resets at midnight.`
    : `AI analyses today: ${used} of ${limit} X-rays.`;
}

function CursorReadout({ store }: { store: CursorStore }) {
  const position = useSyncExternalStore(store.subscribe, store.get, () => null);
  return (
    <span className="tabular-nums">
      {position ? `X: ${Math.round(position.x)}  Y: ${Math.round(position.y)}` : "—"}
    </span>
  );
}

export function StatusBar({
  cursorStore,
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
  aiUsage = null,
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
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-surface-muted"
                style={{ color: "#7747ff" }}
              >
                Retry
              </button>
            )}
          </span>
        );
      case "conflict":
        return (
          <span className="flex items-center gap-1.5">
            <span style={{ color: "#DF1B41" }}>{saveError ?? "Changed elsewhere"}</span>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-surface-muted"
              style={{ color: "#7747ff" }}
            >
              Reload
            </button>
            {onRetrySave && (
              <button
                onClick={onRetrySave}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-surface-muted"
                style={{ color: "#DF1B41" }}
              >
                Overwrite
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
        borderTop: "1px solid #e9e9e9",
        fontSize: 12,
        color: "#585858",
      }}
    >
      <div className="flex items-center gap-4">
        {viewMode !== "single" ? (
          <span style={{ color: "#0570DE", fontWeight: 500 }}>
            Comparison Mode — {viewMode === "side-by-side" ? "Side by Side" : "2\u00d72 Grid"}
          </span>
        ) : (
          <CursorReadout store={cursorStore} />
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
        {aiUsage && (
          <span
            title={aiUsageLabel(aiUsage)}
            className="tabular-nums"
            style={aiUsage.used >= aiUsage.limit ? { color: "#DF1B41" } : undefined}
          >
            AI analyses today: {aiUsage.used} / {aiUsage.limit}
          </span>
        )}
        <span>{shapeCount} annotation{shapeCount !== 1 ? "s" : ""}</span>
        <span className="capitalize">{activeTool.replace("_", " ")} tool</span>
        {renderSaveStatus()}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            className="flex items-center justify-center rounded-md hover:bg-surface-muted disabled:cursor-not-allowed"
            style={{ width: 24, height: 24, color: canUndo ? "#585858" : "#a4a4a4" }}
          >
            <Undo2 size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            className="flex items-center justify-center rounded-md hover:bg-surface-muted disabled:cursor-not-allowed"
            style={{ width: 24, height: 24, color: canRedo ? "#585858" : "#a4a4a4" }}
          >
            <Redo2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

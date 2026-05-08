"use client";

import { AlertTriangle, X } from "lucide-react";
import type { BaseShape } from "@/types/annotation";

interface DependentDescriptor {
  shape: BaseShape;
  /** P# / measurement label of the dependent, for display. */
  displayName: string;
}

interface CascadeDeleteDialogProps {
  /** Names of the shapes the user is about to delete (e.g. "P3", "P5"). */
  targetNames: string[];
  /** Shapes that reference at least one of the targets. */
  dependents: DependentDescriptor[];
  /** Delete only the targets — leave dependents at their last-known
   *  coordinates (resolveShapeRefs falls back to stored points when the
   *  source is missing). */
  onKeepDependents: () => void;
  /** Delete the targets AND every dependent in one batch. */
  onDeleteAll: () => void;
  onCancel: () => void;
}

/**
 * Modal that appears before deleting a landmark/vertex when other shapes
 * have snap-followed it. Two destructive paths:
 *
 *   • "Keep dependents" — removes only the target. Dependents stay drawn
 *     at the last-known position (resolveShapeRefs's graceful-degradation).
 *   • "Delete all"      — removes the target + every dependent in a single
 *     undoable batch.
 */
export function CascadeDeleteDialog({
  targetNames,
  dependents,
  onKeepDependents,
  onDeleteAll,
  onCancel,
}: CascadeDeleteDialogProps) {
  const targetCount = targetNames.length;
  const targetLabel = targetCount === 1 ? targetNames[0] : `${targetCount} items`;
  const dependentCount = dependents.length;

  // Stop pointer events from bubbling to the canvas behind the dialog —
  // same defense as CalibrationDialog (otherwise pointerdown commits any
  // pending shape and dismisses the modal mid-click).
  const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 18, 32, 0.55)" }}
      onClick={onCancel}
      onPointerDown={stopAll}
      onPointerUp={stopAll}
      onPointerMove={stopAll}
      onMouseDown={stopAll}
      onMouseUp={stopAll}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={stopAll}
        onPointerUp={stopAll}
        onPointerMove={stopAll}
        onMouseDown={stopAll}
        onMouseUp={stopAll}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(18, 42, 66, 0.15)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={1.75} style={{ color: "#F5A623" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#0A2540" }}>
              Delete linked landmark
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center transition-colors"
            style={{ width: 24, height: 24, borderRadius: 4, color: "#697386" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            aria-label="Cancel"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <p className="text-xs" style={{ color: "#425466" }}>
          {dependentCount === 1
            ? `1 measurement is anchored on ${targetLabel}:`
            : `${dependentCount} measurements are anchored on ${targetLabel}:`}
        </p>

        <ul
          className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded px-2 py-1.5"
          style={{ backgroundColor: "#F6F9FC", border: "1px solid #E3E8EE" }}
        >
          {dependents.map((d) => (
            <li
              key={d.shape.id}
              className="text-xs"
              style={{ color: "#425466" }}
            >
              • {d.displayName}
            </li>
          ))}
        </ul>

        <p className="text-xs" style={{ color: "#697386" }}>
          Choose how to handle them:
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderRadius: 4, border: "1px solid #e5edf5", color: "#273951", backgroundColor: "#FFFFFF" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
          >
            Cancel
          </button>
          <button
            onClick={onKeepDependents}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderRadius: 4, border: "1px solid #e5edf5", color: "#0A2540", backgroundColor: "#FFFFFF" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
            title="Dependents stay drawn at their last-known position."
          >
            Keep measurements
          </button>
          <button
            onClick={onDeleteAll}
            className="px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ borderRadius: 4, backgroundColor: "#DF1B41" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#C8163A"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#DF1B41"; }}
          >
            Delete {targetCount === 1 ? "and " : "+ "}{dependentCount} dependent{dependentCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Check, Undo2 } from "lucide-react";

interface RecentCommitUndoProps {
  screenX: number;
  screenY: number;
  /** Remove the shape (or pop the latest vertex). */
  onUndo: () => void;
  /** Confirm — dismisses the pill, keeping the shape on canvas. Optional;
   *  when omitted only the Undo icon renders (used during early mid-draw
   *  states like a single placed vertex where Accept doesn't apply yet). */
  onAccept?: () => void;
}

/**
 * Pill anchored to the latest vertex of an in-progress or just-committed
 * shape. Two icon buttons:
 *
 *   ✓ Accept — dismisses the pill, leaving the shape on canvas.
 *   ↶ Undo   — removes the shape (or pops the latest vertex during draw).
 *
 * Auto-fades after ~3s (timer in `useDrawingTools.recentCommit`); also
 * dismissed by any subsequent canvas pointerdown / non-modifier keypress.
 */
export function RecentCommitUndo({ screenX, screenY, onUndo, onAccept }: RecentCommitUndoProps) {
  // Stop pointer events from reaching the canvas underneath, which would
  // otherwise start a new vertex / drag / draw and swallow the click.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      className="pointer-events-auto absolute z-50 flex items-center gap-0.5"
      style={{
        left: screenX,
        top: screenY + 14,
        transform: "translateX(-50%)",
        backgroundColor: "#FFFFFF",
        border: "1px solid #e5edf5",
        borderRadius: 4,
        padding: 2,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(18, 42, 66, 0.04)",
        animation: "undoFadeIn 150ms ease-out",
      }}
    >
      {onAccept && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAccept(); }}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 24,
            height: 24,
            borderRadius: 3,
            color: "#30B130",
            cursor: "pointer",
            border: "none",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#E8F5E8"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          title="Accept (Enter)"
          aria-label="Accept shape"
        >
          <Check size={14} strokeWidth={2.25} />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onUndo(); }}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 24,
          height: 24,
          borderRadius: 3,
          color: "#DF1B41",
          cursor: "pointer",
          border: "none",
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#FDE8EC"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        title="Undo (Cmd+Z)"
        aria-label="Undo last action"
      >
        <Undo2 size={14} strokeWidth={2.25} />
      </button>
      <style>{`
        @keyframes undoFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

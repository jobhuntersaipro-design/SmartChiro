"use client";

import { Check, X } from "lucide-react";
import type { ViewTransform } from "@/types/annotation";

interface PolylineDoneButtonProps {
  imageX: number;
  imageY: number;
  transform: ViewTransform;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Floating "Done" / "Cancel" controls anchored to the last locked vertex of an
 * in-progress polyline. Done commits the shape (tool stays active so the next
 * click starts a new polyline). Cancel discards the in-progress draw entirely.
 */
export function PolylineDoneButton({
  imageX,
  imageY,
  transform,
  onDone,
  onCancel,
}: PolylineDoneButtonProps) {
  const screenX = imageX * transform.zoom + transform.panX;
  const screenY = imageY * transform.zoom + transform.panY;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="pointer-events-auto absolute z-50 flex items-center gap-1"
      style={{
        left: screenX,
        top: screenY + 18,
        transform: "translateX(-50%)",
        backgroundColor: "#FFFFFF",
        border: "1px solid #e5edf5",
        borderRadius: 6,
        padding: 4,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(18, 42, 66, 0.08)",
      }}
      onPointerDown={stop}
      onPointerUp={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
    >
      <button
        type="button"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => { e.stopPropagation(); onDone(); }}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors"
        style={{ borderRadius: 4, color: "#FFFFFF", backgroundColor: "#30B130" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#28A028")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#30B130")}
        title="Finish polyline (Enter)"
      >
        <Check size={12} strokeWidth={2.5} />
        Done
      </button>
      <button
        type="button"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        className="flex items-center justify-center transition-colors"
        style={{ width: 24, height: 24, borderRadius: 4, color: "#697386" }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FDE8EC"; e.currentTarget.style.color = "#DF1B41"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#697386"; }}
        title="Cancel polyline (Esc)"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

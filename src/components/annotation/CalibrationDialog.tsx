"use client";

import { useEffect, useRef, useState } from "react";
import { Ruler, X } from "lucide-react";

interface CalibrationDialogProps {
  /** Pixel length of the user-drawn calibration line. */
  pixelLength: number;
  /** Pre-fill the mm input — used when editing an existing calibration. */
  defaultMm?: number;
  onConfirm: (pixelsPerMm: number) => void;
  onCancel: () => void;
}

/**
 * After the user clicks two points on a known reference, this dialog asks for
 * the real-world length in millimeters. We compute pixelsPerMm = pixelLength / mm
 * and pass it back via onConfirm. The parent stores the value in
 * imageAdjustments.pixelsPerMm so all measurements display in mm/cm afterwards.
 */
export function CalibrationDialog({ pixelLength, defaultMm, onConfirm, onCancel }: CalibrationDialogProps) {
  const [mmText, setMmText] = useState(defaultMm != null ? String(defaultMm) : "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const mm = parseFloat(mmText);
    if (!Number.isFinite(mm) || mm <= 0) {
      setError("Enter a positive number of millimeters.");
      return;
    }
    const pixelsPerMm = pixelLength / mm;
    onConfirm(pixelsPerMm);
  };

  // Stop ALL pointer events from bubbling — the dialog renders inside the
  // canvas's React subtree, so without these the canvas's onPointerDown sees
  // the click and auto-commits the pending calibration shape (closing the
  // dialog mid-typing).
  const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 18, 32, 0.55)" }}
      onClick={onCancel}
      onPointerDown={(e) => {
        // Click on the backdrop cancels, but stop the event so canvas
        // handlers don't also fire. The onClick above still calls onCancel.
        e.stopPropagation();
      }}
      onPointerUp={stopAll}
      onPointerMove={stopAll}
      onMouseDown={stopAll}
      onMouseUp={stopAll}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 p-5"
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
            <Ruler size={16} strokeWidth={1.75} style={{ color: "#533afd" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#0A2540" }}>
              Calibrate measurements
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center transition-colors"
            style={{ width: 24, height: 24, borderRadius: 4, color: "#697386" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            aria-label="Cancel calibration"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <p className="text-xs" style={{ color: "#425466" }}>
          You drew a {Math.round(pixelLength)} px line over a known reference.
          Enter the real-world length in millimeters and we&apos;ll convert all
          subsequent measurements automatically.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "#0A2540" }}>
            Real-world length (mm)
          </span>
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            placeholder="e.g. 25.4"
            value={mmText}
            onChange={(e) => { setMmText(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            className="px-2.5 py-1.5 text-sm transition-colors"
            style={{
              borderRadius: 4,
              border: error ? "1px solid #DF1B41" : "1px solid #e5edf5",
              outline: "none",
              backgroundColor: "#F6F9FC",
            }}
          />
          {error && <span className="text-[11px]" style={{ color: "#DF1B41" }}>{error}</span>}
        </label>

        <div className="flex items-center justify-end gap-2">
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
            onClick={submit}
            className="px-3 py-1.5 text-xs font-medium text-white transition-colors"
            style={{ borderRadius: 4, backgroundColor: "#533afd" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#4434d4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#533afd"; }}
          >
            Apply calibration
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface CalibrationDialogProps {
  pixelDistance: number;
  onCalibrate: (pixelsPerMm: number, calibrationNote: string) => void;
  onCancel: () => void;
}

export function CalibrationDialog({
  pixelDistance,
  onCalibrate,
  onCancel,
}: CalibrationDialogProps) {
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<"mm" | "cm">("mm");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCalibrate = () => {
    const value = parseFloat(distance);
    if (!value || value <= 0) {
      setError("Enter a positive distance.");
      return;
    }

    const realMm = unit === "cm" ? value * 10 : value;
    const pixelsPerMm = pixelDistance / realMm;

    if (pixelsPerMm > 1000) {
      setError("Value too small — check your measurement.");
      return;
    }
    if (pixelsPerMm < 0.01) {
      setError("Value too large — check your measurement.");
      return;
    }

    onCalibrate(pixelsPerMm, note);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(26, 31, 54, 0.70)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[380px] p-5"
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(18, 42, 66, 0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#061b31", marginBottom: 4 }}>
          Calibrate Measurements
        </h3>
        <p style={{ fontSize: 13, color: "#64748d", marginBottom: 16 }}>
          Enter the real-world distance of the line you just drew.
        </p>

        {/* Pixel distance (read-only) */}
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1" style={{ color: "#061b31" }}>
            Pixel distance
          </label>
          <p className="text-sm tabular-nums" style={{ color: "#273951" }}>
            {Math.round(pixelDistance)} px
          </p>
        </div>

        {/* Real-world distance input */}
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1" style={{ color: "#061b31" }}>
            Real-world distance
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={distance}
              onChange={(e) => { setDistance(e.target.value); setError(null); }}
              placeholder="e.g. 25"
              min={0}
              step="any"
              autoFocus
              className="flex-1 text-sm px-2.5 py-1.5 tabular-nums"
              style={{
                border: "1px solid #e5edf5",
                borderRadius: 4,
                backgroundColor: "#f6f9fc",
                color: "#061b31",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCalibrate();
                if (e.key === "Escape") onCancel();
              }}
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "mm" | "cm")}
              className="text-sm px-2 py-1.5"
              style={{
                border: "1px solid #e5edf5",
                borderRadius: 4,
                backgroundColor: "#f6f9fc",
                color: "#061b31",
                width: 64,
              }}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          </div>
        </div>

        {/* Reference label */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1" style={{ color: "#061b31" }}>
            Reference object (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 25mm coin, ruler marking"
            maxLength={100}
            className="w-full text-sm px-2.5 py-1.5"
            style={{
              border: "1px solid #e5edf5",
              borderRadius: 4,
              backgroundColor: "#f6f9fc",
              color: "#061b31",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCalibrate();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs mb-3" style={{ color: "#DF1B41" }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              borderRadius: 4,
              border: "1px solid #e5edf5",
              color: "#273951",
              backgroundColor: "#FFFFFF",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCalibrate}
            className="px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              borderRadius: 4,
              backgroundColor: "#533afd",
              color: "#FFFFFF",
              border: "none",
            }}
          >
            Calibrate
          </button>
        </div>
      </div>
    </div>
  );
}

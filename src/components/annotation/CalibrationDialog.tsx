"use client";

import { useState, useRef, useEffect } from "react";

interface CalibrationDialogProps {
  pixelDistance: number;
  onApply: (knownDistanceMm: number) => void;
  onCancel: () => void;
}

export function CalibrationDialog({
  pixelDistance,
  onApply,
  onCancel,
}: CalibrationDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mm = parseFloat(value);
    if (!isNaN(mm) && mm > 0) {
      onApply(mm);
    }
  };

  const spacing = value ? (parseFloat(value) / pixelDistance) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="p-6"
        style={{
          width: 360,
          backgroundColor: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(18, 42, 66, 0.12)",
        }}
      >
        <h3 className="text-base font-semibold mb-1" style={{ color: "#0A2540" }}>
          Set Calibration Reference
        </h3>
        <p className="text-xs mb-4" style={{ color: "#697386" }}>
          Enter the real-world distance of the reference line you just drew.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="text-xs font-medium block mb-1" style={{ color: "#0A2540" }}>
              Known distance (mm)
            </label>
            <input
              ref={inputRef}
              type="number"
              step="0.1"
              min="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 25.4"
              className="w-full text-sm px-3 py-2"
              style={{
                border: "1px solid #E3E8EE",
                borderRadius: 4,
                backgroundColor: "#F6F9FC",
                color: "#0A2540",
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#635BFF")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E3E8EE")}
            />
          </div>

          <div className="mb-4 p-2 rounded" style={{ backgroundColor: "#F6F9FC" }}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: "#697386" }}>Pixel distance</span>
              <span className="tabular-nums" style={{ color: "#425466" }}>{Math.round(pixelDistance)} px</span>
            </div>
            {spacing && spacing > 0 && (
              <div className="flex justify-between text-xs">
                <span style={{ color: "#697386" }}>Computed spacing</span>
                <span className="tabular-nums font-medium" style={{ color: "#00D4AA" }}>
                  {spacing.toFixed(4)} mm/px
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 text-xs font-medium"
              style={{
                border: "1px solid #E3E8EE",
                borderRadius: 4,
                backgroundColor: "#FFFFFF",
                color: "#425466",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value || parseFloat(value) <= 0}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={{
                borderRadius: 4,
                backgroundColor: parseFloat(value) > 0 ? "#635BFF" : "#A3ACB9",
                color: "#FFFFFF",
                border: "none",
                cursor: parseFloat(value) > 0 ? "pointer" : "not-allowed",
              }}
            >
              Apply Calibration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

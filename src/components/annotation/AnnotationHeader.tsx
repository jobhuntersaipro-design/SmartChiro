"use client";

import { ChevronRight, Save, X } from "lucide-react";
import type { ImageAdjustments } from "@/types/annotation";

interface AnnotationHeaderProps {
  xrayTitle: string;
  patientName: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
  // Image adjustments
  adjustments: ImageAdjustments;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onInvertChange: (v: boolean) => void;
  onWindowCenterChange: (v: number) => void;
  onWindowWidthChange: (v: number) => void;
  onResetAdjustments: () => void;
  isAdjustmentsModified: boolean;
}

function AdjustmentSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs whitespace-nowrap"
        style={{ color: "#425466", minWidth: 60 }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-[#635BFF]"
      />
      <span
        className="text-xs tabular-nums"
        style={{ color: "#697386", minWidth: 28, textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

export function AnnotationHeader({
  xrayTitle,
  patientName,
  isDirty,
  isSaving,
  onSave,
  onClose,
  adjustments,
  onBrightnessChange,
  onContrastChange,
  onInvertChange,
  onWindowCenterChange,
  onWindowWidthChange,
  onResetAdjustments,
  isAdjustmentsModified,
}: AnnotationHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 48,
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #E3E8EE",
      }}
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm" style={{ color: "#697386" }}>
          {patientName}
        </span>
        <ChevronRight size={14} style={{ color: "#A3ACB9" }} />
        <span className="text-sm font-medium" style={{ color: "#0A2540" }}>
          {xrayTitle}
        </span>
      </div>

      {/* Center: Image adjustments */}
      <div className="flex items-center gap-4">
        <AdjustmentSlider
          label="Brightness"
          value={adjustments.brightness}
          min={-100}
          max={100}
          onChange={onBrightnessChange}
        />
        <AdjustmentSlider
          label="Contrast"
          value={adjustments.contrast}
          min={-100}
          max={100}
          onChange={onContrastChange}
        />
        <button
          onClick={() => onInvertChange(!adjustments.invert)}
          className="flex items-center gap-1 px-2 py-1 text-xs transition-colors"
          style={{
            borderRadius: 4,
            border: "1px solid #E3E8EE",
            backgroundColor: adjustments.invert ? "#F0EEFF" : "#FFFFFF",
            color: adjustments.invert ? "#635BFF" : "#425466",
          }}
        >
          Invert
        </button>
        <AdjustmentSlider
          label="W/C"
          value={adjustments.windowCenter}
          min={0}
          max={255}
          onChange={onWindowCenterChange}
        />
        <AdjustmentSlider
          label="W/W"
          value={adjustments.windowWidth}
          min={1}
          max={512}
          onChange={onWindowWidthChange}
        />
        {isAdjustmentsModified && (
          <button
            onClick={onResetAdjustments}
            className="px-2 py-1 text-xs transition-colors"
            style={{
              borderRadius: 4,
              color: "#DF1B41",
              border: "1px solid #E3E8EE",
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white transition-colors"
          style={{
            borderRadius: 4,
            backgroundColor: "#635BFF",
            opacity: isSaving ? 0.6 : 1,
            position: "relative",
          }}
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save"}
          {isDirty && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: "#F5A623" }}
            />
          )}
        </button>
        <button
          onClick={onClose}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            color: "#697386",
          }}
          aria-label="Close annotation editor"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

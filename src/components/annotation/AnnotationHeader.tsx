"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronRight, Save, X, Pencil, Check, FlipHorizontal2 } from "lucide-react";
import Link from "next/link";
import type { ImageAdjustments } from "@/types/annotation";

interface AnnotationHeaderProps {
  xrayTitle: string;
  patientName: string;
  patientId: string;
  xrayId: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
  // Image adjustments
  adjustments: ImageAdjustments;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onWindowCenterChange: (v: number) => void;
  onResetAdjustments: () => void;
  isAdjustmentsModified: boolean;
  // Flip
  flipped: boolean;
  onFlipChange: (v: boolean) => void;
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
        style={{ color: "#273951", minWidth: 60 }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-[#533afd]"
      />
      <span
        className="text-xs tabular-nums"
        style={{ color: "#64748d", minWidth: 28, textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

function InlineEditableTitle({
  title,
  xrayId,
}: {
  title: string;
  xrayId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [editValue, setEditValue] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const isUntitled = currentTitle === "Untitled X-ray";

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      const trimmed = newTitle.trim();
      const finalTitle = trimmed || "Untitled X-ray";
      setCurrentTitle(finalTitle);
      setIsEditing(false);

      if (finalTitle === currentTitle) return;

      try {
        const res = await fetch(`/api/xrays/${xrayId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: finalTitle }),
        });
        if (res.ok) {
          setSaveState("saved");
          setTimeout(() => setSaveState("idle"), 1500);
        } else {
          setCurrentTitle(currentTitle);
        }
      } catch {
        setCurrentTitle(currentTitle);
      }
    },
    [xrayId, currentTitle]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle(editValue);
    } else if (e.key === "Escape") {
      setEditValue(currentTitle);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => saveTitle(editValue)}
        onKeyDown={handleKeyDown}
        className="text-sm font-medium outline-none"
        style={{
          color: "#061b31",
          backgroundColor: "#f6f9fc",
          border: "1px solid #533afd",
          borderRadius: 4,
          padding: "2px 8px",
          width: Math.max(120, editValue.length * 8 + 32),
          transition: "width 200ms ease",
        }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setEditValue(currentTitle);
        setIsEditing(true);
      }}
      className="group flex items-center gap-1.5 text-sm font-medium"
      style={{ color: "#061b31", position: "relative" }}
    >
      <span
        className={isUntitled ? "animate-title-hint" : ""}
        style={{
          borderBottom: "1px dashed transparent",
          transition: "border-color 150ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#A3ACB9";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
        }}
      >
        {currentTitle}
      </span>
      {saveState === "saved" ? (
        <Check size={12} style={{ color: "#30B130" }} />
      ) : (
        <Pencil
          size={12}
          className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ color: "#A3ACB9" }}
        />
      )}
    </button>
  );
}

export function AnnotationHeader({
  xrayTitle,
  patientName,
  patientId,
  xrayId,
  isDirty,
  isSaving,
  onSave,
  onClose,
  adjustments,
  onBrightnessChange,
  onContrastChange,
  onWindowCenterChange,
  onResetAdjustments,
  isAdjustmentsModified,
  flipped,
  onFlipChange,
}: AnnotationHeaderProps) {
  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 48,
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #e5edf5",
      }}
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5">
        <Link
          href={`/dashboard/${patientId}`}
          className="text-sm transition-colors hover:underline"
          style={{ color: "#64748d" }}
        >
          {patientName}
        </Link>
        <ChevronRight size={14} style={{ color: "#A3ACB9" }} />
        <InlineEditableTitle title={xrayTitle} xrayId={xrayId} />
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
        <AdjustmentSlider
          label="W/C"
          value={adjustments.windowCenter}
          min={0}
          max={255}
          onChange={onWindowCenterChange}
        />
        <button
          onClick={() => onFlipChange(!flipped)}
          className="flex items-center gap-1 px-2 py-1 text-xs transition-colors"
          style={{
            borderRadius: 4,
            border: "1px solid #e5edf5",
            backgroundColor: flipped ? "#ededfc" : "#FFFFFF",
            color: flipped ? "#533afd" : "#273951",
          }}
        >
          <FlipHorizontal2 size={14} strokeWidth={1.5} />
          Flip
        </button>
        {isAdjustmentsModified && (
          <button
            onClick={onResetAdjustments}
            className="px-2 py-1 text-xs transition-colors"
            style={{
              borderRadius: 4,
              color: "#DF1B41",
              border: "1px solid #e5edf5",
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
            backgroundColor: "#533afd",
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
            color: "#64748d",
          }}
          aria-label="Close annotation editor"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

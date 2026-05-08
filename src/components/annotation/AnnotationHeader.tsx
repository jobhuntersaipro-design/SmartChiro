"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Save,
  X,
  Pencil,
  Check,
  CheckCircle2,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Contrast,
  Sun,
  RotateCcw,
  FileText,
} from "lucide-react";
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
  onResetAdjustments: () => void;
  isAdjustmentsModified: boolean;
  // Orientation
  flipped: boolean;
  onFlipChange: (v: boolean) => void;
  flippedV: boolean;
  onFlipVChange: (v: boolean) => void;
  rotation: 0 | 90 | 180 | 270;
  onRotate90: () => void;
  // Invert
  inverted: boolean;
  onInvertChange: (v: boolean) => void;
  // Notes
  notesCount?: number;
  onOpenNotes?: () => void;
  // Shortcuts
  onShowShortcuts?: () => void;
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
        style={{ color: "#273951", minWidth: 64 }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-[#533afd]"
      />
      <span
        className="text-xs tabular-nums"
        style={{ color: "#64748d", minWidth: 32, textAlign: "right" }}
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

function AdjustPopover({
  adjustments,
  onBrightnessChange,
  onContrastChange,
  onResetAdjustments,
  isAdjustmentsModified,
  flipped,
  onFlipChange,
  flippedV,
  onFlipVChange,
  rotation,
  onRotate90,
  inverted,
  onInvertChange,
  onClose,
  onShowShortcuts,
}: {
  adjustments: ImageAdjustments;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onResetAdjustments: () => void;
  isAdjustmentsModified: boolean;
  flipped: boolean;
  onFlipChange: (v: boolean) => void;
  flippedV: boolean;
  onFlipVChange: (v: boolean) => void;
  rotation: 0 | 90 | 180 | 270;
  onRotate90: () => void;
  inverted: boolean;
  onInvertChange: (v: boolean) => void;
  onClose: () => void;
  onShowShortcuts?: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full z-50 mt-1 flex w-70 flex-col gap-3 p-4"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #e5edf5",
        borderRadius: 6,
        boxShadow:
          "0 0 0 1px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748d" }}>
          Image Adjustments
        </span>
        {isAdjustmentsModified && (
          <button
            onClick={onResetAdjustments}
            className="flex items-center gap-1 text-[11px] transition-colors hover:underline"
            style={{ color: "#DF1B41" }}
          >
            <RotateCcw size={11} strokeWidth={1.5} />
            Reset
          </button>
        )}
      </div>
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
      <div style={{ height: 1, backgroundColor: "#e5edf5", margin: "2px 0" }} />
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748d" }}>
        Orientation
      </span>
      <button
        onClick={onRotate90}
        onMouseEnter={(e) => { if (rotation === 0) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
        onMouseLeave={(e) => { if (rotation === 0) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
        className="flex items-center justify-between px-3 py-1.5 text-xs transition-colors"
        style={{
          borderRadius: 4,
          border: "1px solid #e5edf5",
          backgroundColor: rotation !== 0 ? "#ededfc" : "#FFFFFF",
          color: rotation !== 0 ? "#533afd" : "#273951",
        }}
      >
        <span className="flex items-center gap-1.5">
          <RotateCw size={13} strokeWidth={1.5} />
          Rotate 90°
        </span>
        <span className="tabular-nums" style={{ color: rotation !== 0 ? "#533afd" : "#A3ACB9" }}>
          {rotation}°
        </span>
      </button>
      <button
        onClick={() => onFlipChange(!flipped)}
        onMouseEnter={(e) => { if (!flipped) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
        onMouseLeave={(e) => { if (!flipped) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
        className="flex items-center justify-between px-3 py-1.5 text-xs transition-colors"
        style={{
          borderRadius: 4,
          border: "1px solid #e5edf5",
          backgroundColor: flipped ? "#ededfc" : "#FFFFFF",
          color: flipped ? "#533afd" : "#273951",
        }}
      >
        <span className="flex items-center gap-1.5">
          <FlipHorizontal2 size={13} strokeWidth={1.5} />
          Flip horizontally
        </span>
        {flipped && <Check size={13} strokeWidth={2} />}
      </button>
      <button
        onClick={() => onFlipVChange(!flippedV)}
        onMouseEnter={(e) => { if (!flippedV) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
        onMouseLeave={(e) => { if (!flippedV) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
        className="flex items-center justify-between px-3 py-1.5 text-xs transition-colors"
        style={{
          borderRadius: 4,
          border: "1px solid #e5edf5",
          backgroundColor: flippedV ? "#ededfc" : "#FFFFFF",
          color: flippedV ? "#533afd" : "#273951",
        }}
      >
        <span className="flex items-center gap-1.5">
          <FlipVertical2 size={13} strokeWidth={1.5} />
          Flip vertically
        </span>
        {flippedV && <Check size={13} strokeWidth={2} />}
      </button>
      <button
        onClick={() => onInvertChange(!inverted)}
        onMouseEnter={(e) => { if (!inverted) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
        onMouseLeave={(e) => { if (!inverted) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
        className="flex items-center justify-between px-3 py-1.5 text-xs transition-colors"
        style={{
          borderRadius: 4,
          border: "1px solid #e5edf5",
          backgroundColor: inverted ? "#ededfc" : "#FFFFFF",
          color: inverted ? "#533afd" : "#273951",
        }}
      >
        <span className="flex items-center gap-1.5">
          <Contrast size={13} strokeWidth={1.5} />
          Invert colors
        </span>
        {inverted && <Check size={13} strokeWidth={2} />}
      </button>
      {onShowShortcuts && (
        <div className="flex items-center justify-between pt-2 border-t border-[#e5edf5]">
          <button
            onClick={() => { onShowShortcuts(); onClose(); }}
            className="text-[12px] hover:underline"
            style={{ color: "#533afd" }}
          >
            Keyboard shortcuts (?)
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Save button with three transient states:
 *   - "Save"     — idle (or "Save" with an orange dot when dirty).
 *   - "Saving…"  — while a manual save is in flight.
 *   - "Saved"    — flashes for ~1.5s after the user-initiated save completes.
 *
 * Auto-saves don't trigger the "Saved" flash — only manual clicks do, so the
 * button stays predictable while the auto-save runs in the background.
 */
function SaveButton({
  isSaving,
  isDirty,
  onSave,
}: {
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
}) {
  const [showSaved, setShowSaved] = useState(false);
  const manualClickRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSavingRef = useRef(isSaving);

  useEffect(() => {
    // Detect the manual-save completion edge: was saving last render, no longer is.
    if (prevSavingRef.current && !isSaving && manualClickRef.current) {
      manualClickRef.current = false;
      // Defer the setState off the effect body to avoid a cascading render.
      // setTimeout(0) is enough — we just need it to run after the current
      // commit phase completes.
      const showTimer = setTimeout(() => setShowSaved(true), 0);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setShowSaved(false), 1500);
      prevSavingRef.current = isSaving;
      return () => clearTimeout(showTimer);
    }
    prevSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const handleClick = () => {
    manualClickRef.current = true;
    onSave();
  };

  // External keyboard shortcut (Cmd/Ctrl+S in AnnotationCanvas) dispatches this
  // so the "Saved" flash + manualClick semantics stay consistent with the
  // button click — instead of the parent calling autoSave.saveNow() directly
  // and bypassing the flash logic that lives here.
  useEffect(() => {
    const handler = () => handleClick();
    window.addEventListener("annotation:trigger-manual-save", handler);
    return () => window.removeEventListener("annotation:trigger-manual-save", handler);
    // handleClick is stable enough — it closes over `onSave` which is recreated
    // on parent renders, but the latest version is captured each effect run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave]);

  const label = isSaving ? "Saving..." : showSaved ? "Saved" : "Save";
  const Icon = showSaved ? CheckCircle2 : Save;
  const bg = showSaved ? "#30B130" : "#533afd";
  const hoverBg = showSaved ? "#28A028" : "#4434d4";

  return (
    <button
      onClick={handleClick}
      disabled={isSaving}
      onMouseEnter={(e) => { if (!isSaving && !showSaved) e.currentTarget.style.backgroundColor = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = bg; }}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white transition-colors"
      style={{
        borderRadius: 4,
        backgroundColor: bg,
        opacity: isSaving ? 0.6 : 1,
        position: "relative",
      }}
    >
      <Icon size={14} />
      {label}
      {isDirty && !showSaved && !isSaving && (
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
          style={{ backgroundColor: "#F5A623" }}
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
  onResetAdjustments,
  isAdjustmentsModified,
  flipped,
  onFlipChange,
  flippedV,
  onFlipVChange,
  rotation,
  onRotate90,
  inverted,
  onInvertChange,
  notesCount = 0,
  onOpenNotes,
  onShowShortcuts,
}: AnnotationHeaderProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const adjustModified =
    isAdjustmentsModified || flipped || flippedV || rotation !== 0 || inverted;

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
          href={`/dashboard/patients/${patientId}/details`}
          className="text-sm transition-colors hover:underline"
          style={{ color: "#64748d" }}
        >
          {patientName}
        </Link>
        <ChevronRight size={14} style={{ color: "#A3ACB9" }} />
        <InlineEditableTitle title={xrayTitle} xrayId={xrayId} />
      </div>

      {/* Right: Adjust + Save + Close */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setAdjustOpen((prev) => !prev)}
            onMouseEnter={(e) => { if (!adjustOpen) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
            onMouseLeave={(e) => { if (!adjustOpen) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors"
            style={{
              borderRadius: 4,
              border: "1px solid #e5edf5",
              backgroundColor: adjustOpen ? "#ededfc" : "#FFFFFF",
              color: adjustOpen ? "#533afd" : "#273951",
              position: "relative",
            }}
            aria-label="Image adjustments"
          >
            <Sun size={14} strokeWidth={1.5} />
            Adjust
            {adjustModified && !adjustOpen && (
              <span
                className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: "#F5A623" }}
              />
            )}
          </button>
          {adjustOpen && (
            <AdjustPopover
              adjustments={adjustments}
              onBrightnessChange={onBrightnessChange}
              onContrastChange={onContrastChange}
              onResetAdjustments={onResetAdjustments}
              isAdjustmentsModified={adjustModified}
              flipped={flipped}
              onFlipChange={onFlipChange}
              flippedV={flippedV}
              onFlipVChange={onFlipVChange}
              rotation={rotation}
              onRotate90={onRotate90}
              inverted={inverted}
              onInvertChange={onInvertChange}
              onClose={() => setAdjustOpen(false)}
              onShowShortcuts={onShowShortcuts}
            />
          )}
        </div>
        {onOpenNotes && (
          <button
            onClick={onOpenNotes}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f6f9fc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FFFFFF")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors"
            style={{ borderRadius: 4, border: "1px solid #e5edf5", backgroundColor: "#FFFFFF", color: "#273951" }}
          >
            <FileText size={14} strokeWidth={1.5} />
            Notes{notesCount > 0 ? ` · ${notesCount}` : ""}
          </button>
        )}
        <SaveButton
          isSaving={isSaving}
          isDirty={isDirty}
          onSave={onSave}
        />
        <button
          onClick={onClose}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; e.currentTarget.style.color = "#0A2540"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#64748d"; }}
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

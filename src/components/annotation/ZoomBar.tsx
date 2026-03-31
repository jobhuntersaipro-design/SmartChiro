"use client";

import { useState } from "react";
import { Maximize, Grid3X3 } from "lucide-react";

interface ZoomBarProps {
  zoomPercent: number;
  onFit: () => void;
  onActual: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCustomZoom: (zoom: number) => void;
}

export function ZoomBar({
  zoomPercent,
  onFit,
  onActual,
  onZoomIn,
  onZoomOut,
  onCustomZoom,
}: ZoomBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const handleZoomClick = () => {
    setIsEditing(true);
    setEditValue(String(zoomPercent));
  };

  const handleZoomSubmit = () => {
    const val = parseInt(editValue, 10);
    if (!isNaN(val) && val > 0) {
      onCustomZoom(val / 100);
    }
    setIsEditing(false);
  };

  return (
    <div
      className="flex items-center justify-center gap-1"
      style={{
        height: 32,
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      <button
        onClick={onZoomOut}
        className="flex items-center justify-center text-xs font-medium transition-opacity hover:opacity-80"
        style={{
          width: 28,
          height: 24,
          borderRadius: 4,
          color: "rgba(255, 255, 255, 0.7)",
        }}
        aria-label="Zoom out"
      >
        −
      </button>

      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleZoomSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleZoomSubmit();
            if (e.key === "Escape") setIsEditing(false);
          }}
          autoFocus
          className="w-14 rounded px-1 text-center text-xs"
          style={{
            height: 22,
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            color: "#FFFFFF",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            outline: "none",
          }}
        />
      ) : (
        <button
          onClick={handleZoomClick}
          className="text-xs tabular-nums transition-opacity hover:opacity-80"
          style={{
            color: "rgba(255, 255, 255, 0.8)",
            minWidth: 48,
          }}
          title="Click to enter custom zoom"
        >
          {zoomPercent}%
        </button>
      )}

      <button
        onClick={onZoomIn}
        className="flex items-center justify-center text-xs font-medium transition-opacity hover:opacity-80"
        style={{
          width: 28,
          height: 24,
          borderRadius: 4,
          color: "rgba(255, 255, 255, 0.7)",
        }}
        aria-label="Zoom in"
      >
        +
      </button>

      <div
        className="mx-1 h-3"
        style={{ width: 1, backgroundColor: "rgba(255, 255, 255, 0.15)" }}
      />

      <button
        onClick={onFit}
        className="flex items-center gap-1 px-2 text-xs transition-opacity hover:opacity-80"
        style={{
          height: 24,
          borderRadius: 4,
          color: "rgba(255, 255, 255, 0.7)",
        }}
        title="Fit to viewport (Ctrl+0)"
      >
        <Maximize size={12} strokeWidth={1.5} />
        Fit
      </button>

      <button
        onClick={onActual}
        className="px-2 text-xs transition-opacity hover:opacity-80"
        style={{
          height: 24,
          borderRadius: 4,
          color: "rgba(255, 255, 255, 0.7)",
        }}
        title="Zoom to 100% (Ctrl+1)"
      >
        1:1
      </button>
    </div>
  );
}

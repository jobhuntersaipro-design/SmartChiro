"use client";

import { Square, Grid2x2, Grid3x3 } from "lucide-react";
import type { ViewMode } from "@/types/annotation";

interface ViewModeSwitcherProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "single", label: "Single View", icon: <Square size={18} strokeWidth={1.5} /> },
  { id: "2x2", label: "2×2 Grid", icon: <Grid2x2 size={18} strokeWidth={1.5} /> },
  { id: "4x4", label: "4×4 Grid", icon: <Grid3x3 size={18} strokeWidth={1.5} /> },
];

export function ViewModeSwitcher({ viewMode, onViewModeChange }: ViewModeSwitcherProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="mx-auto my-1"
        style={{ width: 28, height: 1, backgroundColor: "#E3E8EE" }}
      />
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#697386",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        View
      </span>
      {modes.map((mode) => {
        const isActive = viewMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onViewModeChange(mode.id)}
            title={mode.label}
            aria-label={mode.label}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              backgroundColor: isActive ? "#F0EEFF" : "transparent",
              color: isActive ? "#635BFF" : "#425466",
            }}
          >
            {mode.icon}
          </button>
        );
      })}
    </div>
  );
}

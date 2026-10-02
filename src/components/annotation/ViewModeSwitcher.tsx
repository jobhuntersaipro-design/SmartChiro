"use client";

import { useState, useRef, useEffect } from "react";
import { Square, Columns2, Grid2x2 } from "lucide-react";
import type { ViewMode } from "@/types/annotation";

interface ViewModeSwitcherProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "single", label: "Single", icon: <Square size={18} strokeWidth={1.5} /> },
  { id: "side-by-side", label: "Side by Side", icon: <Columns2 size={18} strokeWidth={1.5} /> },
  { id: "2x2", label: "2×2 Grid", icon: <Grid2x2 size={18} strokeWidth={1.5} /> },
];

export function ViewModeSwitcher({ viewMode, onViewModeChange }: ViewModeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = modes.find((m) => m.id === viewMode) ?? modes[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`View: ${current.label}`}
        aria-label={`Change view mode (current: ${current.label})`}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: open
            ? "#7747ff"
            : hovered
              ? "rgba(255,255,255,.14)"
              : "rgba(255,255,255,.06)",
          color: open ? "#FFFFFF" : hovered ? "#FFFFFF" : "#c4c4c4",
        }}
      >
        {current.icon}
      </button>

      {open && (
        <div
          className="absolute z-50"
          style={{
            bottom: 0,
            left: "100%",
            marginLeft: 8,
            backgroundColor: "#FFFFFF",
            border: "1px solid #e9e9e9",
            borderRadius: 14,
            boxShadow: "var(--shadow-md)",
            minWidth: 140,
            overflow: "hidden",
          }}
        >
          {modes.map((mode) => {
            const isActive = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => {
                  onViewModeChange(mode.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 transition-colors"
                style={{
                  padding: "8px 12px",
                  backgroundColor: isActive ? "#ede7ff" : "transparent",
                  color: isActive ? "#7747ff" : "#0b0b0b",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "#f8f8f8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isActive ? "#ede7ff" : "transparent";
                }}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

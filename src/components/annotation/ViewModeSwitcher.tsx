"use client";

import { useState, useRef, useEffect } from "react";
import { Square, Columns2, Grid2x2, ChevronDown } from "lucide-react";
import type { ViewMode } from "@/types/annotation";

interface ViewModeSwitcherProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const modes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "single", label: "Single", icon: <Square size={14} strokeWidth={1.5} /> },
  { id: "1x1", label: "Side by Side", icon: <Columns2 size={14} strokeWidth={1.5} /> },
  { id: "2x2", label: "2×2 Grid", icon: <Grid2x2 size={14} strokeWidth={1.5} /> },
];

export function ViewModeSwitcher({ viewMode, onViewModeChange }: ViewModeSwitcherProps) {
  const [open, setOpen] = useState(false);
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
    <div className="flex items-center px-2" ref={ref}>
      {/* Dropdown Trigger */}
      <div className="relative">
        <button
          onClick={() => setOpen((prev) => !prev)}
          title="Change view mode"
          aria-label="Change view mode"
          className="flex items-center gap-1 transition-colors"
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            backgroundColor: open ? "#F0EEFF" : "transparent",
            color: "#635BFF",
            border: "1px solid #E3E8EE",
          }}
        >
          {current.icon}
          <span style={{ fontSize: 11, fontWeight: 500 }}>{current.label}</span>
          <ChevronDown size={10} style={{ marginLeft: 2 }} />
        </button>

        {/* Dropdown Menu */}
        {open && (
          <div
            className="absolute z-50"
            style={{
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: 4,
              backgroundColor: "#FFFFFF",
              border: "1px solid #E3E8EE",
              borderRadius: 6,
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(18, 42, 66, 0.06)",
              minWidth: 100,
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
                    backgroundColor: isActive ? "#F0EEFF" : "transparent",
                    color: isActive ? "#635BFF" : "#425466",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = "#F0F3F7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isActive ? "#F0EEFF" : "transparent";
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
    </div>
  );
}

"use client";

import { useState } from "react";
import { Pencil, Ruler, Hand, X } from "lucide-react";

const hints = [
  { icon: <Hand size={14} strokeWidth={1.5} />, label: "Pan", shortcut: "H" },
  { icon: <Pencil size={14} strokeWidth={1.5} />, label: "Draw", shortcut: "P" },
  { icon: <Ruler size={14} strokeWidth={1.5} />, label: "Measure", shortcut: "M" },
];

export function EmptyCanvasHint() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 bottom-6 z-10 flex items-center gap-2 px-3 py-2"
      style={{
        transform: "translateX(-50%)",
        backgroundColor: "rgba(6, 27, 49, 0.85)",
        backdropFilter: "blur(8px)",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
        animation: "emptyHintFadeIn 400ms ease-out",
      }}
    >
      <span
        className="text-[12px] font-medium"
        style={{ color: "#FFFFFF", letterSpacing: 0.2 }}
      >
        Pick a tool to start
      </span>
      <span style={{ width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" }} />
      <div className="flex items-center gap-2">
        {hints.map((h) => (
          <span
            key={h.label}
            className="flex items-center gap-1 text-[11px]"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {h.icon}
            {h.label}
            <span
              className="rounded px-1 py-0.5 text-[10px]"
              style={{
                backgroundColor: "rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.95)",
              }}
            >
              {h.shortcut}
            </span>
          </span>
        ))}
      </div>
      <span style={{ width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" }} />
      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.65)" }}>
        Press{" "}
        <span
          className="rounded px-1 py-0.5 text-[10px]"
          style={{
            backgroundColor: "rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.95)",
          }}
        >
          ?
        </span>{" "}
        for shortcuts
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="pointer-events-auto ml-1 flex items-center justify-center rounded-[4px] transition-colors"
        style={{
          width: 20,
          height: 20,
          color: "rgba(255,255,255,0.6)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        }}
        aria-label="Dismiss hint"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
      <style>{`
        @keyframes emptyHintFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

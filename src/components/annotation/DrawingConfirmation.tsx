"use client";

import { Check, X } from "lucide-react";

interface DrawingConfirmationProps {
  screenX: number;
  screenY: number;
  onAccept: () => void;
  onReject: () => void;
}

export function DrawingConfirmation({
  screenX,
  screenY,
  onAccept,
  onReject,
}: DrawingConfirmationProps) {
  return (
    <div
      className="pointer-events-auto absolute z-50 flex items-center gap-1"
      style={{
        left: screenX,
        top: screenY + 12,
        transform: "translateX(-50%)",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E3E8EE",
        borderRadius: 6,
        padding: 4,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(18, 42, 66, 0.04)",
        animation: "confirmFadeIn 150ms ease-out",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onAccept(); }}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          color: "#30B130",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#E8F5E8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        title="Accept (Enter)"
      >
        <Check size={16} strokeWidth={2} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onReject(); }}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          color: "#DF1B41",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#FDE8EC"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        title="Reject (Esc)"
      >
        <X size={16} strokeWidth={2} />
      </button>
      <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useEffect, useCallback } from "react";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["H"], description: "Pan / Hand tool" },
      { keys: ["Space"], description: "Temporary pan (hold)" },
      { keys: ["\u2318", "0"], description: "Fit to viewport" },
      { keys: ["\u2318", "1"], description: "Zoom to 100%" },
      { keys: ["\u2318", "="], description: "Zoom in" },
      { keys: ["\u2318", "\u2212"], description: "Zoom out" },
      { keys: ["\u2318", "Scroll"], description: "Scroll zoom" },
    ],
  },
  {
    title: "Drawing Tools",
    shortcuts: [
      { keys: ["P"], description: "Freehand" },
      { keys: ["L"], description: "Line" },
      { keys: ["A"], description: "Arrow" },
      { keys: ["T"], description: "Text" },
      { keys: ["X"], description: "Eraser" },
    ],
  },
  {
    title: "Measurement Tools",
    shortcuts: [
      { keys: ["M"], description: "Ruler" },
      { keys: ["\u21E7", "M"], description: "Angle" },
      { keys: ["\u2318", "\u21E7", "M"], description: "Cobb Angle" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["\u2318", "Z"], description: "Undo" },
      { keys: ["\u2318", "\u21E7", "Z"], description: "Redo" },
      { keys: ["\u2318", "C"], description: "Copy" },
      { keys: ["\u2318", "V"], description: "Paste" },
      { keys: ["\u2318", "D"], description: "Duplicate" },
      { keys: ["\u2318", "A"], description: "Select all" },
      { keys: ["Del"], description: "Delete selected" },
      { keys: ["\u2190\u2191\u2193\u2192"], description: "Nudge 1px" },
      { keys: ["\u21E7", "\u2190\u2191\u2193\u2192"], description: "Nudge 10px" },
      { keys: ["["], description: "Send backward" },
      { keys: ["]"], description: "Bring forward" },
      { keys: ["\u2318", "S"], description: "Save" },
    ],
  },
  {
    title: "UI",
    shortcuts: [
      { keys: ["\\"], description: "Toggle properties panel" },
      { keys: ["?"], description: "Toggle shortcuts help" },
      { keys: ["Esc"], description: "Deselect / close dialog" },
      { keys: ["Enter"], description: "Accept drawn shape" },
    ],
  },
];

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(26, 31, 54, 0.90)" }}
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-[720px] overflow-y-auto"
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(18, 42, 66, 0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #E3E8EE",
            borderRadius: "8px 8px 0 0",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#0A2540" }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center transition-colors hover:bg-[#F0F3F7]"
            style={{ width: 32, height: 32, borderRadius: 4, color: "#697386" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - two column grid */}
        <div className="grid grid-cols-2 gap-6 p-6">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.title}>
              <h3
                className="mb-3"
                style={{ fontSize: 13, fontWeight: 600, color: "#697386", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                {category.title}
              </h3>
              <div className="flex flex-col gap-1.5">
                {category.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span style={{ fontSize: 14, color: "#0A2540" }}>
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center"
                          style={{
                            minWidth: 24,
                            height: 24,
                            padding: "0 6px",
                            fontSize: 12,
                            fontFamily: "inherit",
                            fontWeight: 500,
                            color: "#425466",
                            backgroundColor: "#F6F9FC",
                            border: "1px solid #E3E8EE",
                            borderRadius: 4,
                            boxShadow: "0 1px 1px rgba(0,0,0,0.04)",
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3"
          style={{
            borderTop: "1px solid #E3E8EE",
            fontSize: 12,
            color: "#697386",
            textAlign: "center",
          }}
        >
          Press <kbd style={{ fontSize: 11, padding: "1px 5px", backgroundColor: "#F6F9FC", border: "1px solid #E3E8EE", borderRadius: 3, fontFamily: "inherit" }}>?</kbd> or <kbd style={{ fontSize: 11, padding: "1px 5px", backgroundColor: "#F6F9FC", border: "1px solid #E3E8EE", borderRadius: 3, fontFamily: "inherit" }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

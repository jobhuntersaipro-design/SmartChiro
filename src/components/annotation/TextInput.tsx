"use client";

import { useCallback, useEffect, useRef } from "react";

interface TextInputProps {
  x: number;
  y: number;
  zoom: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

export function TextInput({ x, y, zoom, onCommit, onCancel }: TextInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus on mount
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      // Enter without Shift commits
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const text = inputRef.current?.value ?? "";
        onCommit(text);
        return;
      }
    },
    [onCommit, onCancel]
  );

  const handleBlur = useCallback(() => {
    const text = inputRef.current?.value ?? "";
    if (text.trim()) {
      onCommit(text);
    } else {
      onCancel();
    }
  }, [onCommit, onCancel]);

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        zIndex: 50,
        pointerEvents: "auto",
      }}
    >
      <textarea
        ref={inputRef}
        className="resize-none border-none outline-none"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "#FFFFFF",
          fontSize: 16 * zoom,
          fontFamily: "Inter, system-ui, sans-serif",
          padding: 4,
          minWidth: 60,
          minHeight: 24,
          borderRadius: 2,
          caretColor: "#FFFFFF",
        }}
        rows={1}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

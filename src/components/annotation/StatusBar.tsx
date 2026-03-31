"use client";

import type { Point } from "@/types/annotation";

interface StatusBarProps {
  cursorPosition: Point | null;
  selectedCount: number;
  isDirty: boolean;
  activeTool: string;
  shapeCount: number;
}

export function StatusBar({
  cursorPosition,
  selectedCount,
  isDirty,
  activeTool,
  shapeCount,
}: StatusBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4"
      style={{
        height: 28,
        backgroundColor: "#FFFFFF",
        borderTop: "1px solid #E3E8EE",
        fontSize: 12,
        color: "#697386",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="tabular-nums">
          {cursorPosition
            ? `X: ${Math.round(cursorPosition.x)}  Y: ${Math.round(cursorPosition.y)}`
            : "—"}
        </span>
        {selectedCount > 0 && (
          <span>
            {selectedCount} shape{selectedCount !== 1 ? "s" : ""} selected
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span>{shapeCount} annotation{shapeCount !== 1 ? "s" : ""}</span>
        <span className="capitalize">{activeTool.replace("_", " ")} tool</span>
        {isDirty && (
          <span style={{ color: "#F5A623" }}>Unsaved changes</span>
        )}
      </div>
    </div>
  );
}

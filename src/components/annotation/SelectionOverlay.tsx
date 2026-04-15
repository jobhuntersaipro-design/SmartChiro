"use client";

import type { BaseShape, ViewTransform } from "@/types/annotation";
import { imageToScreen } from "@/types/annotation";

interface SelectionOverlayProps {
  shapes: BaseShape[];
  selectedShapeIds: string[];
  transform: ViewTransform;
}

export function SelectionOverlay({
  shapes,
  selectedShapeIds,
  transform,
}: SelectionOverlayProps) {
  if (selectedShapeIds.length === 0) return null;

  const selectedShapes = shapes.filter((s) => selectedShapeIds.includes(s.id));
  if (selectedShapes.length === 0) return null;

  // Compute bounding box in image space
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const shape of selectedShapes) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  // Convert to screen space
  const topLeft = imageToScreen(minX, minY, transform);
  const bottomRight = imageToScreen(maxX, maxY, transform);

  const screenX = topLeft.x;
  const screenY = topLeft.y;
  const screenW = bottomRight.x - topLeft.x;
  const screenH = bottomRight.y - topLeft.y;

  // Handle positions (corners + midpoints)
  const handles = [
    // Corners
    { cx: screenX, cy: screenY, cursor: "nwse-resize" },
    { cx: screenX + screenW, cy: screenY, cursor: "nesw-resize" },
    { cx: screenX + screenW, cy: screenY + screenH, cursor: "nwse-resize" },
    { cx: screenX, cy: screenY + screenH, cursor: "nesw-resize" },
    // Midpoints
    { cx: screenX + screenW / 2, cy: screenY, cursor: "ns-resize" },
    { cx: screenX + screenW, cy: screenY + screenH / 2, cursor: "ew-resize" },
    { cx: screenX + screenW / 2, cy: screenY + screenH, cursor: "ns-resize" },
    { cx: screenX, cy: screenY + screenH / 2, cursor: "ew-resize" },
  ];

  // Rotation handle
  const rotateHandleY = screenY - 20;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Bounding box */}
      <rect
        x={screenX}
        y={screenY}
        width={screenW}
        height={screenH}
        fill="none"
        stroke="#533afd"
        strokeWidth={1}
        strokeDasharray="4 2"
      />

      {/* Rotation handle line */}
      <line
        x1={screenX + screenW / 2}
        y1={screenY}
        x2={screenX + screenW / 2}
        y2={rotateHandleY}
        stroke="#533afd"
        strokeWidth={1}
      />

      {/* Rotation handle circle */}
      <circle
        cx={screenX + screenW / 2}
        cy={rotateHandleY}
        r={4}
        fill="#FFFFFF"
        stroke="#533afd"
        strokeWidth={1.5}
        className="pointer-events-auto"
        style={{ cursor: "grab" }}
      />

      {/* Resize handles */}
      {handles.map((h, i) => (
        <rect
          key={i}
          x={h.cx - 3.5}
          y={h.cy - 3.5}
          width={7}
          height={7}
          rx={1}
          fill="#FFFFFF"
          stroke="#533afd"
          strokeWidth={1.5}
          className="pointer-events-auto"
          style={{ cursor: h.cursor }}
        />
      ))}
    </svg>
  );
}

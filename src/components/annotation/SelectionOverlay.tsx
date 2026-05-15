"use client";

import type { BaseShape, ViewTransform } from "@/types/annotation";
import { imageToScreen } from "@/types/annotation";
import { resolveShapeRefs } from "@/lib/measurements";

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

  // Resolve pointRefs so the marquee follows whatever the user currently
  // sees on the canvas. When a ruler/line is anchored to a landmark, the
  // shape's stored x/y/width/height represent the bbox at draw time;
  // resolving from points keeps the marquee glued to the rendered line
  // even if the landmark has been dragged.
  const shapeMap = new Map(shapes.map((s) => [s.id, s]));
  const selectedShapes = shapes
    .filter((s) => selectedShapeIds.includes(s.id))
    .map((s) => resolveShapeRefs(s, shapeMap));
  if (selectedShapes.length === 0) return null;

  // Always derive the bbox from points so a horizontal line snapped to two
  // landmarks (which has the right x/y/width but degenerate height) renders
  // a tight strip around the actual line — not a stale rectangle elsewhere.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const shape of selectedShapes) {
    if (shape.points.length > 0) {
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    } else {
      if (shape.x < minX) minX = shape.x;
      if (shape.y < minY) minY = shape.y;
      if (shape.x + shape.width > maxX) maxX = shape.x + shape.width;
      if (shape.y + shape.height > maxY) maxY = shape.y + shape.height;
    }
  }
  if (!Number.isFinite(minX)) return null;

  // Pad the marquee out a few image-pixels so a zero-thickness horizontal
  // or vertical shape (a ruler between two collinear landmarks) still has
  // a visible rectangle around it. Padding is in image space so it
  // remains constant on screen regardless of zoom.
  const pad = 4 / Math.max(transform.zoom, 0.001);
  if (maxX - minX < pad * 2) {
    const cx = (minX + maxX) / 2;
    minX = cx - pad;
    maxX = cx + pad;
  }
  if (maxY - minY < pad * 2) {
    const cy = (minY + maxY) / 2;
    minY = cy - pad;
    maxY = cy + pad;
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

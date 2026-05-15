"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolId, ToolState, BaseShape, Point } from "@/types/annotation";
import { screenToImage } from "@/types/annotation";
import type { ViewTransform } from "@/types/annotation";

interface UseCanvasInteractionOptions {
  transform: ViewTransform;
  pan: (dx: number, dy: number) => void;
  shapes: BaseShape[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMoveShapes?: (shapeIds: string[], dx: number, dy: number) => void;
  /** Drag a single vertex of a single shape. When provided, vertex hits take
   *  precedence over shape hits in the hand-tool hit-test. */
  onMoveVertex?: (shapeId: string, vertexIndex: number, dx: number, dy: number) => void;
}

interface DragEvent {
  shapeIds: string[];
  startImagePos: Point;
  hasMoved: boolean;
  /** When set, this drag manipulates only `shapes[shapeId].points[vertexIndex]`,
   *  not the entire shape. Set when the click landed on a vertex handle. */
  vertex?: { shapeId: string; vertexIndex: number };
}

interface MarqueeState {
  /** Image-space anchor where the empty-click started. */
  start: Point;
  /** Image-space cursor position (updated on move). */
  end: Point;
  /** Whether the user has moved enough to qualify as a drag (vs. a click). */
  hasMoved: boolean;
  /** Shift-held when starting → additive selection (preserve existing). */
  additive: boolean;
}

/**
 * Shortest distance from `(px, py)` to the segment `(ax,ay)-(bx,by)`.
 * Used by the proximity hit-test so clicks near a line/polyline segment
 * register as a hit even if the click isn't inside the AABB.
 */
function distancePointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Shortest distance from `(px, py)` to the shape's nearest visible feature.
 * Tries point/segment proximity for shapes that are mostly stroke (point,
 * line/polyline, ruler, angle, cobb, arrow, calibration); falls back to a
 * 0-if-inside-AABB contains test for filled shapes (rectangle, ellipse, text,
 * freehand). Returns Infinity when the shape has no usable geometry.
 */
function distanceToShape(px: number, py: number, shape: BaseShape): number {
  const pts = shape.points;
  switch (shape.type) {
    case "point":
    case "landmark": {
      if (pts.length === 0) return Infinity;
      return Math.hypot(px - pts[0].x, py - pts[0].y);
    }
    case "line":
    case "polyline":
    case "ruler":
    case "calibration":
    case "arrow": {
      if (pts.length < 2) return Infinity;
      let min = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const d = distancePointToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        if (d < min) min = d;
      }
      return min;
    }
    case "angle": {
      // Two segments meeting at points[1] (the vertex).
      if (pts.length < 3) return Infinity;
      const d1 = distancePointToSegment(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const d2 = distancePointToSegment(px, py, pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      return Math.min(d1, d2);
    }
    case "cobb_angle": {
      // Two independent lines: pts[0]-pts[1] and pts[2]-pts[3].
      if (pts.length < 4) return Infinity;
      const d1 = distancePointToSegment(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const d2 = distancePointToSegment(px, py, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
      return Math.min(d1, d2);
    }
    case "rectangle":
    case "ellipse":
    case "text":
    case "freehand": {
      // AABB containment: 0 inside, distance to nearest edge outside.
      const x0 = shape.x;
      const y0 = shape.y;
      const x1 = shape.x + shape.width;
      const y1 = shape.y + shape.height;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return 0;
      const cx = Math.max(x0, Math.min(px, x1));
      const cy = Math.max(y0, Math.min(py, y1));
      return Math.hypot(px - cx, py - cy);
    }
    default:
      return Infinity;
  }
}

/** Vertex pixel radius for hit-test (device px). Slightly larger than the dot
 *  visual radius so the user has a forgiving target. Matches the snap radius
 *  in useDrawingTools so snap-to-vertex and vertex-drag use the same affordance. */
const VERTEX_HIT_PIXELS = 12;

/** Shape kinds whose individual vertices are draggable. Same set as the
 *  snap-source kinds — you should only be able to drag the kinds you can snap
 *  to. Angle/cobb vertices are also user-positionable but their measurement
 *  geometry is recomputed via resolveShapeRefs / direct point updates, so we
 *  include them too. */
const VERTEX_DRAG_KINDS = new Set<BaseShape["type"]>([
  "point",
  "landmark",
  "line",
  "polyline",
  "angle",
  "cobb_angle",
]);

/**
 * Return the closest vertex within `VERTEX_HIT_PIXELS` of `(imageX, imageY)`,
 * or null if none. Among ties, the topmost (highest zIndex) wins so an upper
 * vertex always grabs first when stacked.
 */
function hitTestVertex(
  imageX: number,
  imageY: number,
  shapes: BaseShape[],
  zoom: number,
): { shapeId: string; vertexIndex: number } | null {
  const r = VERTEX_HIT_PIXELS / zoom;
  const r2 = r * r;
  let bestDist2 = Infinity;
  let bestZ = -Infinity;
  let best: { shapeId: string; vertexIndex: number } | null = null;
  for (const s of shapes) {
    if (!s.visible || s.locked) continue;
    if (!VERTEX_DRAG_KINDS.has(s.type)) continue;
    for (let i = 0; i < s.points.length; i++) {
      const v = s.points[i];
      const dx = v.x - imageX;
      const dy = v.y - imageY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (d2 < bestDist2 || (d2 === bestDist2 && s.zIndex > bestZ)) {
        bestDist2 = d2;
        bestZ = s.zIndex;
        best = { shapeId: s.id, vertexIndex: i };
      }
    }
  }
  return best;
}

interface UseCanvasInteractionReturn {
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  toolState: ToolState;
  selectedShapeIds: string[];
  setSelectedShapeIds: (ids: string[]) => void;
  cursorPosition: Point | null;
  isPanning: boolean;
  isDragging: boolean;
  /** Image-space rectangle for the in-progress rubber-band selection, or
   *  null when not marqueeing. Renderer draws it as a dashed overlay. */
  marqueeRect: { x: number; y: number; width: number; height: number } | null;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

export function useCanvasInteraction({
  transform,
  pan,
  shapes,
  containerRef,
  onMoveShapes,
  onMoveVertex,
}: UseCanvasInteractionOptions): UseCanvasInteractionReturn {
  const [activeTool, setActiveToolState] = useState<ToolId>("hand");
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  // True when the active pan started from a hand-tool empty-area click — used
  // to treat a no-movement release as "clear selection" (otherwise plain
  // clicks get swallowed since pan ate the previous marquee-clear path).
  const panClearsSelectionRef = useRef(false);
  // Set when pan moves more than the click-vs-drag threshold from origin —
  // distinguishes a click-without-drag from a real pan gesture so the first
  // click on empty canvas reliably clears the selection.
  const panMovedRef = useRef(false);
  // Pointer position when pan started (screen coords). Used by pointerUp to
  // measure total pan distance against a threshold instead of every
  // pointermove tick (which can fire with 0–1px deltas during a still click).
  const panOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragEvent | null>(null);
  const spaceHeldRef = useRef(false);
  const previousToolRef = useRef<ToolId>("hand");
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);

  const setActiveTool = useCallback(
    (tool: ToolId) => {
      setActiveToolState(tool);
      setToolState(tool === "hand" ? "idle" : "tool_selected");
    },
    []
  );

  // Hit test: pick the visible, unlocked shape *closest* to the click within
  // a hit-distance threshold. Critical for line/polyline/point shapes where the
  // bounding box would either be empty (point: width=0,height=0) or cover huge
  // empty space (polyline AABB), making selection unreachable for anything but
  // the topmost shape. With a proximity test the user can click on the actual
  // visible feature — the dot, the line segment, the rectangle stroke — and
  // get the right shape, even if a bigger shape's AABB sits on top.
  const hitTest = useCallback(
    (imageX: number, imageY: number): BaseShape | null => {
      const HIT_DISTANCE = 8 / transform.zoom; // 8 device px in image-space
      const candidates = shapes.filter((s) => s.visible && !s.locked);

      let best: BaseShape | null = null;
      let bestDist = Infinity;

      for (const shape of candidates) {
        const d = distanceToShape(imageX, imageY, shape);
        if (d > HIT_DISTANCE) continue;
        // Within threshold — break ties by zIndex (top wins among equally-close hits).
        if (d < bestDist || (d === bestDist && (best?.zIndex ?? -Infinity) < shape.zIndex)) {
          best = shape;
          bestDist = d;
        }
      }
      return best;
    },
    [shapes, transform.zoom]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Middle mouse button or space+click = always pan
      if (e.button === 1 || spaceHeldRef.current) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // Pan + Select tools share the click-on-shape selection logic. They
      // differ only in what plain drag on empty canvas means:
      //   - Pan tool   → drag pans the viewport (marquee via Shift+drag)
      //   - Select tool → drag rubber-bands a marquee (replaces selection;
      //                   Shift+drag extends, just like Photoshop / Figma)
      // Multi-select on shapes is Shift OR Cmd/Ctrl+click on either tool.
      if (activeTool === "hand" || activeTool === "select") {
        const imagePos = screenToImage(screenX, screenY, transform);

        // Vertex hit takes precedence over shape hit. If the click landed on
        // a vertex handle, drag updates only that single point so referenced
        // measurements can follow live. Selection still goes to the parent
        // shape so the properties panel reflects the right thing.
        const vertexHit = onMoveVertex
          ? hitTestVertex(imagePos.x, imagePos.y, shapes, transform.zoom)
          : null;
        if (vertexHit) {
          // Vertex hit: support Shift / Cmd / Ctrl to toggle the parent
          // shape in/out of the multi-selection (Point shapes register as
          // vertex hits, so without this the second Shift+click on a point
          // would replace the selection instead of extending it).
          const additiveVertex = e.shiftKey || e.metaKey || e.ctrlKey;
          if (additiveVertex) {
            setSelectedShapeIds((prev) =>
              prev.includes(vertexHit.shapeId)
                ? prev.filter((id) => id !== vertexHit.shapeId)
                : [...prev, vertexHit.shapeId]
            );
          } else if (!selectedShapeIds.includes(vertexHit.shapeId)) {
            setSelectedShapeIds([vertexHit.shapeId]);
          }
          setToolState("shape_selected");
          dragRef.current = {
            shapeIds: [vertexHit.shapeId],
            startImagePos: imagePos,
            hasMoved: false,
            vertex: vertexHit,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        const hit = hitTest(imagePos.x, imagePos.y);

        // Multi-select modifier: Shift OR Cmd (Mac) OR Ctrl (Windows/Linux).
        // All three toggle the clicked shape in/out of the current selection.
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;

        if (hit) {
          if (additive) {
            setSelectedShapeIds((prev) =>
              prev.includes(hit.id)
                ? prev.filter((id) => id !== hit.id)
                : [...prev, hit.id]
            );
          } else if (!selectedShapeIds.includes(hit.id)) {
            setSelectedShapeIds([hit.id]);
          }
          setToolState("shape_selected");
          // Start drag tracking
          const dragIds = selectedShapeIds.includes(hit.id)
            ? selectedShapeIds
            : [hit.id];
          dragRef.current = {
            shapeIds: dragIds,
            startImagePos: imagePos,
            hasMoved: false,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } else if (activeTool === "select") {
          // Select tool + empty-area drag → marquee select. Plain drag
          // replaces the current selection; Shift / Cmd / Ctrl + drag
          // extends it (kept consistent with the click-on-shape modifier).
          setMarquee({
            start: imagePos,
            end: imagePos,
            hasMoved: false,
            additive,
          });
          dragRef.current = null;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } else if (additive) {
          // Pan tool + Shift / Cmd / Ctrl + empty-area drag → additive
          // marquee selection.
          setMarquee({
            start: imagePos,
            end: imagePos,
            hasMoved: false,
            additive: true,
          });
          dragRef.current = null;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } else {
          // Pan tool + plain drag on empty canvas → pan the viewport,
          // matching the toolbar tooltip. Click without drag clears
          // the selection (handled in pointerUp).
          setIsPanning(true);
          panStartRef.current = { x: e.clientX, y: e.clientY };
          panOriginRef.current = { x: e.clientX, y: e.clientY };
          panClearsSelectionRef.current = true;
          panMovedRef.current = false;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
        return;
      }
    },
    [activeTool, transform, hitTest, selectedShapeIds, shapes, onMoveVertex]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const imagePos = screenToImage(screenX, screenY, transform);
      setCursorPosition(imagePos);

      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        // Only count as "moved" once the cursor has crossed a 3px threshold
        // from the original click — avoids flagging a still click as a pan
        // due to sub-pixel tremor (which would suppress the click-empty
        // deselect on the first click).
        if (panOriginRef.current && !panMovedRef.current) {
          const totalDx = e.clientX - panOriginRef.current.x;
          const totalDy = e.clientY - panOriginRef.current.y;
          if (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3) {
            panMovedRef.current = true;
          }
        }
        pan(dx, dy);
        return;
      }

      // Rubber-band marquee selection — empty-drag on canvas (Pan or Select tool)
      if (marquee && (activeTool === "hand" || activeTool === "select")) {
        const dx = imagePos.x - marquee.start.x;
        const dy = imagePos.y - marquee.start.y;
        const moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
        setMarquee({
          ...marquee,
          end: imagePos,
          hasMoved: marquee.hasMoved || moved,
        });
        return;
      }

      // Shape / vertex dragging — works on Pan or Select tool
      if (dragRef.current && (activeTool === "hand" || activeTool === "select")) {
        const dx = imagePos.x - dragRef.current.startImagePos.x;
        const dy = imagePos.y - dragRef.current.startImagePos.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          if (!dragRef.current.hasMoved) {
            dragRef.current.hasMoved = true;
            setIsDragging(true);
          }
          if (dragRef.current.vertex) {
            onMoveVertex?.(
              dragRef.current.vertex.shapeId,
              dragRef.current.vertex.vertexIndex,
              dx,
              dy,
            );
          } else {
            onMoveShapes?.(dragRef.current.shapeIds, dx, dy);
          }
          dragRef.current.startImagePos = imagePos;
        }
      }
    },
    [transform, isPanning, pan, activeTool, onMoveShapes, onMoveVertex, marquee]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        // Click on empty canvas (hand tool, no shift) without dragging →
        // clear selection. Middle-click and Space-pan don't set the flag
        // so they never clear the selection on release.
        if (panClearsSelectionRef.current && !panMovedRef.current) {
          setSelectedShapeIds([]);
          setToolState("idle");
        }
        panClearsSelectionRef.current = false;
        panMovedRef.current = false;
        panOriginRef.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
      if (dragRef.current) {
        if (dragRef.current.hasMoved) {
          // Drag completed — commit undo entry via custom event
          window.dispatchEvent(
            new CustomEvent("canvas:drag-end", {
              detail: { shapeIds: dragRef.current.shapeIds },
            })
          );
        }
        dragRef.current = null;
        setIsDragging(false);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // Already released
        }
      }
      // Marquee selection finalization
      if (marquee) {
        if (marquee.hasMoved) {
          // Compute selection rect (image-space, normalized)
          const minX = Math.min(marquee.start.x, marquee.end.x);
          const minY = Math.min(marquee.start.y, marquee.end.y);
          const maxX = Math.max(marquee.start.x, marquee.end.x);
          const maxY = Math.max(marquee.start.y, marquee.end.y);
          // Select all shapes whose AABB intersects the rect.
          const hits: string[] = [];
          for (const s of shapes) {
            if (!s.visible || s.locked) continue;
            const sx0 = s.x;
            const sy0 = s.y;
            const sx1 = s.x + s.width;
            const sy1 = s.y + s.height;
            // Treat zero-width/height shapes (Point) as a 1×1 box at (x,y)
            const useX1 = s.width === 0 ? sx0 + 0.5 : sx1;
            const useY1 = s.height === 0 ? sy0 + 0.5 : sy1;
            const intersects =
              !(useX1 < minX || sx0 > maxX || useY1 < minY || sy0 > maxY);
            if (intersects) hits.push(s.id);
          }
          if (marquee.additive) {
            // Shift+drag → add to existing selection without dropping prior shapes
            setSelectedShapeIds((prev) => Array.from(new Set([...prev, ...hits])));
          } else {
            setSelectedShapeIds(hits);
          }
          setToolState(hits.length > 0 ? "shape_selected" : "idle");
        } else {
          // Click without drag on empty area → clear selection
          setSelectedShapeIds([]);
          setToolState("idle");
        }
        setMarquee(null);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // Already released
        }
      }
    },
    [isPanning, marquee, shapes]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Space for temporary pan
      if (e.code === "Space" && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        previousToolRef.current = activeTool;
        setActiveToolState("hand");
        return;
      }

      // Tool shortcuts (no modifier except Shift for polyline / cobb)
      if (!mod) {
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case "l":
              setActiveTool("polyline");
              return;
            case "a":
              setActiveTool("cobb_angle");
              return;
          }
        }

        if (!e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case "h":
              setActiveTool("hand");
              return;
            case "v":
              setActiveTool("select");
              return;
            case "d":
              setActiveTool("point");
              return;
            case "l":
              setActiveTool("line");
              return;
            case "m":
              setActiveTool("ruler");
              return;
            case "a":
              setActiveTool("angle");
              return;
            case "r":
              setActiveTool("arrow");
              return;
            case "t":
              setActiveTool("text");
              return;
            case "k":
              setActiveTool("calibrate");
              return;
          }
        }
      }

      // Selection shortcuts
      if (e.key === "Escape") {
        setSelectedShapeIds([]);
        setToolState("idle");
        return;
      }

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const selectableIds = shapes
          .filter((s) => s.visible && !s.locked)
          .map((s) => s.id);
        setSelectedShapeIds(selectableIds);
        if (selectableIds.length > 0) setToolState("shape_selected");
        return;
      }

      // Delete selected shapes
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedShapeIds.length > 0
      ) {
        const event = new CustomEvent("canvas:delete-shapes", {
          detail: { shapeIds: selectedShapeIds },
        });
        window.dispatchEvent(event);
        setSelectedShapeIds([]);
        setToolState("idle");
        return;
      }

      // Layer ordering: [ and ]
      if (e.key === "[" && selectedShapeIds.length > 0) {
        window.dispatchEvent(
          new CustomEvent("canvas:reorder-shape", {
            detail: { shapeId: selectedShapeIds[0], direction: "back" },
          })
        );
        return;
      }
      if (e.key === "]" && selectedShapeIds.length > 0) {
        window.dispatchEvent(
          new CustomEvent("canvas:reorder-shape", {
            detail: { shapeId: selectedShapeIds[0], direction: "forward" },
          })
        );
        return;
      }

      // Duplicate
      if (mod && e.key.toLowerCase() === "d" && selectedShapeIds.length > 0) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("canvas:duplicate-shapes", {
            detail: { shapeIds: selectedShapeIds },
          })
        );
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setActiveToolState(previousToolRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTool, setActiveTool, selectedShapeIds, shapes]);

  // Derive normalized image-space rect from the marquee state for the renderer.
  const marqueeRect = marquee
    ? {
        x: Math.min(marquee.start.x, marquee.end.x),
        y: Math.min(marquee.start.y, marquee.end.y),
        width: Math.abs(marquee.end.x - marquee.start.x),
        height: Math.abs(marquee.end.y - marquee.start.y),
      }
    : null;

  return {
    activeTool,
    setActiveTool,
    toolState,
    selectedShapeIds,
    setSelectedShapeIds,
    cursorPosition,
    isPanning,
    isDragging,
    marqueeRect,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

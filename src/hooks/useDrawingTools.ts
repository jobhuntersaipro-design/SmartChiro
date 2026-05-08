"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BaseShape,
  Point,
  ShapeStyle,
  ToolId,
  VertexRef,
  ViewTransform,
} from "@/types/annotation";
import {
  MEASUREMENT_STYLE,
  computeBoundingBox,
  screenToImage,
  simplifyPoints,
} from "@/types/annotation";

// ─── Constants ───

const MIN_LINE_LENGTH = 3;
const MIN_FREEHAND_POINTS = 2;
const ERASER_RADIUS = 8;
const FREEHAND_SIMPLIFY_TOLERANCE = 1.5;
/** Snap-to-vertex radius (device pixels). Matches the vertex dot visual radius. */
const VERTEX_SNAP_PIXELS = 12;
/** Shape kinds whose vertex dots act as snap targets. Angle/cobb/ruler
 *  vertices are included so any landmark a user has placed can be re-used
 *  as a snap target for new measurements. All these kinds render numbered
 *  dots via computeGlobalPointLabels. */
const SNAPPABLE_KINDS = new Set(["polyline", "line", "point", "angle", "cobb_angle", "ruler"]);

/**
 * If `point` is within the snap radius of any visible polyline/line vertex,
 * return that vertex's coordinates and id; otherwise return the original point.
 * Snap radius is converted from device px to image px via zoom.
 */
function snapToVertex(
  point: Point,
  shapes: BaseShape[],
  zoom: number,
): { point: Point; snapped: boolean; sourceShapeId?: string; vertexIndex?: number } {
  const r = VERTEX_SNAP_PIXELS / zoom;
  const r2 = r * r;
  let bestDist2 = Infinity;
  let bestPoint = point;
  let bestId: string | undefined;
  let bestIndex: number | undefined;
  for (const s of shapes) {
    if (!s.visible) continue;
    if (!SNAPPABLE_KINDS.has(s.type)) continue;
    for (let i = 0; i < s.points.length; i++) {
      const v = s.points[i];
      const dx = v.x - point.x;
      const dy = v.y - point.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 < bestDist2) {
        bestDist2 = d2;
        bestPoint = { x: v.x, y: v.y };
        bestId = s.id;
        bestIndex = i;
      }
    }
  }
  return bestPoint === point
    ? { point, snapped: false }
    : { point: bestPoint, snapped: true, sourceShapeId: bestId, vertexIndex: bestIndex };
}

// ─── Types ───

interface DrawingState {
  isDrawing: boolean;
  shapeId: string | null;
  startPoint: Point | null;
  currentPoints: Point[];
  /** Parallel to `currentPoints`. Tracks snap-source refs so the committed
   *  shape carries `pointRefs` for live-following. */
  currentRefs: (VertexRef | null)[];
  // For text
  textInputActive: boolean;
  textPosition: Point | null;
  // For multi-click measurement tools (angle=3 clicks, cobb=4 clicks)
  measurementClicks: Point[];
  /** Parallel to `measurementClicks`. */
  measurementClickRefs: (VertexRef | null)[];
}

interface UseDrawingToolsOptions {
  activeTool: ToolId;
  transform: ViewTransform;
  shapes: BaseShape[];
  currentStyle: ShapeStyle;
  /** Image dimensions in image-pixel space. Used to detect clicks on the dark
   *  margin outside the image, which finalize an in-progress line/polyline. */
  imageWidth: number;
  imageHeight: number;
  onAddShape: (shape: BaseShape) => void;
  onDeleteShapes: (ids: string[]) => void;
}

export interface PendingShape {
  shape: BaseShape;
  screenX: number;
  screenY: number;
}

/**
 * A line/polyline that just committed straight to canvas (skipping the
 * pending accept/reject UI). The canvas anchors a small undo button next
 * to its last vertex for ~3s — clicking the button removes the shape and
 * sticks the user back in the same tool, so they can redraw.
 */
export interface RecentCommit {
  shapeId: string;
  screenX: number;
  screenY: number;
  /** When the commit happened — used to expire the undo button after a delay. */
  ts: number;
}

interface UseDrawingToolsReturn {
  handlePointerDown: (e: React.PointerEvent, containerRect: DOMRect) => boolean;
  handlePointerMove: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleDoubleClick: (e: React.MouseEvent, containerRect: DOMRect) => void;
  handleKeyDown: (e: KeyboardEvent) => boolean;
  drawingShape: BaseShape | null;
  isDrawing: boolean;
  cancelDrawing: () => void;
  textInputState: { active: boolean; position: Point | null; shapeId: string | null };
  commitText: (text: string) => void;
  pendingShape: PendingShape | null;
  acceptPending: () => void;
  rejectPending: () => void;
  /** True while the polyline tool has at least one locked vertex placed. */
  polylineActive: boolean;
  /** Image-space position of the latest *locked* polyline vertex, or null. */
  polylineLastVertex: Point | null;
  /** Commit the in-progress polyline (drops the trailing ghost) and stay in the polyline tool. */
  commitPolyline: () => void;
  /** Remove the last locked polyline vertex; if it was the only one, cancel the draw. */
  popPolylineVertex: () => void;
  /**
   * Pop the last click of any in-progress draw (line, polyline, angle, cobb,
   * calibrate). Returns true if anything was popped — callers use this to
   * decide whether to fall through to global undo.
   */
  popLastDrawClick: () => boolean;
  /** Just-committed line/polyline that's currently showing the undo button. */
  recentCommit: RecentCommit | null;
  /** Dismiss the undo button without removing the shape. */
  dismissRecentCommit: () => void;
  /** Remove the just-committed shape and dismiss the undo button. */
  undoRecentCommit: () => void;
  /**
   * Image-space anchor for the *mid-draw* undo affordance, or null when no
   * click-tool draw is in progress. Click handler should call
   * `popLastDrawClick()` — pops vertex (polyline), pops measurement click
   * (angle/cobb), or cancels (line/calibrate which need 2 clicks).
   */
  inProgressUndoAnchor: Point | null;
  /** True when the in-progress draw is in a state that can be committed
   *  via `acceptInProgress()` — currently only polyline with ≥2 vertices.
   *  Drives whether the in-progress pill shows the green Accept icon. */
  canAcceptInProgress: boolean;
  /** Commit the in-progress draw as-is (only meaningful when
   *  `canAcceptInProgress` is true). */
  acceptInProgress: () => void;
  /** True iff there is any in-progress click-tool draw that has at least one click placed. */
  hasInProgressDraw: boolean;
}

const DRAWING_TOOLS: ToolId[] = [
  "point", "line", "polyline", "ruler", "arrow",
  "text", "angle", "cobb_angle", "calibrate",
];

function createInitialDrawingState(): DrawingState {
  return {
    isDrawing: false,
    shapeId: null,
    startPoint: null,
    currentPoints: [],
    currentRefs: [],
    textInputActive: false,
    textPosition: null,
    measurementClicks: [],
    measurementClickRefs: [],
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

function getNextZIndex(shapes: BaseShape[]): number {
  return shapes.length > 0 ? Math.max(...shapes.map((s) => s.zIndex)) + 1 : 1;
}

function createBaseShape(
  type: BaseShape["type"],
  style: ShapeStyle,
  zIndex: number
): BaseShape {
  return {
    id: generateId(),
    type,
    label: null,
    zIndex,
    visible: true,
    locked: false,
    style: { ...style },
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    points: [],
    text: null,
    fontSize: null,
    measurement: null,
  };
}

/**
 * Constrain a point relative to an origin to 0°/45°/90° angles.
 */
function constrainAngle(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const angle = Math.atan2(dy, dx);
  const distance = Math.hypot(dx, dy);

  // Snap to nearest 45° increment
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: origin.x + distance * Math.cos(snapped),
    y: origin.y + distance * Math.sin(snapped),
  };
}

import {
  computeRulerMeasurement,
  computeAngleMeasurement,
  computeCobbAngle,
  computeRectArea,
  computeEllipseArea,
  formatMeasurement,
} from "@/lib/measurements";

export function useDrawingTools({
  activeTool,
  transform,
  shapes,
  currentStyle,
  imageWidth,
  imageHeight,
  onAddShape,
  onDeleteShapes,
}: UseDrawingToolsOptions): UseDrawingToolsReturn {
  const stateRef = useRef<DrawingState>(createInitialDrawingState());
  const drawingShapeRef = useRef<BaseShape | null>(null);

  // Pending shape for confirmation UI (used by point/angle/cobb/calibrate)
  const [pendingShape, setPendingShapeState] = useState<PendingShape | null>(null);
  const pendingRef = useRef<PendingShape | null>(null);

  // Recently-committed line/polyline (skips pending → straight to canvas).
  // Drives the small "undo" button anchored near the last vertex.
  const [recentCommit, setRecentCommitState] = useState<RecentCommit | null>(null);
  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissRecentCommit = useCallback(() => {
    if (recentTimerRef.current) {
      clearTimeout(recentTimerRef.current);
      recentTimerRef.current = null;
    }
    setRecentCommitState(null);
  }, []);

  const undoRecentCommit = useCallback(() => {
    setRecentCommitState((prev) => {
      if (prev) onDeleteShapes([prev.shapeId]);
      return null;
    });
    if (recentTimerRef.current) {
      clearTimeout(recentTimerRef.current);
      recentTimerRef.current = null;
    }
  }, [onDeleteShapes]);

  // Clear the auto-hide timer if the hook unmounts mid-window so the
  // setTimeout doesn't fire on a stale setState.
  useEffect(() => {
    return () => {
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
    };
  }, []);

  // Force a re-render of the parent component (via this hook's state) so the
  // SVG layer reflects ref-only mutations like cancelDrawing or popLastDrawClick.
  // The parent doesn't see ref changes on its own — bumping `forceTick` causes
  // useDrawingTools to re-run and return the latest `drawingShapeRef.current`.
  const [, setForceTick] = useState(0);
  const bump = useCallback(() => setForceTick((n) => n + 1), []);

  /**
   * Commit a line or polyline directly to the canvas (no pending UI) and
   * surface the undo button anchored at the last-vertex screen position.
   * Auto-clears the undo button after 3s.
   */
  const commitDirectAndShowUndo = useCallback(
    (shape: BaseShape) => {
      onAddShape(shape);
      const last = shape.points[shape.points.length - 1] ?? { x: shape.x + shape.width, y: shape.y + shape.height };
      const screenX = last.x * transform.zoom + transform.panX;
      const screenY = last.y * transform.zoom + transform.panY;
      if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
      setRecentCommitState({ shapeId: shape.id, screenX, screenY, ts: Date.now() });
      recentTimerRef.current = setTimeout(() => {
        setRecentCommitState(null);
        recentTimerRef.current = null;
      }, 3000);
    },
    [onAddShape, transform.zoom, transform.panX, transform.panY]
  );

  const commitPending = useCallback(() => {
    const p = pendingRef.current;
    if (p) {
      onAddShape(p.shape);
      pendingRef.current = null;
      setPendingShapeState(null);
    }
  }, [onAddShape]);

  const acceptPending = useCallback(() => {
    commitPending();
  }, [commitPending]);

  const rejectPending = useCallback(() => {
    pendingRef.current = null;
    setPendingShapeState(null);
  }, []);

  /** Set a shape as pending confirmation. Computes screen position from shape midpoint. */
  const setPending = useCallback(
    (shape: BaseShape) => {
      let midX = shape.x + shape.width / 2;
      let midY = shape.y + shape.height;
      if (shape.points.length >= 2) {
        const allX = shape.points.map((p) => p.x);
        const allY = shape.points.map((p) => p.y);
        midX = (Math.min(...allX) + Math.max(...allX)) / 2;
        midY = Math.max(...allY);
      }
      const screenX = midX * transform.zoom + transform.panX;
      const screenY = midY * transform.zoom + transform.panY;
      const pending: PendingShape = { shape, screenX, screenY };
      pendingRef.current = pending;
      setPendingShapeState(pending);
    },
    [transform]
  );

  const isDrawingTool = DRAWING_TOOLS.includes(activeTool);

  const toImage = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): Point => {
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return screenToImage(screenX, screenY, transform);
    },
    [transform]
  );

  const cancelDrawing = useCallback(() => {
    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
  }, []);

  // Switching tools mid-draw should never leave a half-finished click-tool
  // shape on the canvas. Reset any in-progress draw whenever activeTool
  // changes — covers both toolbar clicks and keyboard shortcuts (M, L, A, …).
  // Pending shapes are left alone (they're already a valid commit awaiting
  // user accept/reject and shouldn't be silently discarded by a tool swap).
  const lastActiveToolRef = useRef(activeTool);
  if (lastActiveToolRef.current !== activeTool) {
    lastActiveToolRef.current = activeTool;
    if (stateRef.current.isDrawing) {
      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
    }
  }

  const buildPointShape = useCallback(
    (pos: Point): BaseShape => {
      const shape = createBaseShape("point", currentStyle, getNextZIndex(shapes));
      shape.points = [pos];
      shape.x = pos.x;
      shape.y = pos.y;
      shape.width = 0;
      shape.height = 0;
      return shape;
    },
    [currentStyle, shapes]
  );

  const buildArrowShape = useCallback(
    (start: Point, end: Point, id: string): BaseShape => {
      const shape = createBaseShape("arrow", currentStyle, getNextZIndex(shapes));
      shape.id = id;
      shape.points = [start, end];
      const bb = computeBoundingBox([start, end]);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.arrowEnd = true;
      shape.arrowSize = 12;
      shape.lineCap = "round";
      return shape;
    },
    [currentStyle, shapes]
  );

  const buildCalibrationShape = useCallback(
    (points: Point[], id: string, refs?: (VertexRef | null)[]): BaseShape => {
      // Calibration looks like a 2-point line in yellow with end ticks. The
      // final pixelsPerMm value is filled in after the user enters the mm length.
      const shape = createBaseShape("calibration", { ...currentStyle, strokeColor: "#FFCC00" }, getNextZIndex(shapes));
      shape.id = id;
      shape.points = points;
      if (refs && refs.some((r) => r != null)) {
        shape.pointRefs = refs.slice(0, points.length);
      }
      const bb = computeBoundingBox(points);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.showEndTicks = true;
      shape.tickLength = 8;
      shape.lineCap = "round";
      return shape;
    },
    [currentStyle, shapes]
  );

  const buildPolylineShape = useCallback(
    (points: Point[], id: string, refs?: (VertexRef | null)[]): BaseShape => {
      const shape = createBaseShape("polyline", currentStyle, getNextZIndex(shapes));
      shape.id = id;
      shape.points = points;
      if (refs && refs.some((r) => r != null)) {
        shape.pointRefs = refs.slice(0, points.length);
      }
      const bb = computeBoundingBox(points);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.closed = false;
      shape.lineCap = "round";
      return shape;
    },
    [currentStyle, shapes]
  );

  // Ruler is a 2-point distance measurement, distinct from a Line annotation:
  // it always uses the teal MEASUREMENT_STYLE, shows end ticks + a length
  // pill, and reports mm when the image is calibrated (px otherwise via
  // formatMeasurement). Snap-aware so users can ruler between two existing
  // landmarks without re-clicking.
  const buildRulerShape = useCallback(
    (points: Point[], id: string, refs?: (VertexRef | null)[]): BaseShape => {
      const shape = createBaseShape("ruler", MEASUREMENT_STYLE, getNextZIndex(shapes));
      shape.id = id;
      shape.points = points;
      if (refs && refs.some((r) => r != null)) {
        shape.pointRefs = refs.slice(0, points.length);
      }
      const bb = computeBoundingBox(points);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.showEndTicks = true;
      shape.tickLength = 8;
      shape.lineCap = "round";
      if (points.length >= 2) {
        const m = computeRulerMeasurement(points[0], points[1]);
        shape.measurement = {
          value: m.pixelLength,
          unit: "px",
          calibrated: false,
          label: m.label,
        };
      }
      return shape;
    },
    [shapes]
  );

  // ─── Pointer Down ───
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): boolean => {
      if (!isDrawingTool || e.button !== 0) return false;

      // Any new pointer-down means the user has moved on from the last commit;
      // hide the post-commit undo pill so it doesn't linger over fresh work.
      dismissRecentCommit();

      // Auto-accept any pending shape when starting a new drawing
      if (pendingRef.current) {
        commitPending();
      }

      const rawPos = toImage(e.clientX, e.clientY, containerRect);
      // Tools that take vertex inputs snap to existing polyline/line/point dots
      // so the user can reuse a numbered point as a measurement endpoint.
      // When a click snaps, capture {shapeId, vertexIndex} so the resulting
      // shape can follow the source vertex live (see resolveShapeRefs).
      const snapTools: ToolId[] = ["angle", "cobb_angle", "line", "polyline", "calibrate", "ruler"];
      const snapResult = snapTools.includes(activeTool)
        ? snapToVertex(rawPos, shapes, transform.zoom)
        : null;
      const imagePos = snapResult ? snapResult.point : rawPos;
      const clickRef: VertexRef | null =
        snapResult && snapResult.snapped && snapResult.sourceShapeId !== undefined && snapResult.vertexIndex !== undefined
          ? { shapeId: snapResult.sourceShapeId, vertexIndex: snapResult.vertexIndex }
          : null;
      const state = stateRef.current;

      // Click on the dark margin outside the image acts like the Done button:
      // for in-progress polylines, commit if valid; for lines/angles/cobbs with
      // an incomplete sequence, cancel. Lets the user finalize without aiming
      // at the floating Done button.
      const outsideImage =
        rawPos.x < 0 || rawPos.x > imageWidth || rawPos.y < 0 || rawPos.y > imageHeight;
      if (outsideImage && state.isDrawing && state.shapeId) {
        if (activeTool === "polyline") {
          // Mirror commitPolyline: drop the trailing ghost, commit if ≥2 real vertices.
          const real = state.currentPoints.slice(0, -1);
          const realRefs = state.currentRefs.slice(0, -1);
          if (real.length >= 2) {
            const shape = buildPolylineShape(real, state.shapeId, realRefs);
            commitDirectAndShowUndo({ ...shape });
          }
          stateRef.current = createInitialDrawingState();
          drawingShapeRef.current = null;
          return true;
        }
        if (
          activeTool === "line" ||
          activeTool === "ruler" ||
          activeTool === "angle" ||
          activeTool === "cobb_angle" ||
          activeTool === "calibrate"
        ) {
          // Sequence incomplete — discard the in-progress shape.
          stateRef.current = createInitialDrawingState();
          drawingShapeRef.current = null;
          return true;
        }
      }
      // For everything else, an outside-image click is a no-op so the parent
      // can fall back to pan/select behavior.
      if (outsideImage) return false;

      // ─── Point: single-click commit ───
      if (activeTool === "point") {
        const shape = buildPointShape(imagePos);
        setPending({ ...shape });
        return true;
      }

      // ─── Text ───
      if (activeTool === "text") {
        state.textInputActive = true;
        state.textPosition = imagePos;
        state.shapeId = generateId();
        return true;
      }

      // ─── Angle (3-click placement) ───
      if (activeTool === "angle") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.measurementClicks = [imagePos];
          state.measurementClickRefs = [clickRef];
          updateAnglePreview(imagePos);
          return true;
        }
        state.measurementClicks.push(imagePos);
        state.measurementClickRefs.push(clickRef);
        if (state.measurementClicks.length >= 3) {
          commitAngle();
          return true;
        }
        updateAnglePreview(imagePos);
        return true;
      }

      // ─── Cobb Angle (4-click placement) ───
      if (activeTool === "cobb_angle") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.measurementClicks = [imagePos];
          state.measurementClickRefs = [clickRef];
          updateCobbPreview(imagePos);
          return true;
        }
        state.measurementClicks.push(imagePos);
        state.measurementClickRefs.push(clickRef);
        if (state.measurementClicks.length >= 4) {
          commitCobb();
          return true;
        }
        updateCobbPreview(imagePos);
        return true;
      }

      // ─── Polyline (multi-click placement; double-click / Enter / Esc to finish) ───
      if (activeTool === "polyline") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          // [v1, ghost] + [refV1, ghostRef=clickRef-of-current-pos]
          state.currentPoints = [imagePos, imagePos];
          state.currentRefs = [clickRef, clickRef];
          drawingShapeRef.current = buildPolylineShape(state.currentPoints, state.shapeId, state.currentRefs);
        } else {
          // Lock the current ghost as a real vertex and append a new ghost.
          const lockedPts = state.currentPoints.slice(0, -1);
          const lockedRefs = state.currentRefs.slice(0, -1);
          state.currentPoints = [...lockedPts, imagePos, imagePos];
          state.currentRefs = [...lockedRefs, clickRef, clickRef];
          drawingShapeRef.current = buildPolylineShape(state.currentPoints, state.shapeId!, state.currentRefs);
        }
        return true;
      }

      // ─── Line: 2-click placement (click 1 → vertex + ghost; click 2 → commit). ───
      if (activeTool === "line") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.currentPoints = [imagePos, imagePos]; // [v1, ghost]
          state.currentRefs = [clickRef, clickRef];
          drawingShapeRef.current = buildPolylineShape(state.currentPoints, state.shapeId, state.currentRefs);
          return true;
        }
        // Second click → final endpoint → commit straight to canvas (no
        // accept/reject pending). The undo button anchors next to the final
        // vertex for ~3s in case the user wants to back out.
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        const finalShape = buildPolylineShape([v1, imagePos], state.shapeId!, [v1Ref, clickRef]);
        commitDirectAndShowUndo({ ...finalShape });
        stateRef.current = createInitialDrawingState();
        drawingShapeRef.current = null;
        return true;
      }

      // ─── Ruler: 2-click distance measurement (snap-aware on both clicks). ───
      // Like Line, but creates a "ruler" shape with measurement style + end
      // ticks + a length pill (px or mm depending on calibration).
      if (activeTool === "ruler") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.currentPoints = [imagePos, imagePos];
          state.currentRefs = [clickRef, clickRef];
          drawingShapeRef.current = buildRulerShape(state.currentPoints, state.shapeId, state.currentRefs);
          return true;
        }
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        const finalShape = buildRulerShape([v1, imagePos], state.shapeId!, [v1Ref, clickRef]);
        commitDirectAndShowUndo({ ...finalShape });
        stateRef.current = createInitialDrawingState();
        drawingShapeRef.current = null;
        return true;
      }

      // ─── Calibrate: 2-click placement (click 1 → vertex + ghost; click 2 → opens dialog). ───
      if (activeTool === "calibrate") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.currentPoints = [imagePos, imagePos];
          state.currentRefs = [clickRef, clickRef];
          drawingShapeRef.current = buildCalibrationShape(state.currentPoints, state.shapeId, state.currentRefs);
          return true;
        }
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        const finalShape = buildCalibrationShape([v1, imagePos], state.shapeId!, [v1Ref, clickRef]);
        // Calibration commits silently — the parent surfaces a dialog using
        // pendingShape detection; on accept the shape's pixelsPerMm gets stored.
        setPending({ ...finalShape });
        stateRef.current = createInitialDrawingState();
        drawingShapeRef.current = null;
        return true;
      }

      // ─── Drag-based tools (arrow only). ───
      state.isDrawing = true;
      state.startPoint = imagePos;
      state.shapeId = generateId();

      if (activeTool === "arrow") {
        const preview = buildArrowShape(imagePos, imagePos, state.shapeId);
        drawingShapeRef.current = preview;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return true;
      }

      return false;
    },
    [
      isDrawingTool,
      activeTool,
      toImage,
      imageWidth,
      imageHeight,
      shapes,
      transform.zoom,
      buildPolylineShape,
      buildRulerShape,
      buildCalibrationShape,
      buildPointShape,
      buildArrowShape,
      setPending,
      commitPending,
      commitDirectAndShowUndo,
    ]
  );

  // ─── Pointer Move ───
  const handlePointerMove = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): void => {
      if (!isDrawingTool) return;

      const rawPos = toImage(e.clientX, e.clientY, containerRect);
      // Snap measurement-vertex tools to existing polyline/line/point dots so
      // the user can reuse a numbered point as a measurement endpoint.
      const snapTools: ToolId[] = ["angle", "cobb_angle", "line", "polyline", "calibrate", "ruler"];
      const snapResult = snapTools.includes(activeTool)
        ? snapToVertex(rawPos, shapes, transform.zoom)
        : null;
      const imagePos = snapResult ? snapResult.point : rawPos;
      // Ghost ref tracks the cursor's currently-snapped vertex (or null when free)
      // so if the user clicks-to-commit while still snapped, the lock-in inherits
      // a live ref. Lines/rulers/calibrate also inherit ghost refs into their final point.
      const ghostRef: VertexRef | null =
        snapResult && snapResult.snapped && snapResult.sourceShapeId !== undefined && snapResult.vertexIndex !== undefined
          ? { shapeId: snapResult.sourceShapeId, vertexIndex: snapResult.vertexIndex }
          : null;
      const state = stateRef.current;

      // Angle preview cursor
      if (activeTool === "angle" && state.isDrawing) {
        updateAnglePreview(imagePos);
        return;
      }

      // Cobb preview cursor
      if (activeTool === "cobb_angle" && state.isDrawing) {
        updateCobbPreview(imagePos);
        return;
      }

      // Polyline: ghost endpoint follows cursor
      if (activeTool === "polyline" && state.isDrawing && state.shapeId) {
        const next = [...state.currentPoints];
        next[next.length - 1] = imagePos;
        state.currentPoints = next;
        const nextRefs = [...state.currentRefs];
        nextRefs[nextRefs.length - 1] = ghostRef;
        state.currentRefs = nextRefs;
        drawingShapeRef.current = buildPolylineShape(next, state.shapeId, nextRefs);
        return;
      }

      // Line: ghost endpoint follows cursor between click 1 and click 2
      if (activeTool === "line" && state.isDrawing && state.shapeId) {
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        let v2 = imagePos;
        if (e.shiftKey) v2 = constrainAngle(v1, imagePos);
        // When user holds shift to constrain, the ghost is no longer truly snapped —
        // but the visual position is offset, so we drop the ghost ref to be safe.
        const v2Ref = e.shiftKey ? null : ghostRef;
        state.currentPoints = [v1, v2];
        state.currentRefs = [v1Ref, v2Ref];
        drawingShapeRef.current = buildPolylineShape([v1, v2], state.shapeId, [v1Ref, v2Ref]);
        return;
      }

      // Calibrate: ghost endpoint follows cursor between click 1 and click 2
      if (activeTool === "calibrate" && state.isDrawing && state.shapeId) {
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        let v2 = imagePos;
        if (e.shiftKey) v2 = constrainAngle(v1, imagePos);
        const v2Ref = e.shiftKey ? null : ghostRef;
        state.currentPoints = [v1, v2];
        state.currentRefs = [v1Ref, v2Ref];
        drawingShapeRef.current = buildCalibrationShape([v1, v2], state.shapeId, [v1Ref, v2Ref]);
        return;
      }

      // Ruler: ghost endpoint follows cursor between click 1 and click 2
      if (activeTool === "ruler" && state.isDrawing && state.shapeId) {
        const v1 = state.currentPoints[0];
        const v1Ref = state.currentRefs[0] ?? null;
        let v2 = imagePos;
        if (e.shiftKey) v2 = constrainAngle(v1, imagePos);
        const v2Ref = e.shiftKey ? null : ghostRef;
        state.currentPoints = [v1, v2];
        state.currentRefs = [v1Ref, v2Ref];
        drawingShapeRef.current = buildRulerShape([v1, v2], state.shapeId, [v1Ref, v2Ref]);
        return;
      }

      if (!state.isDrawing || !state.startPoint) return;

      // Arrow drag — Shift = constrain to 45° increments
      if (activeTool === "arrow") {
        let endPoint = imagePos;
        if (e.shiftKey) endPoint = constrainAngle(state.startPoint, imagePos);
        drawingShapeRef.current = buildArrowShape(state.startPoint, endPoint, state.shapeId!);
        return;
      }
    },
    [
      isDrawingTool,
      activeTool,
      toImage,
      shapes,
      transform.zoom,
      buildPolylineShape,
      buildRulerShape,
      buildArrowShape,
      buildCalibrationShape,
    ]
  );

  // ─── Pointer Up ───
  const handlePointerUp = useCallback(
    (e: React.PointerEvent): void => {
      const state = stateRef.current;

      // Click-to-place tools (point, text, angle, cobb_angle, polyline, line,
      // calibrate) all commit/advance state on pointerdown — pointerup is a no-op.
      if (
        activeTool === "point" ||
        activeTool === "text" ||
        activeTool === "angle" ||
        activeTool === "cobb_angle" ||
        activeTool === "polyline" ||
        activeTool === "line" ||
        activeTool === "ruler" ||
        activeTool === "calibrate"
      ) {
        return;
      }

      if (!state.isDrawing || !drawingShapeRef.current) return;

      const shape = drawingShapeRef.current;

      // Arrow validation
      let valid = true;
      if (activeTool === "arrow") {
        if (shape.points.length >= 2) {
          const dist = Math.hypot(
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y,
          );
          valid = dist >= MIN_LINE_LENGTH;
        } else {
          valid = false;
        }
      }

      if (valid) {
        setPending({ ...shape });
      }

      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may not be active for click-style tools.
      }
    },
    [activeTool, setPending]
  );

  // Finalize an in-progress polyline. Drops the trailing ghost endpoint and
  // commits straight to canvas if the chain has at least two real vertices.
  // No accept/reject pending — the undo button at the last vertex serves as
  // the back-out affordance.
  const commitPolyline = useCallback(() => {
    const state = stateRef.current;
    if (activeTool !== "polyline" || !state.isDrawing || !state.shapeId) return;
    const real = state.currentPoints.slice(0, -1); // drop ghost
    const realRefs = state.currentRefs.slice(0, -1);
    if (real.length >= 2) {
      const shape = buildPolylineShape(real, state.shapeId, realRefs);
      commitDirectAndShowUndo({ ...shape });
    }
    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
  }, [activeTool, buildPolylineShape, commitDirectAndShowUndo]);

  // Pop the last *locked* polyline vertex. If only one locked vertex remains,
  // cancel the in-progress draw entirely. Used by Cmd+Z and Backspace during draw.
  const popPolylineVertex = useCallback(() => {
    const state = stateRef.current;
    if (activeTool !== "polyline" || !state.isDrawing || !state.shapeId) return;
    // currentPoints layout: [v1, v2, ..., vN, ghost]
    // Locked count = currentPoints.length - 1.
    if (state.currentPoints.length <= 2) {
      // Only one locked vertex (or fewer) — cancelling the draw entirely.
      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
      return;
    }
    const lockedPts = state.currentPoints.slice(0, -2);
    const lockedRefs = state.currentRefs.slice(0, -2);
    const ghost = state.currentPoints[state.currentPoints.length - 1];
    const ghostRef = state.currentRefs[state.currentRefs.length - 1] ?? null;
    state.currentPoints = [...lockedPts, ghost];
    state.currentRefs = [...lockedRefs, ghostRef];
    drawingShapeRef.current = buildPolylineShape(state.currentPoints, state.shapeId, state.currentRefs);
  }, [activeTool, buildPolylineShape]);

  // ─── Double Click ───
  const handleDoubleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_e: React.MouseEvent, _containerRect: DOMRect): void => {
      if (activeTool === "polyline") {
        commitPolyline();
      }
    },
    [activeTool, commitPolyline]
  );

  // ─── Pop the last click of an in-progress draw ───
  //
  // Tool-aware: polyline pops a vertex, angle/cobb pop a measurement click,
  // line/calibrate pop the single click (which cancels the draw since both
  // require 2 clicks). Returns true when something was popped, so callers can
  // skip a global undo. Used by Backspace and by Cmd+Z mid-draw.
  const popLastDrawClick = useCallback((): boolean => {
    const state = stateRef.current;
    if (!state.isDrawing) return false;

    if (activeTool === "polyline" && state.shapeId) {
      // [v1, v2, ..., vN, ghost] — popping vN drops to [v1, ..., v(N-1), ghost].
      // If only one locked vertex remains, cancel the draw entirely.
      if (state.currentPoints.length <= 2) {
        stateRef.current = createInitialDrawingState();
        drawingShapeRef.current = null;
        return true;
      }
      const nextPts = [
        ...state.currentPoints.slice(0, -2),
        state.currentPoints[state.currentPoints.length - 1],
      ];
      const nextRefs = [
        ...state.currentRefs.slice(0, -2),
        state.currentRefs[state.currentRefs.length - 1] ?? null,
      ];
      state.currentPoints = nextPts;
      state.currentRefs = nextRefs;
      drawingShapeRef.current = buildPolylineShape(nextPts, state.shapeId, nextRefs);
      return true;
    }

    if ((activeTool === "angle" || activeTool === "cobb_angle") && state.measurementClicks.length >= 1) {
      if (state.measurementClicks.length === 1) {
        cancelDrawing();
        return true;
      }
      state.measurementClicks.pop();
      state.measurementClickRefs.pop();
      return true;
    }

    if ((activeTool === "line" || activeTool === "calibrate" || activeTool === "ruler") && state.currentPoints.length >= 2) {
      // Line/ruler/calibrate currently sit at [v1, ghost] after click 1 — pop = cancel.
      cancelDrawing();
      return true;
    }

    return false;
  }, [activeTool, buildPolylineShape, cancelDrawing]);

  // ─── Mount-only window keydown listener for Esc / Enter ───
  //
  // Latest onAddShape captured in a ref so the mount-only listener below
  // never goes stale. (Prop value can change every render.)
  const onAddShapeRef = useRef(onAddShape);
  onAddShapeRef.current = onAddShape;

  // Mount-only window keydown listener — registered ONCE on mount and never
  // removed until unmount. Reads from refs only, so it always sees fresh
  // state. Critical: deps are [] intentionally. With changing deps, the
  // effect's cleanup ran mid-event-propagation under React 19's concurrent
  // commit, removing the listener AFTER document-bubble but BEFORE window-
  // bubble. With deps=[], the listener is bound once and stays bound, so
  // window-bubble Esc reliably reaches it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) return;

      // Most key presses mean the user has moved on — dismiss the post-commit
      // undo pill. Skip modifier keys so a bare Shift/Ctrl tap doesn't kill it.
      if (
        recentTimerRef.current &&
        e.key !== "Shift" &&
        e.key !== "Control" &&
        e.key !== "Meta" &&
        e.key !== "Alt"
      ) {
        if (recentTimerRef.current) clearTimeout(recentTimerRef.current);
        recentTimerRef.current = null;
        setRecentCommitState(null);
      }

      let handled = false;
      if (pendingRef.current) {
        if (e.key === "Escape" || e.key.toLowerCase() === "n") {
          e.preventDefault();
          pendingRef.current = null;
          setPendingShapeState(null);
          handled = true;
        } else if (e.key === "Enter" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          const p = pendingRef.current;
          if (p) {
            onAddShapeRef.current(p.shape);
            pendingRef.current = null;
            setPendingShapeState(null);
          }
          handled = true;
        }
      } else if (stateRef.current.isDrawing && e.key === "Escape") {
        stateRef.current = createInitialDrawingState();
        drawingShapeRef.current = null;
        handled = true;
      }
      if (handled) bump();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Key Down ───
  //
  // All keyboard interactions for in-progress / pending state live here so they
  // read directly from refs (always fresh) rather than React state captured in
  // the parent's keydown effect closure (potentially stale under concurrent
  // rendering). The parent just delegates to this and bumps a render tick.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const state = stateRef.current;

      // Pending shape (post-commit confirmation): Esc/N rejects, Enter/Y accepts.
      // Read from ref so we don't miss a pending that was just set this tick.
      if (pendingRef.current) {
        if (e.key === "Enter" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          commitPending();
          return true;
        }
        if (e.key === "Escape" || e.key.toLowerCase() === "n") {
          e.preventDefault();
          pendingRef.current = null;
          setPendingShapeState(null);
          return true;
        }
      }

      // Universal Esc — cancels any in-progress draw, regardless of tool.
      if (e.key === "Escape" && state.isDrawing) {
        cancelDrawing();
        return true;
      }

      // Polyline Enter commits the chain
      if (activeTool === "polyline" && state.isDrawing && e.key === "Enter") {
        commitPolyline();
        return true;
      }

      // Backspace pops the last click for click-based tools (mirror Cmd+Z)
      if (e.key === "Backspace" && state.isDrawing) {
        if (popLastDrawClick()) return true;
      }

      return false;
    },
    [activeTool, cancelDrawing, commitPending, commitPolyline, popLastDrawClick]
  );

  // ─── Angle Helpers ───
  function updateAnglePreview(cursorPos: Point) {
    const state = stateRef.current;
    if (state.measurementClicks.length === 0) return;
    const allPoints = [...state.measurementClicks, cursorPos];
    const shape = createBaseShape("angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = allPoints;
    shape.arcRadius = 30;
    shape.showSupplementary = false;
    const bb = computeBoundingBox(allPoints);
    shape.x = bb.x; shape.y = bb.y; shape.width = bb.width; shape.height = bb.height;
    if (allPoints.length >= 3) {
      const m = computeAngleMeasurement(allPoints[0], allPoints[1], allPoints[2]);
      shape.measurement = { value: m.degrees, unit: "deg", calibrated: false, label: m.label };
    }
    drawingShapeRef.current = shape;
  }

  function commitAngle() {
    const state = stateRef.current;
    if (state.measurementClicks.length < 3) { cancelDrawing(); return; }
    const pts = state.measurementClicks;
    const refs = state.measurementClickRefs.slice(0, pts.length);
    const shape = createBaseShape("angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...pts];
    if (refs.some((r) => r != null)) shape.pointRefs = refs;
    shape.arcRadius = 30;
    shape.showSupplementary = false;
    const bb = computeBoundingBox(pts);
    shape.x = bb.x; shape.y = bb.y; shape.width = bb.width; shape.height = bb.height;
    const m = computeAngleMeasurement(pts[0], pts[1], pts[2]);
    shape.measurement = { value: m.degrees, unit: "deg", calibrated: false, label: m.label };
    setPending(shape);
    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
  }

  // ─── Cobb Angle Helpers ───
  function updateCobbPreview(cursorPos: Point) {
    const state = stateRef.current;
    if (state.measurementClicks.length === 0) return;
    const allPoints = [...state.measurementClicks, cursorPos];
    const shape = createBaseShape("cobb_angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = allPoints;
    shape.showPerpendiculars = true;
    shape.showClassification = true;
    const bb = computeBoundingBox(allPoints);
    shape.x = bb.x; shape.y = bb.y; shape.width = bb.width; shape.height = bb.height;
    if (allPoints.length >= 4) {
      const cobb = computeCobbAngle(allPoints[0], allPoints[1], allPoints[2], allPoints[3]);
      shape.line1 = [allPoints[0].x, allPoints[0].y, allPoints[1].x, allPoints[1].y];
      shape.line2 = [allPoints[2].x, allPoints[2].y, allPoints[3].x, allPoints[3].y];
      shape.perpendicular1 = cobb.perp1;
      shape.perpendicular2 = cobb.perp2;
      shape.intersection = cobb.intersection;
      shape.cobbClassification = cobb.classification;
      shape.measurement = { value: cobb.degrees, unit: "deg", calibrated: false, label: `${cobb.degrees.toFixed(1)}° — ${cobb.classification}` };
    }
    drawingShapeRef.current = shape;
  }

  function commitCobb() {
    const state = stateRef.current;
    if (state.measurementClicks.length < 4) { cancelDrawing(); return; }
    const pts = state.measurementClicks;
    const refs = state.measurementClickRefs.slice(0, pts.length);
    const shape = createBaseShape("cobb_angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...pts];
    if (refs.some((r) => r != null)) shape.pointRefs = refs;
    shape.showPerpendiculars = true;
    shape.showClassification = true;
    const bb = computeBoundingBox(pts);
    shape.x = bb.x; shape.y = bb.y; shape.width = bb.width; shape.height = bb.height;
    const cobb = computeCobbAngle(pts[0], pts[1], pts[2], pts[3]);
    shape.line1 = [pts[0].x, pts[0].y, pts[1].x, pts[1].y];
    shape.line2 = [pts[2].x, pts[2].y, pts[3].x, pts[3].y];
    shape.perpendicular1 = cobb.perp1;
    shape.perpendicular2 = cobb.perp2;
    shape.intersection = cobb.intersection;
    shape.cobbClassification = cobb.classification;
    shape.measurement = { value: cobb.degrees, unit: "deg", calibrated: false, label: `${cobb.degrees.toFixed(1)}° — ${cobb.classification}` };
    setPending(shape);
    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
  }

  // ─── Text commit ───
  const commitText = useCallback(
    (text: string) => {
      const state = stateRef.current;
      if (!text.trim() || !state.textPosition) {
        stateRef.current = createInitialDrawingState();
        return;
      }
      const shape = createBaseShape("text", currentStyle, getNextZIndex(shapes));
      shape.id = state.shapeId ?? generateId();
      shape.text = text;
      shape.fontSize = 16;
      shape.fontFamily = "Inter, system-ui, sans-serif";
      shape.fontWeight = 400;
      shape.fontStyle = "normal";
      shape.textAlign = "left";
      shape.textPadding = 4;
      shape.textBackground = null;
      shape.x = state.textPosition.x;
      shape.y = state.textPosition.y;
      shape.style.strokeColor = "#FFFFFF";
      shape.width = Math.max(text.length * 10, 40);
      shape.height = 24;
      onAddShape(shape);

      stateRef.current = createInitialDrawingState();
    },
    [currentStyle, shapes, onAddShape]
  );

  // Polyline draw state derived for the parent component (Done button anchor + active flag).
  const polylineActive =
    activeTool === "polyline" &&
    stateRef.current.isDrawing &&
    stateRef.current.currentPoints.length >= 2;
  const polylineLastVertex: Point | null = polylineActive
    ? // Last locked vertex sits at currentPoints.length - 2 (the final entry is the ghost).
      stateRef.current.currentPoints[stateRef.current.currentPoints.length - 2] ?? null
    : null;

  // Anchor (image-space) for the mid-draw undo affordance:
  //   - line / calibrate: v1 (the only placed vertex). Click undo = cancel.
  //   - polyline: last locked vertex. Click undo = pop that vertex (or cancel
  //     if it was the only one).
  //   - angle / cobb: last placed measurement click. Click undo = pop click.
  // Returns null when no in-progress click-tool draw is active.
  let inProgressUndoAnchor: Point | null = null;
  // Whether the in-progress draw is in a state that can be Accepted (committed
  // as-is without further clicks). Polyline can be committed once it has ≥2
  // locked vertices via commitPolyline; line/ruler/calibrate need exactly 2
  // clicks to be valid (after click 1 they're not yet committable); angle/
  // cobb auto-commit on their final click via setPending so this flag stays
  // false for them.
  let canAcceptInProgress = false;
  if (stateRef.current.isDrawing) {
    if ((activeTool === "line" || activeTool === "calibrate" || activeTool === "ruler") && stateRef.current.currentPoints.length >= 1) {
      inProgressUndoAnchor = stateRef.current.currentPoints[0] ?? null;
    } else if (activeTool === "polyline" && stateRef.current.currentPoints.length >= 2) {
      inProgressUndoAnchor = stateRef.current.currentPoints[stateRef.current.currentPoints.length - 2] ?? null;
      // Polyline needs ≥2 locked vertices to commit. currentPoints layout is
      // [v1, v2, ..., vN, ghost] so locked = currentPoints.length - 1.
      canAcceptInProgress = stateRef.current.currentPoints.length - 1 >= 2;
    } else if ((activeTool === "angle" || activeTool === "cobb_angle") && stateRef.current.measurementClicks.length >= 1) {
      inProgressUndoAnchor = stateRef.current.measurementClicks[stateRef.current.measurementClicks.length - 1] ?? null;
    }
  }

  // Accept the in-progress draw — only meaningful for polyline (commits the
  // chain). Other tools either auto-commit on their final click (line/ruler/
  // calibrate, angle, cobb) or have no committable mid-state.
  const acceptInProgress = useCallback(() => {
    if (activeTool === "polyline") commitPolyline();
  }, [activeTool, commitPolyline]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleKeyDown,
    drawingShape: drawingShapeRef.current,
    isDrawing: stateRef.current.isDrawing || stateRef.current.textInputActive,
    cancelDrawing,
    textInputState: {
      active: stateRef.current.textInputActive,
      position: stateRef.current.textPosition,
      shapeId: stateRef.current.shapeId,
    },
    commitText,
    pendingShape,
    acceptPending,
    rejectPending,
    polylineActive,
    polylineLastVertex,
    commitPolyline,
    popPolylineVertex,
    popLastDrawClick,
    hasInProgressDraw: stateRef.current.isDrawing,
    recentCommit,
    dismissRecentCommit,
    undoRecentCommit,
    inProgressUndoAnchor,
    canAcceptInProgress,
    acceptInProgress,
  };
}

// ─── Eraser Hit Test ───

function hitTestEraser(
  imagePos: Point,
  shapes: BaseShape[],
  zoom: number
): BaseShape | null {
  const radius = ERASER_RADIUS / zoom;
  const sorted = [...shapes]
    .filter((s) => s.visible && !s.locked)
    .sort((a, b) => b.zIndex - a.zIndex);

  for (const shape of sorted) {
    if (
      imagePos.x >= shape.x - radius &&
      imagePos.x <= shape.x + shape.width + radius &&
      imagePos.y >= shape.y - radius &&
      imagePos.y <= shape.y + shape.height + radius
    ) {
      // For line-based shapes, check distance to line segments
      if (
        shape.type === "line" ||
        shape.type === "freehand" ||
        shape.type === "ruler"
      ) {
        for (let i = 0; i < shape.points.length - 1; i++) {
          const dist = pointToSegmentDistance(
            imagePos,
            shape.points[i],
            shape.points[i + 1]
          );
          if (dist <= radius) return shape;
        }
      } else {
        // Bounding box hit for text
        return shape;
      }
    }
  }
  return null;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

"use client";

import { useCallback, useRef, useState } from "react";
import type {
  BaseShape,
  Point,
  ShapeStyle,
  ToolId,
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

// ─── Types ───

interface DrawingState {
  isDrawing: boolean;
  shapeId: string | null;
  startPoint: Point | null;
  currentPoints: Point[];
  // For text
  textInputActive: boolean;
  textPosition: Point | null;
  // For multi-click measurement tools (angle=3 clicks, cobb=4 clicks)
  measurementClicks: Point[];
}

interface UseDrawingToolsOptions {
  activeTool: ToolId;
  transform: ViewTransform;
  shapes: BaseShape[];
  currentStyle: ShapeStyle;
  onAddShape: (shape: BaseShape) => void;
  onDeleteShapes: (ids: string[]) => void;
}

export interface PendingShape {
  shape: BaseShape;
  screenX: number;
  screenY: number;
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
}

const DRAWING_TOOLS: ToolId[] = [
  "line", "freehand", "text", "eraser",
  "ruler", "angle", "cobb_angle",
];

function createInitialDrawingState(): DrawingState {
  return {
    isDrawing: false,
    shapeId: null,
    startPoint: null,
    currentPoints: [],
    textInputActive: false,
    textPosition: null,
    measurementClicks: [],
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
  formatMeasurement,
} from "@/lib/measurements";

export function useDrawingTools({
  activeTool,
  transform,
  shapes,
  currentStyle,
  onAddShape,
  onDeleteShapes,
}: UseDrawingToolsOptions): UseDrawingToolsReturn {
  const stateRef = useRef<DrawingState>(createInitialDrawingState());
  const drawingShapeRef = useRef<BaseShape | null>(null);

  // Pending shape for confirmation UI
  const [pendingShape, setPendingShapeState] = useState<PendingShape | null>(null);
  const pendingRef = useRef<PendingShape | null>(null);

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

  const buildLineShape = useCallback(
    (start: Point, end: Point): BaseShape => {
      const shape = createBaseShape("line", currentStyle, getNextZIndex(shapes));
      shape.points = [start, end];
      const bb = computeBoundingBox([start, end]);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.lineCap = "round";
      return shape;
    },
    [currentStyle, shapes]
  );

  // ─── Pointer Down ───
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): boolean => {
      if (!isDrawingTool || e.button !== 0) return false;

      // Auto-accept any pending shape when starting a new drawing
      if (pendingRef.current) {
        commitPending();
      }

      const imagePos = toImage(e.clientX, e.clientY, containerRect);
      const state = stateRef.current;

      // ─── Eraser ───
      if (activeTool === "eraser") {
        const hit = hitTestEraser(imagePos, shapes, transform.zoom);
        if (hit) {
          onDeleteShapes([hit.id]);
        }
        state.isDrawing = true;
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
          updateAnglePreview(imagePos);
          return true;
        }
        state.measurementClicks.push(imagePos);
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
          updateCobbPreview(imagePos);
          return true;
        }
        state.measurementClicks.push(imagePos);
        if (state.measurementClicks.length >= 4) {
          commitCobb();
          return true;
        }
        updateCobbPreview(imagePos);
        return true;
      }

      // ─── Drag-based tools (line, freehand, ruler) ───
      state.isDrawing = true;
      state.startPoint = imagePos;
      state.shapeId = generateId();

      if (activeTool === "freehand") {
        state.currentPoints = [imagePos];
      }

      // Create preview shape
      const zIndex = getNextZIndex(shapes);
      let preview: BaseShape;
      if (activeTool === "freehand") {
        preview = createBaseShape("freehand", currentStyle, zIndex);
        preview.id = state.shapeId;
        preview.points = [imagePos];
        preview.tension = 0.3;
      } else if (activeTool === "line") {
        preview = buildLineShape(imagePos, imagePos);
        preview.id = state.shapeId;
      } else if (activeTool === "ruler") {
        preview = createBaseShape("ruler", MEASUREMENT_STYLE, zIndex);
        preview.id = state.shapeId;
        preview.points = [imagePos, imagePos];
        preview.showEndTicks = true;
        preview.tickLength = 8;
        preview.labelPosition = "auto";
        preview.lineCap = "round";
        const bb = computeBoundingBox([imagePos, imagePos]);
        preview.x = bb.x; preview.y = bb.y; preview.width = bb.width; preview.height = bb.height;
      } else {
        return false;
      }

      drawingShapeRef.current = preview;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return true;
    },
    [
      isDrawingTool,
      activeTool,
      toImage,
      shapes,
      transform.zoom,
      currentStyle,
      onDeleteShapes,
      buildLineShape,
      commitPending,
    ]
  );

  // ─── Pointer Move ───
  const handlePointerMove = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): void => {
      if (!isDrawingTool) return;

      const imagePos = toImage(e.clientX, e.clientY, containerRect);
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

      // Eraser drag
      if (activeTool === "eraser" && state.isDrawing) {
        const hit = hitTestEraser(imagePos, shapes, transform.zoom);
        if (hit) {
          onDeleteShapes([hit.id]);
        }
        return;
      }

      if (!state.isDrawing || !state.startPoint) return;

      let endPoint = imagePos;

      // Freehand
      if (activeTool === "freehand") {
        state.currentPoints.push(imagePos);
        const preview = drawingShapeRef.current;
        if (preview) {
          preview.points = [...state.currentPoints];
          const bb = computeBoundingBox(preview.points);
          preview.x = bb.x;
          preview.y = bb.y;
          preview.width = bb.width;
          preview.height = bb.height;
          drawingShapeRef.current = { ...preview };
        }
        return;
      }

      // Apply modifiers
      if (activeTool === "line") {
        if (e.shiftKey) {
          endPoint = constrainAngle(state.startPoint, imagePos);
        }
        const preview = buildLineShape(state.startPoint, endPoint);
        preview.id = state.shapeId!;
        drawingShapeRef.current = preview;
        return;
      }

      // Ruler (drag-based)
      if (activeTool === "ruler") {
        if (e.shiftKey) {
          endPoint = constrainAngle(state.startPoint, imagePos);
        }
        const preview = createBaseShape("ruler", MEASUREMENT_STYLE, getNextZIndex(shapes));
        preview.id = state.shapeId!;
        preview.points = [state.startPoint, endPoint];
        preview.showEndTicks = true;
        preview.tickLength = 8;
        preview.labelPosition = "auto";
        preview.lineCap = "round";
        const bb = computeBoundingBox([state.startPoint, endPoint]);
        preview.x = bb.x; preview.y = bb.y; preview.width = bb.width; preview.height = bb.height;
        const m = computeRulerMeasurement(state.startPoint, endPoint);
        const label = formatMeasurement(m.pixelLength, m.unit, null);
        preview.measurement = { value: m.pixelLength, unit: m.unit, calibrated: false, label };
        drawingShapeRef.current = preview;
        return;
      }
    },
    [
      isDrawingTool,
      activeTool,
      toImage,
      shapes,
      transform.zoom,
      onDeleteShapes,
      buildLineShape,
    ]
  );

  // ─── Pointer Up ───
  const handlePointerUp = useCallback(
    (e: React.PointerEvent): void => {
      const state = stateRef.current;

      if (activeTool === "eraser") {
        state.isDrawing = false;
        return;
      }

      // Don't commit click-to-place tools on pointer up
      if (activeTool === "text" || activeTool === "angle" || activeTool === "cobb_angle") {
        return;
      }

      if (!state.isDrawing || !drawingShapeRef.current) return;

      const shape = drawingShapeRef.current;

      // Validate minimum size
      let valid = true;
      if (activeTool === "line") {
        if (shape.points.length >= 2) {
          const dist = Math.hypot(
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          valid = dist >= MIN_LINE_LENGTH;
        } else {
          valid = false;
        }
      } else if (activeTool === "freehand") {
        valid = state.currentPoints.length >= MIN_FREEHAND_POINTS;
        if (valid) {
          const tolerance = FREEHAND_SIMPLIFY_TOLERANCE / transform.zoom;
          shape.points = simplifyPoints(state.currentPoints, tolerance);
          shape.simplify = true;
          const bb = computeBoundingBox(shape.points);
          shape.x = bb.x;
          shape.y = bb.y;
          shape.width = bb.width;
          shape.height = bb.height;
        }
      }

      // Ruler validation
      if (activeTool === "ruler") {
        if (shape.points.length >= 2) {
          const dist = Math.hypot(
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          valid = dist >= MIN_LINE_LENGTH;
          if (valid) {
            const m = computeRulerMeasurement(shape.points[0], shape.points[1]);
            shape.measurement = { value: m.pixelLength, unit: m.unit, calibrated: false, label: m.label };
          }
        } else {
          valid = false;
        }
      }

      if (valid) {
        setPending({ ...shape });
      }

      // Reset state
      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [activeTool, transform.zoom, setPending]
  );

  // ─── Double Click ───
  const handleDoubleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_e: React.MouseEvent, _containerRect: DOMRect): void => {
      // No click-to-place tools remaining that commit on double-click
    },
    []
  );

  // ─── Key Down ───
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const state = stateRef.current;

      // Angle-specific keys
      if (activeTool === "angle" && state.isDrawing) {
        if (e.key === "Escape") {
          cancelDrawing();
          return true;
        }
        if (e.key === "Backspace" && state.measurementClicks.length > 1) {
          state.measurementClicks.pop();
          return true;
        }
      }

      // Cobb-specific keys
      if (activeTool === "cobb_angle" && state.isDrawing) {
        if (e.key === "Escape") {
          cancelDrawing();
          return true;
        }
        if (e.key === "Backspace" && state.measurementClicks.length > 1) {
          state.measurementClicks.pop();
          return true;
        }
      }

      return false;
    },
    [activeTool, cancelDrawing]
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
    const shape = createBaseShape("angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...pts];
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
    const shape = createBaseShape("cobb_angle", MEASUREMENT_STYLE, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...pts];
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

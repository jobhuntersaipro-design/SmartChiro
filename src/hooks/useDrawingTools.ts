"use client";

import { useCallback, useRef } from "react";
import type {
  BaseShape,
  BezierControlPoint,
  CalibrationData,
  Point,
  ShapeStyle,
  ToolId,
  ViewTransform,
} from "@/types/annotation";
import {
  DEFAULT_SHAPE_STYLE,
  MEASUREMENT_STYLE,
  CALIBRATION_STYLE,
  computeBoundingBox,
  screenToImage,
  simplifyPoints,
} from "@/types/annotation";

// ─── Constants ───

const MIN_LINE_LENGTH = 3;
const MIN_RECT_SIZE = 3;
const MIN_ELLIPSE_RADIUS = 3;
const MIN_FREEHAND_POINTS = 2;
const POLYLINE_SNAP_RADIUS = 8;
const ERASER_RADIUS = 8;
const FREEHAND_SIMPLIFY_TOLERANCE = 1.5;

// ─── Types ───

interface DrawingState {
  isDrawing: boolean;
  shapeId: string | null;
  startPoint: Point | null;
  currentPoints: Point[];
  // For bezier
  bezierAnchors: Point[];
  bezierControlPoints: BezierControlPoint[];
  // For polyline
  polylineCommitted: Point[];
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
  calibration: CalibrationData;
  onAddShape: (shape: BaseShape) => void;
  onDeleteShapes: (ids: string[]) => void;
  onCalibrationRequest?: (shape: BaseShape) => void;
}

interface UseDrawingToolsReturn {
  handlePointerDown: (e: React.PointerEvent, containerRect: DOMRect) => boolean;
  handlePointerMove: (e: React.PointerEvent, containerRect: DOMRect) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleDoubleClick: (e: React.MouseEvent, containerRect: DOMRect) => void;
  handleKeyDown: (e: KeyboardEvent) => boolean;
  drawingShape: BaseShape | null;
  polylinePreview: Point | null;
  isDrawing: boolean;
  cancelDrawing: () => void;
  textInputState: { active: boolean; position: Point | null; shapeId: string | null };
  commitText: (text: string) => void;
}

const DRAWING_TOOLS: ToolId[] = [
  "line", "polyline", "rectangle", "ellipse", "arrow", "freehand", "bezier", "text", "eraser",
  "ruler", "angle", "cobb_angle", "calibration_reference",
];

function createInitialDrawingState(): DrawingState {
  return {
    isDrawing: false,
    shapeId: null,
    startPoint: null,
    currentPoints: [],
    bezierAnchors: [],
    bezierControlPoints: [],
    polylineCommitted: [],
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

/**
 * Constrain rectangle to square.
 */
function constrainSquare(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: origin.x + size * Math.sign(dx),
    y: origin.y + size * Math.sign(dy),
  };
}

import {
  computeRulerMeasurement,
  computeAngleMeasurement,
  computeCobbAngle,
} from "@/lib/measurements";

export function useDrawingTools({
  activeTool,
  transform,
  shapes,
  currentStyle,
  calibration,
  onAddShape,
  onDeleteShapes,
  onCalibrationRequest,
}: UseDrawingToolsOptions): UseDrawingToolsReturn {
  const stateRef = useRef<DrawingState>(createInitialDrawingState());
  const drawingShapeRef = useRef<BaseShape | null>(null);
  const polylinePreviewRef = useRef<Point | null>(null);

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
    polylinePreviewRef.current = null;
  }, []);

  const buildLineShape = useCallback(
    (start: Point, end: Point, type: "line" | "arrow"): BaseShape => {
      const shape = createBaseShape(type, currentStyle, getNextZIndex(shapes));
      shape.points = [start, end];
      const bb = computeBoundingBox([start, end]);
      shape.x = bb.x;
      shape.y = bb.y;
      shape.width = bb.width;
      shape.height = bb.height;
      shape.lineCap = "round";
      if (type === "arrow") {
        shape.arrowStart = false;
        shape.arrowEnd = true;
        shape.arrowSize = 12;
      }
      return shape;
    },
    [currentStyle, shapes]
  );

  const buildRectShape = useCallback(
    (start: Point, end: Point, fromCenter: boolean): BaseShape => {
      const shape = createBaseShape("rectangle", currentStyle, getNextZIndex(shapes));
      let x: number, y: number, w: number, h: number;
      if (fromCenter) {
        w = Math.abs(end.x - start.x) * 2;
        h = Math.abs(end.y - start.y) * 2;
        x = start.x - w / 2;
        y = start.y - h / 2;
      } else {
        x = Math.min(start.x, end.x);
        y = Math.min(start.y, end.y);
        w = Math.abs(end.x - start.x);
        h = Math.abs(end.y - start.y);
      }
      shape.x = x;
      shape.y = y;
      shape.width = w;
      shape.height = h;
      shape.cornerRadius = 0;
      return shape;
    },
    [currentStyle, shapes]
  );

  const buildEllipseShape = useCallback(
    (center: Point, radiusPoint: Point): BaseShape => {
      const shape = createBaseShape("ellipse", currentStyle, getNextZIndex(shapes));
      const rx = Math.abs(radiusPoint.x - center.x);
      const ry = Math.abs(radiusPoint.y - center.y);
      shape.x = center.x - rx;
      shape.y = center.y - ry;
      shape.width = rx * 2;
      shape.height = ry * 2;
      return shape;
    },
    [currentStyle, shapes]
  );

  // ─── Pointer Down ───
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): boolean => {
      if (!isDrawingTool || e.button !== 0) return false;

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

      // ─── Polyline (click-to-place) ───
      if (activeTool === "polyline") {
        if (!state.isDrawing) {
          // First point
          state.isDrawing = true;
          state.shapeId = generateId();
          state.polylineCommitted = [imagePos];
          updatePolylinePreview(imagePos);
          return true;
        }
        // Check if clicking near start to close
        if (state.polylineCommitted.length >= 3) {
          const first = state.polylineCommitted[0];
          const dist = Math.hypot(imagePos.x - first.x, imagePos.y - first.y);
          if (dist * transform.zoom < POLYLINE_SNAP_RADIUS) {
            commitPolyline(true);
            return true;
          }
        }
        // Add point
        state.polylineCommitted.push(imagePos);
        updatePolylinePreview(imagePos);
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

      // ─── Bezier (click-to-place anchors) ───
      if (activeTool === "bezier") {
        if (!state.isDrawing) {
          state.isDrawing = true;
          state.shapeId = generateId();
          state.bezierAnchors = [imagePos];
          state.bezierControlPoints = [
            { cp1x: imagePos.x, cp1y: imagePos.y, cp2x: imagePos.x, cp2y: imagePos.y },
          ];
          updateBezierPreview();
          return true;
        }
        // Add new anchor
        state.bezierAnchors.push(imagePos);
        state.bezierControlPoints.push({
          cp1x: imagePos.x,
          cp1y: imagePos.y,
          cp2x: imagePos.x,
          cp2y: imagePos.y,
        });
        updateBezierPreview();
        return true;
      }

      // ─── Drag-based tools (line, arrow, rect, ellipse, freehand) ───
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
      } else if (activeTool === "line" || activeTool === "arrow") {
        preview = buildLineShape(imagePos, imagePos, activeTool);
        preview.id = state.shapeId;
      } else if (activeTool === "rectangle") {
        preview = buildRectShape(imagePos, imagePos, e.altKey);
        preview.id = state.shapeId;
      } else if (activeTool === "ellipse") {
        preview = buildEllipseShape(imagePos, imagePos);
        preview.id = state.shapeId;
      } else if (activeTool === "ruler" || activeTool === "calibration_reference") {
        const style = activeTool === "calibration_reference" ? CALIBRATION_STYLE : MEASUREMENT_STYLE;
        preview = createBaseShape(activeTool === "ruler" ? "ruler" : "calibration_reference", style, zIndex);
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
      buildRectShape,
      buildEllipseShape,
      calibration,
    ]
  );

  // ─── Pointer Move ───
  const handlePointerMove = useCallback(
    (e: React.PointerEvent, containerRect: DOMRect): void => {
      if (!isDrawingTool) return;

      const imagePos = toImage(e.clientX, e.clientY, containerRect);
      const state = stateRef.current;

      // Polyline preview cursor
      if (activeTool === "polyline" && state.isDrawing) {
        polylinePreviewRef.current = imagePos;
        updatePolylinePreview(imagePos);
        return;
      }

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

      // Bezier: update last control point if dragging
      if (activeTool === "bezier" && state.isDrawing && (e.buttons & 1)) {
        const lastIdx = state.bezierAnchors.length - 1;
        if (lastIdx >= 0) {
          const anchor = state.bezierAnchors[lastIdx];
          const cp = state.bezierControlPoints[lastIdx];
          cp.cp2x = imagePos.x;
          cp.cp2y = imagePos.y;
          // Mirror for symmetric handles unless Alt held
          if (!e.altKey) {
            cp.cp1x = 2 * anchor.x - imagePos.x;
            cp.cp1y = 2 * anchor.y - imagePos.y;
          }
          updateBezierPreview();
        }
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
      if (activeTool === "line" || activeTool === "arrow") {
        if (e.shiftKey) {
          endPoint = constrainAngle(state.startPoint, imagePos);
        }
        const preview = buildLineShape(state.startPoint, endPoint, activeTool);
        preview.id = state.shapeId!;
        drawingShapeRef.current = preview;
        return;
      }

      if (activeTool === "rectangle") {
        if (e.shiftKey) {
          endPoint = constrainSquare(state.startPoint, imagePos);
        }
        const preview = buildRectShape(state.startPoint, endPoint, e.altKey);
        preview.id = state.shapeId!;
        drawingShapeRef.current = preview;
        return;
      }

      if (activeTool === "ellipse") {
        if (e.shiftKey) {
          // Constrain to circle
          const dx = imagePos.x - state.startPoint.x;
          const dy = imagePos.y - state.startPoint.y;
          const radius = Math.max(Math.abs(dx), Math.abs(dy));
          endPoint = {
            x: state.startPoint.x + radius * Math.sign(dx),
            y: state.startPoint.y + radius * Math.sign(dy),
          };
        }
        const preview = buildEllipseShape(state.startPoint, endPoint);
        preview.id = state.shapeId!;
        drawingShapeRef.current = preview;
        return;
      }

      // Ruler / Calibration Reference (drag-based)
      if (activeTool === "ruler" || activeTool === "calibration_reference") {
        if (e.shiftKey) {
          endPoint = constrainAngle(state.startPoint, imagePos);
        }
        const style = activeTool === "calibration_reference" ? CALIBRATION_STYLE : MEASUREMENT_STYLE;
        const shapeType = activeTool === "ruler" ? "ruler" as const : "calibration_reference" as const;
        const preview = createBaseShape(shapeType, style, getNextZIndex(shapes));
        preview.id = state.shapeId!;
        preview.points = [state.startPoint, endPoint];
        preview.showEndTicks = true;
        preview.tickLength = 8;
        preview.labelPosition = "auto";
        preview.lineCap = "round";
        const bb = computeBoundingBox([state.startPoint, endPoint]);
        preview.x = bb.x; preview.y = bb.y; preview.width = bb.width; preview.height = bb.height;
        // Compute measurement for ruler preview
        if (activeTool === "ruler") {
          const m = computeRulerMeasurement(state.startPoint, endPoint, calibration);
          preview.measurement = { value: m.pixelLength, unit: m.unit, calibrated: m.unit === "mm", label: m.label };
        }
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
      buildRectShape,
      buildEllipseShape,
      calibration,
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
      if (activeTool === "polyline" || activeTool === "bezier" || activeTool === "text"
        || activeTool === "angle" || activeTool === "cobb_angle") {
        return;
      }

      if (!state.isDrawing || !drawingShapeRef.current) return;

      const shape = drawingShapeRef.current;

      // Validate minimum size
      let valid = true;
      if (activeTool === "line" || activeTool === "arrow") {
        if (shape.points.length >= 2) {
          const dist = Math.hypot(
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          valid = dist >= MIN_LINE_LENGTH;
        } else {
          valid = false;
        }
      } else if (activeTool === "rectangle") {
        valid = shape.width >= MIN_RECT_SIZE && shape.height >= MIN_RECT_SIZE;
      } else if (activeTool === "ellipse") {
        valid = shape.width / 2 >= MIN_ELLIPSE_RADIUS || shape.height / 2 >= MIN_ELLIPSE_RADIUS;
      } else if (activeTool === "freehand") {
        valid = state.currentPoints.length >= MIN_FREEHAND_POINTS;
        if (valid) {
          // Simplify freehand path
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

      // Ruler / Calibration Reference validation
      if (activeTool === "ruler" || activeTool === "calibration_reference") {
        if (shape.points.length >= 2) {
          const dist = Math.hypot(
            shape.points[1].x - shape.points[0].x,
            shape.points[1].y - shape.points[0].y
          );
          valid = dist >= MIN_LINE_LENGTH;
          if (valid) {
            if (activeTool === "ruler") {
              const m = computeRulerMeasurement(shape.points[0], shape.points[1], calibration);
              shape.measurement = { value: m.pixelLength, unit: m.unit, calibrated: m.unit === "mm", label: m.label };
            } else {
              // Calibration reference — compute pixel distance, request dialog
              const pixDist = Math.hypot(
                shape.points[1].x - shape.points[0].x,
                shape.points[1].y - shape.points[0].y
              );
              shape.pixelDistance = pixDist;
              shape.measurement = { value: pixDist, unit: "px", calibrated: false, label: `${Math.round(pixDist)} px` };
            }
          }
        } else {
          valid = false;
        }
      }

      if (valid) {
        onAddShape({ ...shape });
        // For calibration reference, trigger calibration dialog
        if (activeTool === "calibration_reference" && onCalibrationRequest) {
          onCalibrationRequest({ ...shape });
        }
      }

      // Reset state
      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [activeTool, transform.zoom, onAddShape, calibration, onCalibrationRequest]
  );

  // ─── Double Click ───
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent, containerRect: DOMRect): void => {
      // Commit polyline on double-click
      if (activeTool === "polyline" && stateRef.current.isDrawing) {
        e.preventDefault();
        commitPolyline(false);
        return;
      }

      // Commit bezier on double-click
      if (activeTool === "bezier" && stateRef.current.isDrawing) {
        e.preventDefault();
        commitBezier();
        return;
      }
    },
    [activeTool]
  );

  // ─── Key Down ───
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const state = stateRef.current;

      // Polyline-specific keys
      if (activeTool === "polyline" && state.isDrawing) {
        if (e.key === "Enter") {
          commitPolyline(false);
          return true;
        }
        if (e.key === "Escape") {
          cancelDrawing();
          return true;
        }
        if (e.key === "Backspace" && state.polylineCommitted.length > 1) {
          state.polylineCommitted.pop();
          updatePolylinePreview(polylinePreviewRef.current ?? state.polylineCommitted[state.polylineCommitted.length - 1]);
          return true;
        }
      }

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

      // Bezier-specific keys
      if (activeTool === "bezier" && state.isDrawing) {
        if (e.key === "Enter") {
          commitBezier();
          return true;
        }
        if (e.key === "Escape") {
          cancelDrawing();
          return true;
        }
        if (e.key === "Backspace" && state.bezierAnchors.length > 1) {
          state.bezierAnchors.pop();
          state.bezierControlPoints.pop();
          updateBezierPreview();
          return true;
        }
      }

      return false;
    },
    [activeTool, cancelDrawing]
  );

  // ─── Polyline Helpers ───
  function updatePolylinePreview(cursorPos: Point) {
    const state = stateRef.current;
    if (state.polylineCommitted.length === 0) return;
    const allPoints = [...state.polylineCommitted, cursorPos];
    const shape = createBaseShape("polyline", currentStyle, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = allPoints;
    shape.closed = false;
    shape.lineCap = "round";
    const bb = computeBoundingBox(allPoints);
    shape.x = bb.x;
    shape.y = bb.y;
    shape.width = bb.width;
    shape.height = bb.height;
    drawingShapeRef.current = shape;
  }

  function commitPolyline(closed: boolean) {
    const state = stateRef.current;
    if (state.polylineCommitted.length < 2) {
      cancelDrawing();
      return;
    }
    const shape = createBaseShape("polyline", currentStyle, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...state.polylineCommitted];
    shape.closed = closed;
    shape.lineCap = "round";
    const bb = computeBoundingBox(shape.points);
    shape.x = bb.x;
    shape.y = bb.y;
    shape.width = bb.width;
    shape.height = bb.height;
    onAddShape(shape);

    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
    polylinePreviewRef.current = null;
  }

  // ─── Bezier Helpers ───
  function updateBezierPreview() {
    const state = stateRef.current;
    if (state.bezierAnchors.length === 0) return;
    const shape = createBaseShape("bezier", currentStyle, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...state.bezierAnchors];
    shape.controlPoints = [...state.bezierControlPoints];
    shape.lineCap = "round";
    const bb = computeBoundingBox(state.bezierAnchors);
    shape.x = bb.x;
    shape.y = bb.y;
    shape.width = bb.width;
    shape.height = bb.height;
    drawingShapeRef.current = shape;
  }

  function commitBezier() {
    const state = stateRef.current;
    if (state.bezierAnchors.length < 2) {
      cancelDrawing();
      return;
    }
    const shape = createBaseShape("bezier", currentStyle, getNextZIndex(shapes));
    shape.id = state.shapeId!;
    shape.points = [...state.bezierAnchors];
    shape.controlPoints = [...state.bezierControlPoints];
    shape.lineCap = "round";
    const bb = computeBoundingBox(state.bezierAnchors);
    shape.x = bb.x;
    shape.y = bb.y;
    shape.width = bb.width;
    shape.height = bb.height;
    onAddShape(shape);

    stateRef.current = createInitialDrawingState();
    drawingShapeRef.current = null;
  }

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
    onAddShape(shape);
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
    // If we have 4+ points, compute the cobb angle
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
    onAddShape(shape);
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
      // Text stroke is the text color
      shape.style.strokeColor = "#FFFFFF";
      // Estimate size based on text length
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
    polylinePreview: polylinePreviewRef.current,
    isDrawing: stateRef.current.isDrawing || stateRef.current.textInputActive,
    cancelDrawing,
    textInputState: {
      active: stateRef.current.textInputActive,
      position: stateRef.current.textPosition,
      shapeId: stateRef.current.shapeId,
    },
    commitText,
  };
}

// ─── Eraser Hit Test ───

function hitTestEraser(
  imagePos: Point,
  shapes: BaseShape[],
  zoom: number
): BaseShape | null {
  const radius = ERASER_RADIUS / zoom;
  // Check from top to bottom (highest zIndex first)
  const sorted = [...shapes]
    .filter((s) => s.visible && !s.locked)
    .sort((a, b) => b.zIndex - a.zIndex);

  for (const shape of sorted) {
    // Check if point is within expanded bounding box
    if (
      imagePos.x >= shape.x - radius &&
      imagePos.x <= shape.x + shape.width + radius &&
      imagePos.y >= shape.y - radius &&
      imagePos.y <= shape.y + shape.height + radius
    ) {
      // For line-based shapes, check distance to line segments
      if (
        shape.type === "line" ||
        shape.type === "arrow" ||
        shape.type === "freehand" ||
        shape.type === "polyline" ||
        shape.type === "bezier" ||
        shape.type === "ruler" ||
        shape.type === "calibration_reference"
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
        // Bounding box hit for rect, ellipse, text
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

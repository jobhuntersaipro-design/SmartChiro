"use client";

import { useCallback, useRef } from "react";
import type {
  BaseShape,
  BezierControlPoint,
  Point,
  ShapeStyle,
  ToolId,
  ViewTransform,
} from "@/types/annotation";
import {
  DEFAULT_SHAPE_STYLE,
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
}

interface UseDrawingToolsOptions {
  activeTool: ToolId;
  transform: ViewTransform;
  shapes: BaseShape[];
  currentStyle: ShapeStyle;
  onAddShape: (shape: BaseShape) => void;
  onDeleteShapes: (ids: string[]) => void;
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

      // Don't commit polyline/bezier on pointer up (they use click-to-place)
      if (activeTool === "polyline" || activeTool === "bezier" || activeTool === "text") {
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

      if (valid) {
        onAddShape({ ...shape });
      }

      // Reset state
      stateRef.current = createInitialDrawingState();
      drawingShapeRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [activeTool, transform.zoom, onAddShape]
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
        shape.type === "bezier"
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

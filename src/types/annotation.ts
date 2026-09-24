// ─── Base Shape System ───

export type ShapeType =
  | "point"
  | "line"
  | "polyline"
  | "rectangle"
  | "ellipse"
  | "freehand"
  | "text"
  | "arrow"
  | "ruler"
  | "angle"
  | "cobb_angle"
  | "calibration"
  | "landmark";

export interface ShapeStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  fillColor: string | null;
  fillOpacity: number;
  lineDash: number[]; // e.g. [5, 5] for dashed
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Stable reference to another shape's vertex. When a measurement vertex is
 * placed via snap-to-vertex, we record where it snapped from so the
 * measurement can follow live if the source vertex moves.
 *
 * `vertexIndex` is an index into the source shape's `points` array.
 */
export interface VertexRef {
  shapeId: string;
  vertexIndex: number;
}

export interface BaseShape {
  id: string;
  type: ShapeType;
  label: string | null;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  style: ShapeStyle;
  // Bounding box (image-pixel space)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  // Type-specific data
  points: Point[]; // vertices, control points, etc.
  /**
   * Parallel array to `points`. When `pointRefs[i]` is non-null, this vertex
   * was placed by snapping to another shape's vertex; at render time the
   * resolver replaces `points[i]` with the source vertex's current position
   * so this shape follows live if the source moves. A null entry (or omitted
   * `pointRefs` array) means the vertex is free.
   *
   * Optional + sparse: shapes saved before live-references shipped don't
   * carry this field, and the renderer falls back to the static `points`
   * coords when `pointRefs` is missing or all-null.
   */
  pointRefs?: (VertexRef | null)[];
  text: string | null; // for text shapes
  fontSize: number | null;
  // Measurement data (for ruler, angle, cobb_angle, rectangle, ellipse shapes)
  measurement: ShapeMeasurement | null;
  /**
   * Stable, human-readable ID for this measurement / shape, e.g. "L1", "A2", "C1",
   * "R1", "E1". Assigned at creation time by counting prior shapes of the same kind.
   * Used for the print summary to label each row consistently with the canvas.
   * Optional because non-measurement shapes (text, freehand, line, polyline) don't need it.
   */
  measurementId?: string;

  // ─── Extended shape-specific fields ───

  // Line / Polyline / Arrow
  lineCap?: "round" | "butt" | "square";

  // Ruler
  showEndTicks?: boolean;
  tickLength?: number;
  labelPosition?: "above" | "below" | "auto";

  // Angle
  arcRadius?: number;
  showSupplementary?: boolean;

  // Cobb Angle
  line1?: [number, number, number, number];
  line2?: [number, number, number, number];
  perpendicular1?: [number, number, number, number];
  perpendicular2?: [number, number, number, number];
  intersection?: [number, number];
  showPerpendiculars?: boolean;
  showClassification?: boolean;
  cobbClassification?: string;

  // Polyline
  closed?: boolean;

  // Rectangle
  cornerRadius?: number;

  // Arrow
  arrowStart?: boolean;
  arrowEnd?: boolean;
  arrowSize?: number;

  // Freehand
  tension?: number;
  simplify?: boolean;

  // Text (extended)
  fontFamily?: string;
  fontWeight?: 400 | 500 | 600 | 700;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textPadding?: number;
  textBackground?: string | null;

  // Landmark (AI-detected anatomical points — kind: "landmark")
  // The single point lives in points[0]; these fields capture the metadata
  // needed for the review-and-adjust UX.
  /** Canonical snake_case name — e.g. "top_of_femoral_head_1". Unique per response. */
  landmarkName?: string;
  /**
   * Whether this landmark was placed by AI or by the user. AI landmarks
   * render with a dashed ring; once dragged, source flips to "manual" and
   * the ring becomes solid so the user can see what they've reviewed.
   */
  landmarkSource?: "ai" | "manual";
  /**
   * The original AI-suggested position, captured at detection time and
   * preserved through user drags so we can offer a "Reset to AI" affordance.
   * Stays unset for landmarks placed manually from scratch.
   */
  landmarkOriginalX?: number;
  landmarkOriginalY?: number;
}

export interface ShapeMeasurement {
  value: number; // computed measurement value
  unit: "px" | "mm" | "deg" | "px²" | "mm²";
  calibrated: boolean;
  label: string; // display string, e.g. "45.2°" or "12.5 mm" or "1284 px²"
}

// ─── Canvas State (stored in Annotation.canvasState) ───

export interface AnnotationCanvasState {
  version: 1;
  shapes: BaseShape[];
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  metadata: {
    shapeCount: number;
    measurementCount: number;
    lastModifiedShapeId: string | null;
  };
}

// ─── Image Adjustments ───

export interface ImageAdjustments {
  brightness: number;   // -100 to 100, default 0
  contrast: number;     // -100 to 100, default 0
  invert: boolean;      // negative image, default false
  /**
   * Pixels per millimeter, derived from the user's calibration line. When set,
   * all length/area measurements display in mm/cm/mm²/cm² instead of px/px².
   * Persisted via the existing `imageAdjustments` JSON column on Annotation —
   * no Prisma migration needed.
   */
  pixelsPerMm?: number;
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  invert: false,
};

// ─── Undo / Redo ───

export type CommandType =
  | "ADD_SHAPE"
  | "DELETE_SHAPE"
  | "MODIFY_SHAPE"
  | "REORDER_SHAPE"
  | "BATCH";

export interface CanvasCommand {
  id: string;
  type: CommandType;
  timestamp: string; // ISO 8601
  shapeBefore: BaseShape | null;
  shapeAfter: BaseShape | null;
  shapeId: string;
  /**
   * The active tool when this command was pushed. Used by tool-scoped Cmd+Z:
   * while in line/polyline mode, undo is restricted to commands authored with
   * the same tool — so users don't accidentally undo a polyline while drawing
   * lines, or vice versa.
   */
  authoringTool?: ToolId;
  // For BATCH commands
  children?: CanvasCommand[];
}

export interface UndoRedoStack {
  history: CanvasCommand[];
  pointer: number; // current position (-1 = nothing to undo)
  maxSize: number; // cap at 100
}

// ─── Tool State Machine ───

export type ToolId =
  | "hand"
  | "select"
  | "point"
  | "line"
  | "polyline"
  | "ruler"
  | "angle"
  | "cobb_angle"
  | "arrow"
  | "text"
  | "calibrate";

export type ToolState =
  | "idle"
  | "tool_selected"
  | "drawing"
  | "shape_committed"
  | "shape_selected"
  | "transforming"
  | "editing";

export interface CanvasToolState {
  activeTool: ToolId;
  state: ToolState;
  selectedShapeIds: string[];
  drawingShapeId: string | null;
}

// ─── View Mode (Multi-View Grid) ───

export type ViewMode = "single" | "side-by-side" | "2x2";

export interface ViewportSlot {
  xrayId: string | null;
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  title: string;
}

// ─── Viewport / Transform ───

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export const ZOOM_MIN = 0.05;  // 5%
export const ZOOM_MAX = 32;    // 3200%
export const ZOOM_SCROLL_STEP = 1.056;
export const ZOOM_SHORTCUT_STEP = 1.25;
export const CANVAS_PADDING = 24; // px padding for fit-to-viewport

// ─── Default Shape Style ───

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  strokeColor: "#FF3B30",  // red — high contrast on dark X-ray canvas
  strokeWidth: 2,
  strokeOpacity: 1,
  fillColor: null,
  fillOpacity: 0,
  lineDash: [],
};

// ─── Measurement Default Styles ───

export const MEASUREMENT_STYLE: ShapeStyle = {
  strokeColor: "#00D4AA",       // teal — distinct from drawing red
  strokeWidth: 1.5,
  strokeOpacity: 1,
  fillColor: null,
  fillOpacity: 0,
  lineDash: [],
};

// ─── Color Presets ───

export const ANNOTATION_COLOR_PRESETS = [
  "#FF3B30",  // Red (default drawing)
  "#FF9500",  // Orange
  "#FFCC00",  // Yellow
  "#00D4AA",  // Teal (default measurement — Part 4)
  "#00AAFF",  // Blue
  "#AF52DE",  // Purple
  "#FFFFFF",  // White
  "#8E8E93",  // Gray
];

// ─── Dash Pattern Presets ───

export const DASH_PATTERN_PRESETS: Record<string, number[]> = {
  solid: [],
  dashed: [8, 4],
  dotted: [2, 4],
};

// ─── Canvas Dimensions ───

export const TOOLBAR_WIDTH = 56;
export const PROPERTIES_PANEL_WIDTH = 280;
export const HEADER_HEIGHT = 48;
export const ZOOM_BAR_HEIGHT = 32;
export const STATUS_BAR_HEIGHT = 28;

// ─── Helpers ───

export function createEmptyCanvasState(): AnnotationCanvasState {
  return {
    version: 1,
    shapes: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    metadata: {
      shapeCount: 0,
      measurementCount: 0,
      lastModifiedShapeId: null,
    },
  };
}

export function screenToImage(
  screenX: number,
  screenY: number,
  transform: ViewTransform
): Point {
  return {
    x: (screenX - transform.panX) / transform.zoom,
    y: (screenY - transform.panY) / transform.zoom,
  };
}

export function imageToScreen(
  imageX: number,
  imageY: number,
  transform: ViewTransform
): Point {
  return {
    x: imageX * transform.zoom + transform.panX,
    y: imageY * transform.zoom + transform.panY,
  };
}

/**
 * Compute a new viewport transform that scales `prev.zoom` by `factor` while
 * keeping the image-space point under `(anchorScreenX, anchorScreenY)` fixed
 * on screen.
 *
 * Math:
 *   imagePos = screenToImage(anchor, prev)               // pixel currently under cursor
 *   newZoom  = clamp(prev.zoom * factor, [min, max])
 *   newPan   = anchor - imagePos * newZoom               // anchor stays on imagePos
 *
 * Why a multiplier (not an absolute zoom): wheel events can fire faster than
 * React commits state. A caller that reads `state.zoom` from a closure and
 * passes `state.zoom * factor` will compute against a stale base on rapid
 * events, which makes zoom feel sticky and (with chained calls) accumulates
 * drift away from the cursor. Taking the factor lets `setTransform`'s `prev`
 * provide the freshest zoom value at the moment of update.
 *
 * Pure function — `prev` is not mutated.
 */
export function applyZoomAroundAnchor(
  prev: ViewTransform,
  factor: number,
  anchorScreenX: number,
  anchorScreenY: number
): ViewTransform {
  const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom * factor));
  const imagePos = screenToImage(anchorScreenX, anchorScreenY, prev);
  return {
    zoom: newZoom,
    panX: anchorScreenX - imagePos.x * newZoom,
    panY: anchorScreenY - imagePos.y * newZoom,
  };
}

/**
 * Compute bounding box for a set of points.
 */
export function computeBoundingBox(points: Point[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Ramer-Douglas-Peucker line simplification.
 */
export function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPoints(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  return (
    Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lengthSq)
  );
}

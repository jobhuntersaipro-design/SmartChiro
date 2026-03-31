// ─── Base Shape System ───

export type ShapeType =
  | "line"
  | "polyline"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "freehand"
  | "text"
  | "ruler"
  | "angle"
  | "cobb_angle";

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
  text: string | null; // for text shapes
  fontSize: number | null;
  // Measurement data (for ruler, angle, cobb_angle shapes)
  measurement: ShapeMeasurement | null;
}

export interface ShapeMeasurement {
  value: number; // computed measurement value
  unit: "px" | "mm" | "deg";
  calibrated: boolean;
  label: string; // display string, e.g. "45.2°" or "12.5 mm"
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
  windowCenter: number; // for window/level control, default 128
  windowWidth: number;  // for window/level control, default 256
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  invert: false,
  windowCenter: 128,
  windowWidth: 256,
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
  | "select"
  | "hand"
  | "line"
  | "polyline"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "freehand"
  | "text"
  | "ruler"
  | "angle"
  | "cobb_angle";

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

// ─── Viewport / Transform ───

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export const ZOOM_MIN = 0.05;  // 5%
export const ZOOM_MAX = 32;    // 3200%
export const ZOOM_SCROLL_STEP = 1.1;
export const ZOOM_SHORTCUT_STEP = 1.25;
export const CANVAS_PADDING = 24; // px padding for fit-to-viewport

// ─── Default Shape Style ───

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  strokeColor: "#635BFF",
  strokeWidth: 2,
  strokeOpacity: 1,
  fillColor: null,
  fillOpacity: 0,
  lineDash: [],
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

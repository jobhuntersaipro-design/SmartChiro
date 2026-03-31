# X‑Ray Annotation Spec — Part 3: Drawing Tools

> **Series**: [Upload & Storage](./xray-annotation-spec-part1-upload.md) · [Canvas Engine](./xray-annotation-spec-part2-canvas.md) · [Drawing Tools] · [Measurements](./xray-annotation-spec-part4-measurements.md) · [API & Export](./xray-annotation-spec-part5-api.md)

---

## Overview

This part covers the **drawing and markup tools** — the shape schemas (TypeScript interfaces), tool behaviors, modifier keys, default styles, color presets, and the properties panel. Measurement tools (Ruler, Angle, Cobb Angle, Calibration) are covered in Part 4.

---

## Base Shape Interface

All shapes are serialized as JSON objects within `Annotation.canvasState.shapes`. Each shape conforms to a base interface extended by type‑specific properties.

```typescript
interface BaseShape {
  id: string;              // cuid — unique per shape
  type: ShapeType;
  
  // Transform
  x: number;               // position in image‑pixel space
  y: number;
  rotation: number;        // degrees, clockwise, default 0
  
  // Style
  stroke: string;          // hex color, e.g. "#FF3B30"
  strokeWidth: number;     // px, default 2
  opacity: number;         // 0–1, default 1
  fill: string | null;     // hex color or null (no fill)
  
  // Metadata
  label: string | null;    // optional user label
  locked: boolean;         // if true, cannot be moved/edited
  visible: boolean;        // if false, hidden but still in state
  
  // Layer ordering
  zIndex: number;          // higher = on top
  
  // Timestamps
  createdAt: string;       // ISO 8601
  updatedAt: string;
}

type ShapeType =
  | "freehand"
  | "line"
  | "polyline"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "bezier"
  | "text"
  | "ruler"              // → Part 4
  | "angle"              // → Part 4
  | "cobb_angle"         // → Part 4
  | "calibration_reference"; // → Part 4
```

---

## Tool Map & Shortcuts

| Tool | Shortcut | Type | Category |
| --- | --- | --- | --- |
| Select / Move | `V` | — | Selection |
| Freehand Pen | `P` | `freehand` | Drawing |
| Line | `L` | `line` | Drawing |
| Polyline | `Shift + L` | `polyline` | Drawing |
| Arrow | `A` | `arrow` | Drawing |
| Rectangle | `R` | `rectangle` | Drawing |
| Ellipse | `E` | `ellipse` | Drawing |
| Bezier Curve | `B` | `bezier` | Drawing |
| Text | `T` | `text` | Drawing |
| Eraser | `X` | — | Utility |
| Pan / Hand | `H` | — | Navigation |

### Drawing Modifiers (hold while drawing)

| Modifier | Effect |
| --- | --- |
| `Shift` | Constrain angles to 0°/45°/90° (line, arrow) or square/circle (rect, ellipse) |
| `Alt / Option` | Draw from center (rectangle, ellipse) |
| `Shift + Alt` | Constrain + draw from center |

---

## Shape Definitions

### Freehand (`freehand`)

```typescript
interface FreehandShape extends BaseShape {
  type: "freehand";
  points: number[];       // flat array [x1,y1, x2,y2, ...] — image‑pixel coords
  tension: number;        // curve smoothing factor, 0 = sharp, 0.5 = smooth (default 0.3)
  simplify: boolean;      // if true, point reduction was applied on pointerUp
}
```

**Behavior**:
- Records points on every `pointerMove` event
- On `pointerUp`, optionally simplifies path using Ramer‑Douglas‑Peucker algorithm (tolerance: 1.5px at 100% zoom)
- Minimum 2 points to commit; single‑click without drag is discarded
- Stroke smoothing via `tension` parameter for natural‑looking curves

### Line (`line`)

```typescript
interface LineShape extends BaseShape {
  type: "line";
  points: [number, number, number, number]; // [x1, y1, x2, y2]
  lineCap: "round" | "butt" | "square";     // default "round"
  dashPattern: number[];                      // e.g. [8, 4] for dashed, [] for solid
}
```

**Behavior**:
- Click start point, drag to end point, release to commit
- Preview line shown while dragging
- Hold `Shift` to constrain to 0°/45°/90° angles
- Minimum length: 3px (shorter is discarded)

### Polyline (`polyline`)

```typescript
interface PolylineShape extends BaseShape {
  type: "polyline";
  points: number[];       // flat array [x1,y1, x2,y2, x3,y3, ...]
  closed: boolean;        // if true, last point connects to first (polygon)
  lineCap: "round" | "butt" | "square";
  dashPattern: number[];
}
```

**Behavior**:
- Click to place each vertex; preview line follows cursor
- Double‑click or press `Enter` to commit
- Press `Escape` to cancel entire polyline
- Press `Backspace` to undo last vertex while drawing
- Hold `Shift` for angle constraint on each segment
- Minimum 2 vertices to commit
- To close as polygon: click near start point (within 8px snap radius) or toggle `closed` in properties after commit

### Arrow (`arrow`)

```typescript
interface ArrowShape extends BaseShape {
  type: "arrow";
  points: [number, number, number, number]; // [x1, y1, x2, y2]
  arrowStart: boolean;    // show arrowhead at start point, default false
  arrowEnd: boolean;      // show arrowhead at end point, default true
  arrowSize: number;      // arrowhead size in px, default 12
  dashPattern: number[];
}
```

**Behavior**:
- Same interaction as Line (click → drag → release)
- Renders arrowhead(s) at specified endpoints
- Default: arrowhead at end only
- Arrowhead scales proportionally with `strokeWidth`
- `Shift` constrains angles

### Rectangle (`rectangle`)

```typescript
interface RectangleShape extends BaseShape {
  type: "rectangle";
  width: number;          // px in image space
  height: number;         // px in image space
  cornerRadius: number;   // rounded corners, default 0
  dashPattern: number[];
}
```

**Behavior**:
- Click for top‑left corner, drag to opposite corner, release to commit
- Hold `Shift` to constrain to square
- Hold `Alt`/`Option` to draw from center (click = center point)
- `x, y` stores the top‑left position in image space
- Minimum size: 3×3px

### Ellipse (`ellipse`)

```typescript
interface EllipseShape extends BaseShape {
  type: "ellipse";
  radiusX: number;        // horizontal radius in px
  radiusY: number;        // vertical radius in px
  dashPattern: number[];
}
```

**Behavior**:
- Click for center, drag to set radii, release to commit
- Hold `Shift` to constrain to circle (radiusX = radiusY)
- `x, y` stores the center point
- Minimum radius: 3px

### Bezier Curve (`bezier`)

```typescript
interface BezierShape extends BaseShape {
  type: "bezier";
  points: number[];       // flat array of anchor points [x1,y1, x2,y2, ...]
  controlPoints: Array<{
    cp1x: number; cp1y: number;   // control point before anchor
    cp2x: number; cp2y: number;   // control point after anchor
  }>;
  lineCap: "round" | "butt" | "square";
  dashPattern: number[];
}
```

**Behavior**:
- Click to place anchor point
- Drag on place to pull control handles (symmetric by default)
- Hold `Alt`/`Option` while dragging to break handle symmetry (independent control points)
- Double‑click or `Enter` to commit curve
- `Escape` to cancel
- `Backspace` to undo last anchor while drawing
- In edit mode (double‑click existing bezier): individual anchors and control points become draggable
- Minimum 2 anchors to commit

### Text (`text`)

```typescript
interface TextShape extends BaseShape {
  type: "text";
  text: string;           // the content
  fontSize: number;       // px, default 16
  fontFamily: string;     // default "Inter, system-ui, sans-serif"
  fontWeight: 400 | 500 | 600 | 700;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  width: number;          // text box width (auto‑expands initially)
  height: number;         // text box height
  padding: number;        // internal padding, default 4
  background: string | null; // optional background color behind text
}
```

**Behavior**:
- Click on canvas to place text insertion point → inline text editor appears
- Type content; text box auto‑expands horizontally until first line break
- Press `Escape` or click outside to commit
- Empty text (no content) is discarded on commit
- Double‑click existing text to re‑enter edit mode
- Text color uses `stroke` property (defaults to `#FFFFFF` for visibility on dark canvas)
- `background` adds a semi‑transparent backdrop behind text for readability

### Eraser (utility — not a shape)

**Behavior**:
- Click on a shape to delete it (equivalent to selecting + pressing `Delete`)
- Drag across canvas to delete all shapes touched by the eraser path
- Eraser radius: 8px at 100% zoom (scales with zoom)
- Deleted shapes are pushed to undo history as `DELETE_SHAPE` commands

---

## Default Styles

New shapes inherit these defaults. Users can override via the properties panel.

```typescript
const DEFAULT_STYLES = {
  // Drawing tools
  stroke: "#FF3B30",         // red — high contrast on dark X‑ray canvas
  strokeWidth: 2,
  opacity: 1,
  fill: null,
  
  // Text
  textColor: "#FFFFFF",
  textFontSize: 16,
  textBackground: null,
};
```

> Measurement tool defaults are defined in Part 4.

### Color Presets (Quick Picker)

```typescript
const ANNOTATION_COLOR_PRESETS = [
  "#FF3B30",  // Red (default drawing)
  "#FF9500",  // Orange
  "#FFCC00",  // Yellow
  "#00D4AA",  // Teal (default measurement — Part 4)
  "#00AAFF",  // Blue
  "#AF52DE",  // Purple
  "#FFFFFF",  // White
  "#8E8E93",  // Gray
];
```

All presets pass WCAG AA contrast against the `#1A1F36` canvas background.

---

## Properties Panel — Shape Properties Tab

When a shape is selected, the properties panel displays editable fields.

### Common Properties (all shapes)

| Property | Input Type | Range |
| --- | --- | --- |
| Label | Text input | Free text |
| Stroke color | Color picker + presets | Hex |
| Stroke width | Slider + number input | 0.5 – 20 px |
| Opacity | Slider | 0 – 100% |
| Fill color | Color picker + "none" toggle | Hex or null |
| Dash pattern | Dropdown | Solid / Dashed / Dotted |
| Locked | Toggle | Boolean |

### Position & Size (all shapes)

| Property | Input Type | Range |
| --- | --- | --- |
| X | Number input | 0 – image width |
| Y | Number input | 0 – image height |
| Rotation | Number input + dial | 0 – 360° |
| Width | Number input (rect/text only) | > 0 |
| Height | Number input (rect/text only) | > 0 |

### Text‑Specific Properties

| Property | Input Type | Range |
| --- | --- | --- |
| Font size | Number input | 8 – 120 px |
| Font weight | Dropdown | Regular / Medium / Semibold / Bold |
| Font style | Toggle | Normal / Italic |
| Text align | Segmented control | Left / Center / Right |
| Background | Color picker + "none" toggle | Hex or null |

### Arrow‑Specific Properties

| Property | Input Type | Range |
| --- | --- | --- |
| Arrow start | Toggle | Boolean |
| Arrow end | Toggle | Boolean |
| Arrow size | Slider | 6 – 32 px |

### Polyline‑Specific Properties

| Property | Input Type | Range |
| --- | --- | --- |
| Closed (polygon) | Toggle | Boolean |

### Rectangle‑Specific Properties

| Property | Input Type | Range |
| --- | --- | --- |
| Corner radius | Slider + number input | 0 – 50 px |

---

## Keyboard Shortcuts — Drawing Tools

| Shortcut | Action |
| --- | --- |
| `V` | Select / Move tool |
| `P` | Freehand Pen |
| `L` | Line |
| `Shift + L` | Polyline |
| `A` | Arrow |
| `R` | Rectangle |
| `E` | Ellipse |
| `B` | Bezier Curve |
| `T` | Text |
| `X` | Eraser |
| `Ctrl/Cmd + D` | Duplicate selected shape(s) |
| `Ctrl/Cmd + G` | Group selected shapes (future) |

---

## Related Specs

- **Part 2 — Canvas Engine**: tool state machine, selection/transform, undo/redo
- **Part 4 — Measurements**: Ruler, Angle, Cobb Angle, Calibration shape schemas
- **Part 5 — API & Export**: how shapes are persisted and exported

---

🦴 **SmartChiro X‑Ray Annotation — Part 3 of 5**

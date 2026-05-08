# SmartChiro Viewer — Part 3: Tools, Measurements & AI Landmarks

> **Series**: [Overview & Architecture](./viewer-spec-part1-overview.md) · [Canvas Engine](./viewer-spec-part2-canvas.md) · [Tools, Measurements & AI Landmarks]

---

## Overview

This part covers everything that lives on the `shapesLayer`: the drawing tools, the measurement calculations, the calibration system, the annotation tools, the AI landmark detection, and PNG export. By the end of Part 3's implementation, the viewer is feature-complete for v1.

Reading this part should give you everything you need to build Phases 3–6 from Part 1's build order.

---

## The Shape data model

Every shape on the canvas — measurements, annotations, AI landmarks — is a TypeScript object that conforms to a discriminated union. This keeps the reducer simple, the renderer simple, and lets us add new shape types later without breaking existing ones.

```typescript
// All coordinates are in image space (image pixels), not screen space.

interface BaseShape {
  id: string;              // uid
  createdAt: number;       // for stable sort + history
  color: ShapeColor;       // see palette below
  strokeWidth: 1 | 2 | 3;
  selected?: boolean;      // transient — for "is this currently selected"
}

type ShapeColor = 'green' | 'yellow' | 'red' | 'white' | 'cyan';

// === Measurements ===

interface LineShape extends BaseShape {
  kind: 'line';
  a: Point;
  b: Point;
}

interface PolylineShape extends BaseShape {
  kind: 'polyline';
  points: Point[];         // 2 or more points
  closed: false;           // we don't close polylines for measurement
}

interface AngleShape extends BaseShape {
  kind: 'angle';
  a: Point;                // first endpoint
  vertex: Point;           // corner where the angle is measured
  b: Point;                // second endpoint
}

interface CobbAngleShape extends BaseShape {
  kind: 'cobb';
  line1: { a: Point; b: Point };
  line2: { a: Point; b: Point };
}

interface RectShape extends BaseShape {
  kind: 'rect';
  topLeft: Point;
  bottomRight: Point;
}

interface EllipseShape extends BaseShape {
  kind: 'ellipse';
  center: Point;
  radiusX: number;         // image-space pixels
  radiusY: number;
}

// === Annotations ===

interface ArrowShape extends BaseShape {
  kind: 'arrow';
  a: Point;                // tail
  b: Point;                // head (arrowhead drawn here)
}

interface TextShape extends BaseShape {
  kind: 'text';
  position: Point;
  text: string;
  fontSize: number;        // in image-space pixels — scales with zoom
}

interface FreehandShape extends BaseShape {
  kind: 'freehand';
  points: Point[];         // sampled mouse-move path
}

// === AI ===

interface LandmarkShape extends BaseShape {
  kind: 'landmark';
  name: string;            // e.g., "top_of_left_femoral_head"
  position: Point;
  confidence: number;      // 0–1, from Claude
  source: 'ai' | 'manual'; // 'manual' if user moved/created it
}

// === Special ===

interface CalibrationShape extends BaseShape {
  kind: 'calibration';
  a: Point;
  b: Point;
  realWorldMm: number;     // entered by user
}

type Shape =
  | LineShape | PolylineShape | AngleShape | CobbAngleShape
  | RectShape | EllipseShape
  | ArrowShape | TextShape | FreehandShape
  | LandmarkShape | CalibrationShape;
```

### Color palette

| Name | Hex | Use case |
|---|---|---|
| `green` | `#34d399` | Default for measurements |
| `yellow` | `#fbbf24` | Highlights, pending interaction |
| `red` | `#f87171` | Important markings, deviations |
| `white` | `#f5f5f5` | Annotations on dark images |
| `cyan` | `#22d3ee` | AI-generated content |

---

## Universal interaction rules

Three rules apply to every shape:

### Rule 1: All points are draggable

Whether a point came from manual placement, an AI landmark, or any tool, the user can grab it and drag it. The shape's measurement label updates live during the drag.

In Konva, this is a `Circle` with `draggable={true}` placed at each control point. On `dragmove`, the corresponding point in the shape's data is updated, which triggers the measurement label to recompute.

### Rule 2: Click empty space to deselect

Clicking on the imageLayer (which has `listening={false}`) falls through to the Stage's `click` handler. If the active tool is `pan` and a shape is selected, the click deselects it. If a tool is active, clicks are interpreted as tool input.

### Rule 3: Cmd/Ctrl+Z is universal

The history stack records every shape mutation (create, update, delete). Cmd/Ctrl+Z reverts the last action regardless of which tool produced it. Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y on Windows) re-applies.

---

## Tool state machine

Only one tool is active at a time. Tools are mutually exclusive — selecting any tool cancels any pending interaction in the previous tool.

```
States:
  pan          — drag to pan, scroll to zoom (default tool)
  line         — 2-click line measurement
  polyline     — multi-click chained line measurement
  angle        — 3-click angle measurement
  cobb         — 4-click two-line angle measurement
  rect         — drag-to-create rectangle area
  ellipse      — drag-to-create ellipse area
  calibrate    — 2-click line + modal for real-world length
  arrow        — 2-click arrow annotation
  text         — 1-click text label, then inline edit
  freehand     — drag to draw a freeform line
```

When a tool is selected:

1. `tool` state is set to the new tool
2. `pendingPoints` is cleared (any in-progress click sequence is abandoned)
3. The cursor changes (crosshair for measurement tools, text-I-beam for text, drawing pencil icon for freehand, default arrow for pan)
4. A hint appears at the top of the canvas describing the next expected click

---

## Each tool in detail

### Pan tool

The default. No clicks needed — the entire stage is `draggable={true}`. Konva handles drag internally without React state churn. On `dragend`, sync the final stage position back to React state for the offset.

Mouse wheel always zooms regardless of active tool (pan tool just makes wheel + drag feel cohesive).

### Line tool

Click 1: drop point A in pendingPoints. Show a yellow circle at A.
Click 2: create a `LineShape` with `a` and `b`, clear pendingPoints. Add to shapes.

While 1 point is pending, optionally show a "rubber band" preview line from A to the current cursor position. This is implemented as an extra shape on the overlayLayer that updates on `mousemove` (throttled to ~60Hz).

The line renders as a Konva `Line` with two `Circle`s at the endpoints. Both circles are `draggable={true}`.

**Label:** the line's length appears at the midpoint. If calibrated, format as `"127.4 mm"`. If not, `"847 px"`.

### Polyline tool (your specified UX)

This is the chained-lines tool. Behavior:

1. Click 1: drop point A in pendingPoints. Show yellow circle.
2. Click 2: drop point B in pendingPoints. Now there are 2 points. Show a line A→B in preview color (yellow).
3. Click 3: drop point C in pendingPoints. Show A→B→C polyline preview.
4. ...continue indefinitely...
5. **End the chain** in any of three ways:
   - Double-click anywhere
   - Press Escape
   - Click a "Done" button that appears in the top hint bar after 2+ points
6. On end: convert pendingPoints to a `PolylineShape`, clear pendingPoints.

**Cmd/Ctrl+Z while pendingPoints is non-empty:** removes the last pending point (does not affect history stack). This is the "undo last point" affordance.

**Rubber band preview:** while in pendingPoints state with N points, show:
- Solid yellow polyline through all N points
- Dashed yellow line from the last point to the current cursor position

The rubber band updates on `mousemove`.

**Label:** each segment shows its individual length at its midpoint. The total path length shows at the last point with a `"Total: 423.5 mm"` label.

After completion, every point is draggable. Dragging a middle point bends the line at that vertex but keeps the chain connected. There's no "insert a new point in the middle" affordance for v1 (delete the polyline and redraw if needed).

### Angle tool

Click 1: first endpoint A.
Click 2: vertex (the corner of the angle).
Click 3: second endpoint B.

Renders as two line segments meeting at the vertex, with a small arc inside the angle and the angle value labeled near the vertex.

```
       a
        \
         \
          v ← angle measured here, e.g., "47.3°"
          /
         /
        /
       b
```

**Calculation:**

```typescript
function angleAtVertex(a: Point, vertex: Point, b: Point): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
```

This always returns the smaller of the two possible angles (0°–180°). For v1 that's correct.

### Cobb angle tool

Critical for spinal analysis. The user draws two independent lines (along two vertebral endplates), and the system measures the angle between them.

Click flow: 4 clicks total.

1. Click 1: first endpoint of line 1
2. Click 2: second endpoint of line 1
3. Click 3: first endpoint of line 2
4. Click 4: second endpoint of line 2

Between clicks 2 and 3, show line 1 in solid yellow, prompt user for line 2.

**Calculation:** find the angle between the two line directions.

```typescript
function cobbAngle(line1: {a: Point, b: Point}, line2: {a: Point, b: Point}): number {
  const v1x = line1.b.x - line1.a.x;
  const v1y = line1.b.y - line1.a.y;
  const v2x = line2.b.x - line2.a.x;
  const v2y = line2.b.y - line2.a.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, Math.abs(dot) / (mag1 * mag2)));  // abs for unsigned angle
  return (Math.acos(cos) * 180) / Math.PI;
}
```

Note `Math.abs(dot)` — Cobb angles are conventionally reported as unsigned (the magnitude of the curve, regardless of direction).

**Display:** render both lines in green, with extension dashed lines showing where the lines would intersect, and the angle labeled at the intersection point. If the lines are parallel (angle ≈ 0°), don't draw the extensions and label as `"0° (parallel)"`.

### Rectangle area tool

Drag-to-create. `mousedown` records topLeft. `mousemove` updates a preview. `mouseup` finalizes as a `RectShape`.

After creation, four corner handles are draggable. Dragging the top-left corner adjusts both `topLeft.x` and `topLeft.y`. Dragging the bottom-right corner adjusts both `bottomRight.x` and `bottomRight.y`. (For v1, no resize-from-edge handles; corners only.)

**Area:**

```typescript
function rectArea(r: RectShape, pixelsPerMm: number | null): { value: number; unit: string } {
  const widthPx = Math.abs(r.bottomRight.x - r.topLeft.x);
  const heightPx = Math.abs(r.bottomRight.y - r.topLeft.y);
  const areaPx2 = widthPx * heightPx;
  if (pixelsPerMm) {
    const areaMm2 = areaPx2 / (pixelsPerMm * pixelsPerMm);
    return { value: areaMm2, unit: 'mm²' };
  }
  return { value: areaPx2, unit: 'px²' };
}
```

Note the squared conversion for area: `mm² = px² / (px/mm)²`.

### Ellipse area tool

Drag-to-create. The drag defines a bounding box, the ellipse is inscribed in that box. Center is the bounding box center, radii are half the width and height.

**Area:** `π × radiusX × radiusY` (in pixels², then convert to mm² via the same squared formula above).

### Arrow tool

Like the line tool but with an arrowhead at point B. Konva has a built-in `Arrow` component. Default arrowhead size is fine; no need to expose configuration in v1.

### Text tool

Click 1: place a text shape at the click position. Default text is `"Label"`. Immediately enter edit mode — render an HTML `<input>` overlay positioned over the text shape, focused, with the text selected.

On Enter or blur: commit the text, exit edit mode.
On Escape: cancel — if the text is the default `"Label"`, delete the shape; otherwise revert to the previous text.

Text size is stored in image-space pixels. This means as the user zooms, the text stays "anchored" to the image (12px text on the image stays 12px on the image). Some viewers prefer screen-space text (constant on-screen size regardless of zoom). For v1, image-space is simpler and matches how measurement labels work.

### Freehand tool

`mousedown`: start a new path, push the click position to a points array.
`mousemove`: every ~16ms (one frame), append the cursor position to the array.
`mouseup`: convert the points array to a `FreehandShape`.

The shape renders as a Konva `Line` with `tension={0.5}` (a Catmull-Rom spline) for smooth curves. Endpoints are not draggable for freehand — modify by deleting and redrawing. (The smoothing makes individual point manipulation feel weird anyway.)

Path simplification (Douglas-Peucker) could reduce point count and storage size, but for v1 just store the raw mousemove samples. Performance is fine.

### Calibration tool

This is the special tool — it doesn't add a permanent shape; it sets the session's `pixelsPerMm`.

Click 1: first endpoint of reference line. Yellow circle.
Click 2: second endpoint. Yellow line connects them. **Modal opens.**

The modal:

```
┌─────────────────────────────────────────┐
│  Set reference length                    │
│                                          │
│  The line you drew is 423.7 px.          │
│  Enter its real-world length in mm.      │
│                                          │
│  ┌──────────────┐                        │
│  │     100      │ mm                     │
│  └──────────────┘                        │
│                                          │
│  [ Cancel ]              [ Set ]         │
└─────────────────────────────────────────┘
```

User enters a number, clicks Set. The viewer calculates `pixelsPerMm = pixelDistance / mm` and stores it on the active session.

A `CalibrationShape` is also added to the canvas (so the user can see what they calibrated against and recalibrate by dragging its endpoints if needed). It renders distinctly (dashed line, ruler-like end caps) so it's not confused with regular line measurements.

After calibration, all measurement labels switch from `"px"` and `"px²"` units to `"mm"` and `"mm²"` units. This is a derived display formatting choice; the underlying shape data still stores image-space pixel coordinates.

If the user recalibrates later (drags a calibration shape's endpoints, or runs the calibrate tool again), all measurement labels update live.

---

## The right panel: measurements list

The right panel shows a live list of all measurements on the active image, grouped by type:

```
MEASUREMENTS                    7
─────────────────────────────────
LINES (3)
  L1   127.4 mm        ×
  L2    89.2 mm        ×
  L3    45.1 mm        ×

ANGLES (2)
  A1   47.3°           ×
  A2   12.8°           ×

COBB ANGLES (1)
  C1   23.5°           ×

RECTANGLES (1)
  R1   1238 mm²        ×

CALIBRATION
  ✓ 4.24 px/mm
```

Each row shows the measurement value and a delete button. Clicking a row in the list highlights the corresponding shape on the canvas (sets `selected: true` briefly). This bidirectional link helps users find a specific measurement.

The list does not include annotations (text, arrow, freehand) since those don't have measurement values. Those are controlled via canvas interaction only.

---

## AI landmark detection

The full AI integration in detail.

### UI flow

1. User loads an image
2. User clicks "Detect landmarks" button in the toolbar
3. Button shows a loading spinner; canvas dims slightly
4. After 3–8 seconds, ~16 cyan circles appear on the image with labels (e.g., "L femoral head", "R iliac crest", "S2 tubercle")
5. User drags any landmark that's misplaced. As points move, the right panel's measurement values update live
6. User can also delete a landmark (click + Backspace) or add one manually (click "Add landmark" → click on canvas → label dropdown)

### API contract

**Client → Server: POST /api/viewer/detect-landmarks**

```json
{
  "imageBase64": "iVBORw0KG...",
  "imageWidth": 3000,
  "imageHeight": 3000
}
```

**Server → Client (success):**

```json
{
  "landmarks": [
    {
      "name": "top_of_left_femoral_head",
      "displayName": "L femoral head",
      "x": 1245.7,
      "y": 1893.2,
      "confidence": 0.85
    },
    ...
  ]
}
```

Coordinates are returned in **image space**, ready to use as-is.

**Server → Client (error):**

```json
{ "error": "image_too_large" | "vision_api_error" | "rate_limited" }
```

### Server-side prompt

The Next.js API route at `/api/viewer/detect-landmarks/route.ts` calls the Anthropic Messages API with a structured prompt. Sketch:

```typescript
const SYSTEM_PROMPT = `You are a medical imaging assistant specialized in identifying
anatomical landmarks on standing anteroposterior (AP) pelvic X-rays for chiropractic
analysis. Return landmark coordinates in pixel coordinates of the original image.`;

const USER_PROMPT = `Identify the following 16 anatomical landmarks on this pelvic X-ray.
Return them as a JSON array. Each landmark must have:
- name: snake_case identifier from the list below
- displayName: short human-readable label
- x: x-coordinate in pixels (0 to ${imageWidth})
- y: y-coordinate in pixels (0 to ${imageHeight})
- confidence: 0.0 to 1.0 indicating your confidence

Required landmarks:
1. top_of_left_femoral_head
2. top_of_right_femoral_head
3. top_of_left_iliac_crest
4. top_of_right_iliac_crest
5. bottom_of_left_ischial_tuberosity
6. bottom_of_right_ischial_tuberosity
7. second_sacral_tubercle
8. center_of_symphysis_pubis
9. left_sacral_groove
10. right_sacral_groove
11. lateral_aspect_of_left_sacrum
12. lateral_aspect_of_right_sacrum
13. medial_aspect_of_left_sacrum
14. medial_aspect_of_right_sacrum
15. lateral_aspect_of_left_ilium
16. lateral_aspect_of_right_ilium

Return ONLY the JSON array. No prose, no markdown fences.`;
```

Use `claude-opus-4-7` for best vision performance. Set `max_tokens` to ~2000 (enough for 16 landmark JSON entries).

### Parsing and validation

The server validates Claude's response:

- Parse as JSON. If parsing fails, return `vision_api_error`.
- Check the array has exactly 16 entries with the expected names. If not, log and return what came back anyway (frontend handles missing landmarks gracefully).
- Clamp coordinates to image bounds (Claude occasionally returns slightly out-of-range values).
- Default `confidence` to 0.5 if missing.

### Honest accuracy expectations

(Repeated from Part 1 because it matters for the UX design.)

- Easy landmarks (femoral heads, symphysis pubis): expect 5–15mm error. User drags slightly.
- Hard landmarks (sacrum): expect 15–30mm error. User drags substantially.
- Total user effort: 12-ish drags, vs 16 from-scratch placements without AI.

The win is real but modest. **Do not market this as "AI does the analysis."** Frame in the UI as: "AI suggests starting positions — review and adjust each landmark."

### Downstream measurements (FHHD, ICHD, etc.)

Once landmarks are placed, automatically compute the 10 pelvic alignment parameters from the Heliyon paper:

| Parameter | Formula |
|---|---|
| FHHD (femoral head height difference) | `\|y_left_femoral_head − y_right_femoral_head\|` (then convert to mm) |
| ICHD (iliac crest height difference) | `\|y_left_iliac_crest − y_right_iliac_crest\|` |
| ALFHRF (angle between femoral horizontals) | angle between the femoral-head horizontal line and the image horizontal |
| Left/Right IM | distance from iliac crest apex to ischial tuberosity, parallel to femur baseline |
| ICHD | iliac crest height difference |
| DOCS | distance between symphysis pubis and S2-tubercle plumb |
| Left/Right SAM | sacral ala measurements |
| Left/Right ISM | iliac shadow measurements |

Display these in the right panel under a "Pelvic Analysis" section, only visible when landmarks are present. Each value updates live as landmarks are dragged.

### Privacy disclaimer (mandatory in UI)

Above the "Detect landmarks" button, show:

> ⓘ X-rays are processed by Claude (Anthropic) to detect landmarks. Do not upload images containing visible patient identifiers.

This is non-negotiable for v1. Hide the AI feature entirely if the image will eventually contain PHI in v2.

---

## Export and print

### PNG export

Konva exposes `stage.toDataURL({ pixelRatio: 2 })`. This rasterizes the entire stage (image + all shapes) at 2× resolution. For a 1024×768 viewport, the export is 2048×1536.

```typescript
const handleExportPng = () => {
  if (!stageRef.current) return;
  const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
  const link = document.createElement('a');
  link.download = `xray-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
};
```

For a "clean" export (just the image at native resolution with shapes overlaid), set `pixelRatio` based on `imageNaturalWidth / stageWidth`. This gets tricky with rotation/flip — for v1, just export at viewport resolution × 2 and accept that pan/zoom state is baked into the export.

### Print

Use a print-only stylesheet that hides the toolbar/sidebars and lets the canvas fill the page:

```css
@media print {
  .toolbar, .sidebar, .right-panel { display: none; }
  .canvas-container { width: 100vw; height: 100vh; }
  body { background: white; }
}
```

Then call `window.print()` from a Print button. The browser handles the rest.

For v1, this is the "good enough" print. A real medical print workflow needs DICOM print compatibility, page headers with patient info, etc. — all v3 work.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Pan tool |
| `L` | Line tool |
| `P` | Polyline tool |
| `A` | Angle tool |
| `B` | Cobb angle tool |
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `T` | Text tool |
| `D` | Freehand draw tool |
| `C` | Calibrate tool |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected shape |
| `Escape` | Cancel current tool action / end polyline |
| `0` | Fit to viewport |
| `+` / `-` | Zoom in / out |
| `[` / `]` | Rotate -90° / +90° |
| `H` | Flip horizontal |
| `Shift+H` | Flip vertical |
| `I` | Invert |
| `F` | Fullscreen |
| `J` / `K` | Previous / next image |
| `Cmd/Ctrl+S` | Export as PNG |

---

## What you can build after Part 3

By the end of Part 3's implementation, the viewer is feature-complete for v1:

- All 11 image manipulation features
- All 7 measurement tools with calibration
- All 3 annotation tools
- Multi-image session and side-by-side comparison
- AI landmark detection with draggable points and live pelvic-analysis measurements
- PNG export and print
- Keyboard shortcuts

Total: 27 user-facing features, ~3 weeks of solo build time, one file structure, three docs.

---

## Related

- **Part 1** — scope, decisions, build order, AI strategy, the original "why these features and not others"
- **Part 2** — canvas architecture, transform math, Konva setup, view state management

---

🦴 **SmartChiro Viewer — Part 3 of 3**

# SmartChiro Viewer — Part 2: Canvas Engine

> **Series**: [Overview & Architecture](./viewer-spec-part1-overview.md) · [Canvas Engine] · [Tools, Measurements & AI Landmarks](./viewer-spec-part3-tools.md)

---

## Overview

This part covers the **canvas engine** — the viewport that hosts the image and all annotation shapes. It defines the Konva stage layout, the transform pipeline (pan/zoom/rotate/flip), the coordinate system, the rendering layers, image filters for brightness/contrast/invert, and the data shape for the canvas state.

Reading this part should give you everything you need to build Phases 1–2 from Part 1's build order — image loads, image manipulates, view resets cleanly. Drawing tools and measurements are Part 3's job.

---

## Stage architecture

A Konva `Stage` contains three `Layer`s, in z-order from back to front:

```
┌────────────────────────────────────┐
│  Stage (the <canvas> wrapper)     │
│  ┌──────────────────────────────┐ │
│  │  imageLayer                  │ │  ← the X-ray image
│  │     <Image src={...} />      │ │
│  └──────────────────────────────┘ │
│  ┌──────────────────────────────┐ │
│  │  shapesLayer                 │ │  ← measurements, annotations, landmarks
│  │     <Line> <Circle> <Text>   │ │
│  └──────────────────────────────┘ │
│  ┌──────────────────────────────┐ │
│  │  overlayLayer                │ │  ← magnify lens, pending click previews
│  │     <Group>                  │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘
```

**Why three layers, not one:**

- **Performance.** Konva re-renders a layer when any of its children change. Putting the image (which never re-renders during interaction) on its own layer means dragging a shape doesn't trigger an image redraw. For a 4000×4000 X-ray, this is the difference between smooth dragging and 200ms hitches.
- **Hit detection scope.** Mouse events on `shapesLayer` only check shape children, not the image. The image layer's `listening` is set to `false` so it never absorbs clicks.
- **z-order isolation.** The magnify lens always renders above shapes, regardless of when shapes were added.

---

## The transform pipeline

The viewer applies a stack of transforms to convert "image pixel at (x,y)" to "screen pixel at (sx,sy)":

```
                 ┌─────────────────────────────────────────────┐
                 │                                              │
   image (x,y) ──┤  1. Translate by (-cx, -cy)                  │── output (sx,sy)
                 │     (move image center to origin)            │
                 │  2. Apply flip                               │
                 │     (scale by ±1 horizontally/vertically)    │
                 │  3. Apply rotation                           │
                 │     (0°, 90°, 180°, or 270°)                 │
                 │  4. Translate back by (+cx, +cy)             │
                 │  5. Apply scale (zoom)                       │
                 │  6. Translate by (offsetX, offsetY) (pan)    │
                 │                                              │
                 └─────────────────────────────────────────────┘

where  cx = imageNaturalWidth  / 2
       cy = imageNaturalHeight / 2
```

The order matters. Rotating *before* zooming means the image rotates around its own center, not around the screen origin. Flipping *before* rotating means flips behave intuitively regardless of rotation. This is the natural order Konva uses internally when you set Stage properties.

In Konva, the entire stack is expressed as Stage properties, so we don't compute it manually — but we **do** need to invert it for mouse-click coordinate conversion (see "screenToImage" below).

### State variables

| Variable | Type | Default | Meaning |
|---|---|---|---|
| `scale` | `number` | computed at fit | Zoom level. `1` = 1 image pixel per screen pixel |
| `offset` | `{ x: number, y: number }` | computed at fit | Stage-level translation in screen pixels |
| `rotation` | `0 \| 90 \| 180 \| 270` | `0` | Rotation in degrees, clockwise |
| `flipH` | `boolean` | `false` | Mirror horizontally |
| `flipV` | `boolean` | `false` | Mirror vertically |

These five values fully describe the current view. Resetting them to defaults (and recomputing fit) returns to the initial fit-to-viewport view.

### Mapping to Konva Stage props

```typescript
<Stage
  width={containerWidth}
  height={containerHeight}
  x={offset.x}
  y={offset.y}
  scaleX={scale}
  scaleY={scale}
>
  <Layer
    rotation={rotation}
    scaleX={flipH ? -1 : 1}
    scaleY={flipV ? -1 : 1}
    offsetX={imageNaturalWidth / 2}
    offsetY={imageNaturalHeight / 2}
    x={imageNaturalWidth / 2}
    y={imageNaturalHeight / 2}
  >
    <Image image={imageEl} />
  </Layer>
  {/* shapes and overlay layers same rotation/flip */}
</Stage>
```

The `offset` + `x`/`y` trick on the Layer makes the rotation pivot the image's own center instead of (0,0).

### Fit-to-viewport calculation

When an image loads, compute the initial scale and offset:

```typescript
function fitToViewport(
  imageW: number,
  imageH: number,
  containerW: number,
  containerH: number,
  padding = 0.95  // 5% margin
): { scale: number; offset: { x: number; y: number } } {
  const scaleX = containerW / imageW;
  const scaleY = containerH / imageH;
  const fit = Math.min(scaleX, scaleY) * padding;
  return {
    scale: fit,
    offset: {
      x: (containerW - imageW * fit) / 2,
      y: (containerH - imageH * fit) / 2,
    },
  };
}
```

This is also used by the "Reset view" and "Fit" buttons.

---

## Coordinate conversion

Two functions matter:

- `imageToScreen(imagePoint)` — given a point in image pixel space, where does it appear on screen?
- `screenToImage(screenPoint)` — given a mouse click in screen space, what image pixel was clicked?

We **store all shape coordinates in image space**, not screen space. This is critical: if you store screen coordinates, every pan/zoom/rotation invalidates every shape. Image-space coordinates are stable through any view transform — a measurement line drawn between two anatomical landmarks stays anchored to those landmarks no matter how the user pans, zooms, or rotates.

### imageToScreen

Konva does this for free. Once you've placed a shape on the shapesLayer with image-space coordinates, the layer's transform handles the conversion. So in practice, you never call `imageToScreen` manually — you just pass image coordinates to Konva shape props.

### screenToImage (the inverse transform)

This is the one you have to write. Konva exposes it as `stage.getRelativePointerPosition()` for the stage and `layer.getRelativePointerPosition()` for a layer. The layer version returns the pointer position in the layer's local coordinate space — which, because we set up the layer with the image's transforms, is image space. Use that.

```typescript
// Inside a click handler on shapesLayer
const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
  const layer = e.target.getLayer();
  if (!layer) return;
  const pos = layer.getRelativePointerPosition();
  if (!pos) return;
  // pos.x, pos.y are now in image-space pixels
  handleClickInImageSpace(pos);
};
```

This handles all five transforms (pan, zoom, rotation, flip H, flip V) automatically. **Do not roll your own inverse transform.** The matrix math is correct in theory but easy to get subtly wrong, and Konva's implementation is battle-tested.

### Why this matters for the polyline tool

User clicks point 1 at screen position (400, 300). We convert to image space → (1247.3, 894.6). Stored.
User pans the image. Now point 1 is at screen position (250, 180), but it's still (1247.3, 894.6) in image space. The line still anchors there.
User clicks point 2 at screen position (520, 410). Convert to image space → (1483.9, 1031.2). Store. Draw a line from (1247.3, 894.6) to (1483.9, 1031.2) in image space.

All distance calculations use image-space coordinates. The pixel-to-mm conversion (calibration) only matters at display time, not at storage time.

---

## Zoom-on-cursor math

When the user wheels over the canvas, the image should zoom centered on the cursor — not on the image center. This is the single most common UX issue with naïve zoom implementations.

### The principle

The image-space point under the cursor must remain under the cursor after the zoom. If the cursor is at screen position (mx, my) and that's the image-space point (ix, iy), then before and after zoom:

```
mx = ix * scale + offsetX
my = iy * scale + offsetY
```

If we change `scale` to `newScale`, we need to also change `offsetX` and `offsetY` so the equation still holds with the same `(ix, iy)`.

### The implementation

```typescript
const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
  e.evt.preventDefault();

  const stage = e.target.getStage();
  if (!stage) return;
  const oldScale = stage.scaleX();

  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  // The point in image-space currently under the cursor
  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  // New scale (clamped)
  const direction = e.evt.deltaY < 0 ? 1 : -1;
  const factor = 1.1;
  let newScale = direction > 0 ? oldScale * factor : oldScale / factor;
  newScale = Math.max(0.05, Math.min(20, newScale));

  // New offset to keep mousePointTo under the cursor
  const newOffset = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  };

  // Update state — Stage props re-render
  setScale(newScale);
  setOffset(newOffset);
};
```

The key line is `mousePointTo`: it's the inverse of the screen→image transform, ignoring rotation and flip (which is fine for zoom, since rotation/flip don't change which image-space point is under the cursor).

Min scale `0.05` (image fills 1/20 of viewport) prevents the image from disappearing. Max scale `20` (1 image pixel = 20 screen pixels) prevents extreme pixelation that breaks measurement precision.

---

## Image filters (brightness, contrast, invert)

Konva has built-in filter support via the `Image.filters` array. The filters are applied to a cached version of the image — without `cache()`, the filters never apply.

```typescript
import { Image as KonvaImage, Filters } from 'konva';

// Inside the Image element
<Image
  ref={imageRef}
  image={imageEl}
  filters={[Filters.Brighten, Filters.Contrast, ...(inverted ? [Filters.Invert] : [])]}
  brightness={(brightness - 100) / 100}  // Konva expects -1 to 1
  contrast={(contrast - 100)}              // Konva expects -100 to 100
/>
```

After mounting, call `imageRef.current?.cache()` once. Re-call `cache()` whenever the image source changes (new image loaded, rotated, flipped). **Do not** re-call `cache()` on every brightness slider tick — Konva detects filter parameter changes and re-applies filters automatically as long as the cache exists.

### Why brightness/contrast use Konva instead of CSS filter

CSS `filter: brightness(...) contrast(...)` is simpler, but it applies to the entire DOM element including measurement lines and labels. We only want to filter the image, not the annotations. Konva filters apply per-shape, which is what we need.

---

## Magnify lens

The magnify lens is a separate small Konva Stage that follows the cursor when active. It renders the same image at a higher zoom level, clipped to a circle.

```
Container layout when magnify lens is active:

  ┌─── main viewport ───────────────────┐
  │                                      │
  │      X-ray image                     │
  │                ┌──────┐              │
  │                │ ⊙   │ ← lens (150px)│
  │                │      │              │
  │                └──────┘              │
  │                                      │
  └──────────────────────────────────────┘
```

### Implementation sketch

The lens is a fixed-size 150×150 px Konva Stage positioned absolutely, with its own image showing a zoomed crop of the area around the cursor.

```typescript
function MagnifyLens({ imageEl, cursorPos, mainScale, mainOffset }) {
  const lensSize = 150;
  const lensZoom = 2.5;  // 2.5x more zoomed than main view

  // Find the image-space point under the cursor
  const imagePoint = {
    x: (cursorPos.x - mainOffset.x) / mainScale,
    y: (cursorPos.y - mainOffset.y) / mainScale,
  };

  // Place the lens stage so the image-space point is at lens center
  const lensScale = mainScale * lensZoom;
  const lensImageOffset = {
    x: lensSize / 2 - imagePoint.x * lensScale,
    y: lensSize / 2 - imagePoint.y * lensScale,
  };

  return (
    <div
      className="absolute pointer-events-none rounded-full overflow-hidden border-2 border-emerald-400 shadow-2xl"
      style={{
        width: lensSize,
        height: lensSize,
        left: cursorPos.x + 20,
        top: cursorPos.y + 20,
      }}
    >
      <Stage width={lensSize} height={lensSize}>
        <Layer x={lensImageOffset.x} y={lensImageOffset.y} scaleX={lensScale} scaleY={lensScale}>
          <Image image={imageEl} />
        </Layer>
      </Stage>
    </div>
  );
}
```

The lens does **not** show measurement annotations — only the raw image. This keeps it useful for spotting fine anatomical detail without visual clutter.

---

## State management

### Top-level component state

```typescript
// Per-image state
type ImageSession = {
  id: string;
  src: string;            // blob URL
  imageEl: HTMLImageElement | null;
  naturalWidth: number;
  naturalHeight: number;
  shapes: Shape[];        // all measurements + annotations + landmarks
  calibration: { pixelsPerMm: number } | null;
  // View state is per-image too — switching images preserves zoom/pan
  view: {
    scale: number;
    offset: { x: number; y: number };
    rotation: 0 | 90 | 180 | 270;
    flipH: boolean;
    flipV: boolean;
    brightness: number;
    contrast: number;
    inverted: boolean;
  };
};

// Top-level
const [sessions, setSessions] = useState<ImageSession[]>([]);
const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
const [comparisonMode, setComparisonMode] = useState<{ leftId: string; rightId: string } | null>(null);
const [tool, setTool] = useState<Tool>('pan');
const [pendingPoints, setPendingPoints] = useState<Point[]>([]);
const [history, setHistory] = useState<HistoryEntry[]>([]);  // for undo/redo
const [historyIndex, setHistoryIndex] = useState(-1);
```

### Why per-image view state

When the user switches from image A to image B and back to A, the user expects to see image A in the same zoom/pan/brightness state they left it. Storing view state per-session makes this automatic.

### Why a `useReducer` for shapes

Undo/redo. Every shape mutation goes through a reducer:

```typescript
type ShapeAction =
  | { type: 'ADD'; shape: Shape }
  | { type: 'UPDATE'; id: string; patch: Partial<Shape> }
  | { type: 'DELETE'; id: string }
  | { type: 'CLEAR' };

function shapesReducer(state: Shape[], action: ShapeAction): Shape[] {
  switch (action.type) {
    case 'ADD': return [...state, action.shape];
    case 'UPDATE': return state.map(s => s.id === action.id ? { ...s, ...action.patch } : s);
    case 'DELETE': return state.filter(s => s.id !== action.id);
    case 'CLEAR': return [];
  }
}
```

The history is an array of shape arrays (or, for memory efficiency, action deltas). Cmd/Ctrl+Z reverts to the previous entry; Cmd/Ctrl+Shift+Z re-applies.

For v1, simple snapshot history (full shapes array per entry) is fine. Memory is cheap; v1 sessions won't exceed a few hundred shapes.

---

## Rendering pipeline

When state changes, here's what re-renders:

| State change | What re-renders |
|---|---|
| New image loaded | imageLayer fully (new `<Image>` source); shapesLayer cleared if new session |
| Pan/zoom | Stage props update — Konva handles efficiently, no JS re-render of shapes |
| Rotate/flip | imageLayer + shapesLayer (transform changes propagate) |
| Brightness/contrast/invert | imageLayer's `<Image>` filter props (Konva detects, recomputes filter) |
| Add shape | shapesLayer (Konva diffs, only new shape is added) |
| Drag a shape's point | shapesLayer (only the shape being dragged updates in place) |
| Switch active image | Full canvas swap (different ImageSession, different shapes) |
| Toggle magnify lens | overlayLayer only |

Critical: the imageLayer should have `listening={false}` so it never absorbs clicks. All click handling goes through the shapesLayer.

---

## Performance notes

For v1, none of these are bottlenecks, but worth knowing:

- **Cache the image.** Without `imageRef.current?.cache()`, filters won't apply. With it, filters are computed once and re-used until the cache is invalidated.
- **Avoid setState in mousemove handlers.** Pan and drag use Konva's built-in `draggable` which mutates the node directly without React re-renders. Read the final position only on `dragend`.
- **Throttle wheel events.** Wheel events fire fast (60+ Hz). Konva keeps up, but if you do extra work in the handler (like updating React state on every wheel event), batch it.
- **Use `perfectDrawEnabled={false}` on shapes.** Skips an extra hidden-canvas pass for hit detection. Fine unless you have shapes with semi-transparent fills that need pixel-perfect hit detection (you don't).

---

## What you can build after Part 2

By the end of Part 2's implementation:

- An image loads and fits the viewport
- Pan, zoom (cursor-centered), rotate 90°, flip H/V work correctly
- Brightness, contrast, invert work and don't affect future shapes
- Reset view returns to the fit state
- Fullscreen toggle works
- Magnify lens follows the cursor when activated
- Multiple images load, you can switch between them, view state persists per-image
- Coordinate conversion (`screenToImage`) is implemented and ready for tools

What's missing: tools (line, polyline, angle, Cobb, ellipse, rectangle, calibration), annotations (text, arrow, freehand), AI landmarks, exports. All of that is Part 3.

---

## Related

- **Part 1** — scope, decisions, build order, AI strategy
- **Part 3** — drawing tools, measurement formulas, calibration data flow, AI integration

---

🦴 **SmartChiro Viewer — Part 2 of 3**

# Multi-View Mode Fix — Comparison-Only with Drawing Lockout

## Status

Not Started

## Goals

1. **Disable drawing tools in multi-view** — Grey out all drawing/measurement tools when view mode is Side by Side or 2x2 Grid
2. **Comparison-only messaging** — Show clear UX feedback that multi-view is for comparison only
3. **Auto-switch to single on tool select** — If user clicks a drawing tool while in multi-view, auto-switch back to single mode
4. **Rename `1x1` view mode to `side-by-side`** — Fix confusing internal naming
5. **Active slot zoom controls** — Wire ZoomBar to the active ViewportCell in multi-view
6. **Zoom hint in multi-view** — Show "Ctrl + Scroll to zoom" tooltip on hover

---

## Problem Statement

When users switch from Single view to Side by Side or 2x2 Grid:
- All drawing tools appear active in the toolbar but **do nothing** — pointer events are captured by ViewportCell's pan handler
- No annotations are visible — ShapeRenderer/SelectionOverlay are only rendered in single mode
- No zoom controls — ZoomBar is only rendered in single mode
- No error feedback — users click tools, try to draw, and nothing happens

This makes multi-view feel completely broken. Users report "can't even draw on the images."

---

## Architecture Analysis

### Current Flow (Broken)

```
AnnotationCanvas render:
  if viewMode === "single":
    → Image layer + SVG shapes + pointer handlers + ZoomBar  ← DRAWING WORKS
  else:
    → MultiViewGrid (pan/zoom only, no shapes, no drawing)   ← DRAWING BROKEN
```

The `AnnotationCanvas.tsx` render has a hard branch at line 695. The entire drawing pipeline (pointer events → useDrawingTools → ShapeRenderer → SelectionOverlay → DrawingConfirmation) is only wired into the single-mode branch.

`MultiViewGrid.tsx`'s `ViewportCell` has its own independent pointer handlers (`handlePointerDown/Move/Up`) that unconditionally pan. There's no tool awareness, no shape rendering, and no SVG overlay.

### Target Flow (Fixed)

```
AnnotationCanvas render:
  if viewMode === "single":
    → Full drawing canvas (unchanged)
  else:
    → MultiViewGrid (comparison-only)
    → Toolbar tools greyed out with tooltip "Switch to Single view to draw"
    → ZoomBar wired to active slot
    → Status bar shows "Comparison Mode"
```

---

## Feature 1: Disable Drawing Tools in Multi-View

### Behavior

When `viewMode !== "single"`:
- All drawing tools in `AnnotationToolbar` become **disabled** (greyed out, not clickable)
- Disabled tools: Freehand (P), Line (L), Arrow (A), Text (T), Eraser (X), Ruler (M), Angle (Shift+M), Cobb Angle (Cmd+Shift+M)
- **Pan tool (H) stays enabled** — it's useful for multi-view navigation
- Keyboard shortcuts for disabled tools are also blocked
- Undo/Redo buttons remain enabled (they affect the single-view shapes)

### Disabled Tool Appearance

- Icon + label: `opacity: 0.35`
- Cursor: `not-allowed`
- No hover highlight
- Tooltip changes to: `"{Tool Name} — Switch to Single view to draw"`

### Files to Modify

**`src/components/annotation/AnnotationToolbar.tsx`**
- Accept new prop: `disabledTools: ToolId[]`
- Apply disabled styling when tool is in the disabled list
- Prevent `onToolChange` callback for disabled tools
- Update tooltip text for disabled tools

**`src/components/annotation/AnnotationCanvas.tsx`**
- Compute `disabledTools` array based on `viewMode`
- Pass to `AnnotationToolbar`
- Block keyboard shortcuts for disabled tools when in multi-view

### Implementation

```tsx
// In AnnotationCanvas.tsx
const disabledTools: ToolId[] = viewMode !== "single"
  ? ["freehand", "line", "arrow", "text", "eraser", "ruler", "angle", "cobb_angle"]
  : [];

// In AnnotationToolbar.tsx
const isDisabled = disabledTools.includes(tool.id);

<button
  disabled={isDisabled}
  onClick={() => !isDisabled && onToolChange(tool.id)}
  title={isDisabled ? `${tool.label} — Switch to Single view to draw` : tool.tooltip}
  style={{
    opacity: isDisabled ? 0.35 : 1,
    cursor: isDisabled ? "not-allowed" : "pointer",
  }}
>
```

---

## Feature 2: Auto-Switch to Single on Tool Select

### Behavior

As an alternative to just blocking tools, provide a smoother UX:

- When user clicks a **disabled drawing tool** in multi-view, show a toast/notification:
  > "Switched to Single view for drawing"
- Automatically set `viewMode = "single"`
- Activate the clicked tool
- The primary X-ray (slot 0) stays loaded in single view

This keeps the flow non-blocking — users don't get stuck wondering why tools don't work.

### Implementation

```tsx
// In AnnotationCanvas.tsx - toolbar onToolChange handler
onToolChange={(tool) => {
  if (viewMode !== "single" && tool !== "hand") {
    setViewMode("single");
    // Optional: show toast "Switched to Single view for drawing"
  }
  if (drawing.pendingShape) drawing.acceptPending();
  interaction.setActiveTool(tool);
}}
```

---

## Feature 3: Comparison Mode Status Indicator

### Behavior

When in multi-view mode, show a visual indicator so users understand the context:

- **StatusBar**: Replace cursor position readout with `"Comparison Mode — Side by Side"` or `"Comparison Mode — 2x2 Grid"`
- **StatusBar color**: Use `#0570DE` (info blue) text for the comparison mode label
- Keep shape count, save status, and calibration indicator visible

### Files to Modify

**`src/components/annotation/StatusBar.tsx`**
- Accept new prop: `viewMode: ViewMode`
- When `viewMode !== "single"`, show comparison mode label instead of cursor coordinates

**`src/components/annotation/AnnotationCanvas.tsx`**
- Pass `viewMode` to `StatusBar`

### Implementation

```tsx
// In StatusBar.tsx
{viewMode !== "single" ? (
  <span style={{ color: "#0570DE", fontSize: 11, fontWeight: 500 }}>
    Comparison Mode — {viewMode === "side-by-side" ? "Side by Side" : "2×2 Grid"}
  </span>
) : (
  <span>x: {cursorPosition.x} y: {cursorPosition.y}</span>
)}
```

---

## Feature 4: Rename `1x1` View Mode to `side-by-side`

### Rationale

The current `1x1` name is misleading — it renders 2 columns x 1 row (a 1x2 grid). The UI label says "Side by Side" but the code says `1x1`. This causes confusion.

### Changes

**`src/types/annotation.ts`**
```diff
- export type ViewMode = "single" | "1x1" | "2x2";
+ export type ViewMode = "single" | "side-by-side" | "2x2";
```

**`src/components/annotation/ViewModeSwitcher.tsx`**
```diff
- { id: "1x1", label: "Side by Side", icon: ... },
+ { id: "side-by-side", label: "Side by Side", icon: ... },
```

**`src/components/annotation/MultiViewGrid.tsx`**
```diff
- const gridCols = viewMode === "1x1" ? 2 : 2;
- const gridRows = viewMode === "1x1" ? 1 : 2;
+ const gridCols = 2;
+ const gridRows = viewMode === "side-by-side" ? 1 : 2;
```

**`src/components/annotation/AnnotationCanvas.tsx`**
- Update all `"1x1"` references to `"side-by-side"`

---

## Feature 5: Multi-View Zoom Controls

### Behavior

When in multi-view mode, the `ZoomBar` should reflect and control the **active slot's** zoom level.

### Current Problem

`ZoomBar` reads from `useCanvasViewport` hook, which is only connected to the single-view canvas. In multi-view, each `ViewportCell` has its own local `useState<ViewportState>`. There's no way for `ZoomBar` to read or update a cell's zoom.

### Solution: Lift Viewport State

1. Move `ViewportState` out of `ViewportCell` into `AnnotationCanvas`
2. Store as `gridViewStates: ViewportState[]` (one per slot)
3. Pass the active slot's state to `ZoomBar`
4. Pass zoom callbacks (`onZoomIn`, `onZoomOut`, `onFit`) that update the active slot's state

### Files to Modify

**`src/components/annotation/MultiViewGrid.tsx`**
- Remove internal `viewState`/`setViewState` from `ViewportCell`
- Accept `viewState` and `onViewStateChange` as props
- Forward zoom/pan events to parent

**`src/components/annotation/AnnotationCanvas.tsx`**
- Add `gridViewStates` state array
- Pass active slot's state to `ZoomBar` when in multi-view
- Handle zoom callbacks from `ZoomBar` by updating the active slot's state

### Implementation

```tsx
// AnnotationCanvas.tsx
const [gridViewStates, setGridViewStates] = useState<ViewportState[]>([
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 1, panX: 0, panY: 0 },
  { zoom: 1, panX: 0, panY: 0 },
]);

const activeGridZoom = gridViewStates[activeSlotIndex]?.zoom ?? 1;

// In multi-view branch, also render ZoomBar:
<ZoomBar
  zoomPercent={Math.round(activeGridZoom * 100)}
  onZoomIn={() => updateGridSlotZoom(activeSlotIndex, z => z * 1.25)}
  onZoomOut={() => updateGridSlotZoom(activeSlotIndex, z => z / 1.25)}
  onFit={() => fitGridSlotToViewport(activeSlotIndex)}
  onActual={() => updateGridSlotZoom(activeSlotIndex, () => 1)}
  onCustomZoom={(z) => updateGridSlotZoom(activeSlotIndex, () => z)}
/>
```

---

## Feature 6: Zoom Hint in Multi-View

### Behavior

On first hover over a `ViewportCell`, show a subtle hint overlay:

```
Ctrl + Scroll to zoom  |  Drag to pan
```

- Shown as a semi-transparent pill at the bottom center of the cell
- Disappears after 3 seconds or on first interaction
- Only shown once per session (store in `useRef`)

### Implementation

```tsx
// In ViewportCell
const [showHint, setShowHint] = useState(true);
const hintShown = useRef(false);

const handleFirstInteraction = () => {
  setShowHint(false);
  hintShown.current = true;
};

{showHint && !hintShown.current && (
  <div style={{
    position: "absolute",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    padding: "4px 10px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  }}>
    Ctrl + Scroll to zoom &nbsp;|&nbsp; Drag to pan
  </div>
)}
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/types/annotation.ts` | Rename `ViewMode` value `"1x1"` → `"side-by-side"` |
| `src/components/annotation/AnnotationToolbar.tsx` | Add `disabledTools` prop, disabled styling, updated tooltips |
| `src/components/annotation/AnnotationCanvas.tsx` | Compute disabled tools, auto-switch logic, pass viewMode to StatusBar, lift grid viewport state, render ZoomBar in multi-view |
| `src/components/annotation/MultiViewGrid.tsx` | Lift viewport state to props, add zoom hint, rename `1x1` references |
| `src/components/annotation/ViewModeSwitcher.tsx` | Rename `1x1` → `side-by-side` |
| `src/components/annotation/StatusBar.tsx` | Add `viewMode` prop, show comparison mode label |

---

## Testing Checklist

### Manual Testing

- [ ] In Single view, all drawing tools work as before (no regression)
- [ ] Switch to Side by Side — drawing tools grey out, Pan stays enabled
- [ ] Switch to 2x2 Grid — drawing tools grey out, Pan stays enabled
- [ ] Click a greyed-out tool — auto-switches to Single view and activates the tool
- [ ] Keyboard shortcuts for drawing tools are blocked in multi-view
- [ ] Status bar shows "Comparison Mode — Side by Side" in multi-view
- [ ] Status bar shows cursor coordinates in single view (unchanged)
- [ ] ZoomBar reflects active slot's zoom in multi-view
- [ ] ZoomBar zoom in/out/fit buttons work on active slot
- [ ] Click different slots — ZoomBar updates to that slot's zoom
- [ ] Zoom hint appears on first hover, disappears after interaction
- [ ] Undo/Redo still works in multi-view (affects single-view shapes)
- [ ] Pan tool works in multi-view (drag to pan each cell)
- [ ] Ctrl+Scroll zooms in multi-view cells
- [ ] Switch back to Single from multi-view — all tools re-enable, shapes visible

### Unit Tests

- [ ] `AnnotationToolbar` renders disabled tools with correct styling
- [ ] `AnnotationToolbar` does not call `onToolChange` for disabled tools
- [ ] `ViewMode` type includes `"side-by-side"` (not `"1x1"`)
- [ ] `MultiViewGrid` uses correct grid dimensions for `"side-by-side"` (2 cols, 1 row)
- [ ] `MultiViewGrid` uses correct grid dimensions for `"2x2"` (2 cols, 2 rows)
- [ ] `StatusBar` shows comparison mode label when `viewMode !== "single"`

### Build

- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes
- [ ] All existing tests pass (no regressions)

---

## Out of Scope

These are future improvements, not part of this fix:

- **Per-slot annotation drawing** — Full support for drawing on different X-rays in different slots. Requires per-slot shapes arrays, per-slot annotation loading/saving, and tool-aware ViewportCell pointer events. This is a major architectural change.
- **Linked pan/zoom** — Synchronizing pan/zoom across all slots for comparison (already exists in the separate comparison view at `/api/xrays/[id]/export`)
- **Drag-and-drop X-ray reordering** — Rearranging X-rays between slots by dragging
- **Annotation overlay in multi-view** — Showing read-only annotation shapes on multi-view cells (would require loading annotations per X-ray)

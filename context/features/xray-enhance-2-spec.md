# X‑Ray Annotation Spec — Part 2: Enhancement

## Overview
Fix critical bugs and improve UX on the X-ray annotation page. Focused on image adjustments in multi-view, canvas stability, layout cleanup, and annotation persistence.

---

## Requirement 1: Brightness/Contrast Not Working in Multi-View

**Bug:** Brightness and contrast sliders have no effect when viewing X-rays in Side by Side or 2×2 Grid mode.

**Root cause:**
- In single view, `AnnotationCanvas.tsx` applies `imageAdj.cssFilter` to the `<img>` element (line ~721: `style={{ filter: imageAdj.cssFilter }}`)
- In multi-view, `MultiViewGrid.tsx` renders images via `ViewportCell` but does NOT apply any CSS filter — the `<img>` tag has no `filter` style property
- The `useImageAdjustments` hook generates the filter string correctly, but `MultiViewGrid` never receives or uses it

**Implementation:**
- Pass `imageAdj.cssFilter` (or the full `adjustments` state) from `AnnotationCanvas` down to `MultiViewGrid` as a prop
- In `MultiViewGrid.tsx` → `ViewportCell`, apply the filter to the `<img>` element: `style={{ filter: cssFilter, ... }}`
- Each viewport cell should apply the same global adjustments (brightness/contrast affect all panels equally)

**Files to touch:**
- `src/components/annotation/AnnotationCanvas.tsx` (pass cssFilter prop to MultiViewGrid)
- `src/components/annotation/MultiViewGrid.tsx` (accept and apply cssFilter on each cell's `<img>`)

---

## Requirement 2: Remove Invert and W/W Controls

**What:** Remove the "Invert" button and the "W/W" (Window Width) slider from the annotation header. Keep only Brightness, Contrast, and W/C (Window Center).

**Current state:**
- `AnnotationHeader.tsx` renders: Brightness slider, Contrast slider, Invert button, W/C slider, W/W slider
- `useImageAdjustments` hook manages all five values
- The CSS filter uses `invert()` — removing it simplifies the filter to `brightness(b) contrast(c)`

**Implementation:**
- In `AnnotationHeader.tsx`, remove the Invert button and W/W AdjustmentSlider from the JSX
- Remove `onInvertChange` and `onWindowWidthChange` props from the interface
- In `AnnotationCanvas.tsx`, stop passing those two props to AnnotationHeader
- In `useImageAdjustments.ts`, remove `invert` from the CSS filter string (keep the state for backward compat but don't render it in filter or UI)
- Keep W/C slider — it's useful for medical imaging window/level control

**Files to touch:**
- `src/components/annotation/AnnotationHeader.tsx` (remove Invert button + W/W slider)
- `src/components/annotation/AnnotationCanvas.tsx` (remove those props)
- `src/hooks/useImageAdjustments.ts` (simplify cssFilter to exclude invert)

---

## Requirement 3: Add Flip (Mirror) Button

**What:** Add a "Flip" button to horizontally mirror the X-ray image (left↔right), useful for comparing laterality.

**Implementation:**
- Add a `flipped` boolean state to `useImageAdjustments` hook (or a separate state in AnnotationCanvas)
- Add a "Flip" button in the `AnnotationHeader` next to the image adjustment controls
  - Icon: `FlipHorizontal2` from Lucide
  - Style: toggle button like the current Invert button (active = `#F0EEFF` bg + `#635BFF` text)
- Apply flip via CSS: add `scaleX(-1)` to the image container's transform
  - In single view: add `scaleX(-1)` to the image wrapper div in AnnotationCanvas
  - In multi-view: pass `flipped` prop to MultiViewGrid, apply to each cell
- **Important:** Flip is a view-only transform — it should NOT affect annotation coordinates or saved state. Apply it to the image layer container, not individual shapes.

**Files to touch:**
- `src/components/annotation/AnnotationHeader.tsx` (add Flip toggle button)
- `src/components/annotation/AnnotationCanvas.tsx` (add flipped state, apply scaleX(-1) to image container)
- `src/components/annotation/MultiViewGrid.tsx` (accept and apply flip)
- `src/hooks/useImageAdjustments.ts` (optionally add flipped state here)

---

## Requirement 4: Canvas Stability — "Screen Keeps Moving"

**Bug:** The canvas is too sensitive to scroll/trackpad input. Any scroll gesture zooms the canvas, making it hard to use — especially on trackpads where two-finger scroll is common. Users accidentally zoom in/out when they just want to browse or draw.

**Root cause:**
- `useCanvasViewport.ts` → `handleWheel` captures every wheel event and converts it to zoom
- There is no gesture discrimination — regular scroll, trackpad pinch, and intentional zoom all trigger the same handler
- `ZOOM_SCROLL_STEP` is `1.056` per event, which accumulates rapidly with high-frequency trackpad events

**Implementation:**

### 4a. Reduce zoom sensitivity further
- Increase scroll zoom step dampening — use a smaller multiplier for non-pinch events
- Add momentum dampening: ignore wheel events that arrive faster than 16ms apart (60fps) to prevent scroll acceleration

### 4b. Require modifier key for scroll-zoom
- **Default behavior:** Scroll wheel on canvas = NO zoom (let it be a no-op or controlled pan)
- **Zoom:** Only zoom on `Ctrl+scroll` (or `Cmd+scroll` on Mac) — this matches industry standard (Google Maps, Figma, Photoshop)
- **Pinch-to-zoom:** Should still work natively (trackpad pinch events have `e.ctrlKey = true` by convention)
- Show a brief toast/hint on first unmodified scroll: "Use Ctrl+scroll to zoom" (display once per session)

### 4c. Prevent page-level scroll interference
- Add `overflow: hidden` to the annotation page's root container to prevent any page scroll
- Ensure `e.preventDefault()` is only called when we actually handle the event (modifier present)

**Files to touch:**
- `src/hooks/useCanvasViewport.ts` (modify handleWheel to require Ctrl/Cmd)
- `src/components/annotation/AnnotationCanvas.tsx` (add zoom hint toast state)

---

## Requirement 5: Annotation Tools — Drawing & Persistence

**Current state (verified via Playwright):**
- Drawing tools DO work in single view — Line, Freehand, etc. create shapes on the canvas
- Shapes render as SVG with selection handles (move, resize)
- Save button triggers PUT to `/api/annotations/{annotationId}` with `canvasState` (shapes JSON) + `imageAdjustments`
- Auto-save fires every 30s when dirty
- Status bar shows shape count and annotation count

**Issues found:**
- Annotation tools only work in single view — multi-view mode has no drawing capability (the MultiViewGrid does not have pointer event handlers for drawing)
- When switching from multi-view back to single view, drawn annotations persist correctly
- The properties panel (right side, 280px) is not rendered — it may be hidden or conditionally shown. Users can't change stroke color, width, or other shape properties after drawing

**Implementation:**

### 5a. Ensure properties panel is accessible
- Check if `PropertiesPanel` is rendered — it may be hidden behind a toggle or only appears when a shape is selected
- If it's missing, add a toggle button to show/hide the right properties panel
- The panel should show: stroke color, stroke width, opacity, fill, and layer ordering controls

### 5b. Annotations per X-ray
- Currently annotations are loaded and saved per `annotationId` which is associated with a specific X-ray
- Verify the annotation load → edit → save → reload cycle works end-to-end:
  1. Open X-ray → annotations load from DB
  2. Draw shapes → auto-save or manual save
  3. Close and reopen → annotations should reappear
- If annotations are not persisting across page loads, debug the load path in the server page (`page.tsx`) and the `useAutoSave` hook

---

## Requirement 6: Full-Screen Annotation Mode (Layout Fix)

**Bug:** The annotation page is nested inside the `DashboardShell` layout which renders the sidebar (220px) and top navigation bar (52px). This wastes significant screen real estate and conflicts with the annotation page's own header/toolbar.

**Current state:**
- `src/app/dashboard/layout.tsx` wraps ALL `/dashboard/*` routes with `DashboardShell`
- `src/app/dashboard/xrays/[patientId]/[xrayId]/annotate/layout.tsx` tries to bypass this by rendering `<>{children}</>` but it can't escape the parent layout
- Result: annotation page has BOTH the dashboard sidebar + the annotation toolbar, doubling the chrome

**Implementation:**
- Modify `DashboardShell` (or the dashboard layout) to detect when the annotation page is active and skip the sidebar/topbar
- Option A: Use `usePathname()` in DashboardShell to conditionally hide the shell when path matches `/dashboard/xrays/*/annotate`
- Option B: Move the annotate route outside of `/dashboard` to its own layout (e.g., `/annotate/[patientId]/[xrayId]`)
- Option A is simpler and avoids breaking existing links

**Files to touch:**
- `src/components/dashboard/DashboardShell.tsx` (conditionally hide sidebar/topbar for annotate routes)

---

## Implementation Order

1. **Req 6** (layout fix) — biggest UX impact, unlocks full canvas area
2. **Req 4** (scroll zoom fix) — critical usability fix
3. **Req 2** (remove Invert + W/W) — simple removal, reduces header clutter
4. **Req 3** (add Flip button) — fills the slot freed by removing Invert
5. **Req 1** (multi-view brightness) — pass cssFilter prop through
6. **Req 5** (annotation persistence check) — verification + properties panel

## Testing

- `npm run build` must pass with no errors
- Manual browser verification:
  - Brightness/contrast sliders affect images in Side by Side and 2×2 Grid modes
  - Invert and W/W controls are gone from the header
  - Flip button mirrors the X-ray horizontally (annotations stay in correct positions)
  - Scroll wheel does NOT zoom unless Ctrl/Cmd is held
  - Annotation page renders without the dashboard sidebar/topbar
  - Draw a shape → save → reload page → shape reappears
  - Properties panel is accessible for editing shape styles

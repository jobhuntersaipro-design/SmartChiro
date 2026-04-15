# X-Ray Calibration System

## Status

Not Started

## Goals

1. **Calibration Reference Tool** — Draw a line on a known-distance object to compute pixelsPerMm
2. **Calibration Dialog** — Enter real-world distance and reference label
3. **Measurement Conversion** — All ruler/angle/cobb measurements display in mm when calibrated
4. **Calibration API** — PUT/DELETE endpoints to persist calibration per X-ray
5. **StatusBar Indicator** — Show calibration status at all times
6. **Export Integration** — PNG/PDF exports use mm values when calibrated

---

## Context

Calibration was previously implemented and removed in xray-enhance-3-spec.md (CalibrationDialog + calibrate API route + CalibrationMethod enum deleted). This spec re-introduces it with a **simpler design** — no enum, no clinic-level defaults, just per-X-ray `pixelsPerMm`.

---

## Problem

All measurements (ruler, Cobb angle) currently display in pixels — clinically useless. Chiropractors need real-world units (mm/cm) to make diagnostic decisions, track progress, and include in reports.

---

## Data Model Changes

Add 3 fields to the existing `Xray` model:

```prisma
model Xray {
  // ... existing fields
  isCalibrated    Boolean @default(false)
  pixelsPerMm     Float?    // computed from calibration reference
  calibrationNote String?   // e.g. "25mm coin" — what was used as reference
}
```

Migration required: `npx prisma migrate dev --name add-xray-calibration`

---

## API

### `PUT /api/xrays/[xrayId]/calibrate`

Set calibration for an X-ray.

**Request:**
```json
{
  "pixelsPerMm": 4.72,
  "calibrationNote": "25mm coin"
}
```

**Validation:**
- `pixelsPerMm` — required, positive number, max 1000
- `calibrationNote` — optional string, max 100 chars
- User must own the X-ray (auth check via session → patient → xray)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "isCalibrated": true,
    "pixelsPerMm": 4.72,
    "calibrationNote": "25mm coin"
  }
}
```

### `DELETE /api/xrays/[xrayId]/calibrate`

Remove calibration. Sets `isCalibrated = false`, `pixelsPerMm = null`, `calibrationNote = null`.

**Response (200):**
```json
{
  "success": true,
  "data": { "id": "...", "isCalibrated": false }
}
```

---

## UI Changes

### 1. Calibration Tool (AnnotationToolbar)

- Add **Calibration Reference** tool to the measurement tools section (after Cobb Angle)
- Icon: straightedge/ruler with "mm" badge
- Keyboard shortcut: `K`
- Tooltip: "Calibration Reference (K) — Draw a line on a known-distance object"
- Tool behaves like the Ruler tool (draw a line between two points)
- After line is drawn and confirmed → CalibrationDialog opens automatically

### 2. CalibrationDialog (New Component)

- Modal dialog that appears after drawing a calibration reference line
- Shows:
  - Pixel distance of the drawn line (computed, read-only)
  - **Distance input**: number field for real-world distance
  - **Unit selector**: dropdown with mm (default) and cm
  - **Reference label**: text input, placeholder "e.g. 25mm coin, ruler marking"
  - **Calibrate** button (primary) — computes pixelsPerMm, calls PUT API
  - **Cancel** button — discards the reference line
- On calibrate:
  - `pixelsPerMm = pixelDistance / realWorldDistance` (convert cm to mm if needed)
  - Call `PUT /api/xrays/[xrayId]/calibrate`
  - Remove the reference line from canvas (it's not an annotation, just a calibration tool)
  - Update StatusBar to show calibrated state
  - All existing measurements re-render with mm values

### 3. StatusBar Update

- Add calibration indicator between cursor position and shape count:
  - Calibrated: `"Calibrated: 0.23 mm/px"` (green dot)
  - Uncalibrated: `"Uncalibrated"` (gray dot)
- Click on indicator opens recalibration option (or shows calibrationNote)

### 4. Measurement Display (ShapeRenderer + PropertiesPanel)

Update measurement label rendering:

```typescript
function formatMeasurement(
  pixelValue: number,
  unit: "px" | "mm" | "deg",
  pixelsPerMm: number | null
): string {
  if (unit === "deg") {
    return `${pixelValue.toFixed(1)}°`
  }
  if (pixelsPerMm && unit !== "deg") {
    const mmValue = pixelValue / pixelsPerMm
    if (mmValue >= 10) {
      return `${(mmValue / 10).toFixed(1)} cm`
    }
    return `${mmValue.toFixed(1)} mm`
  }
  return `${pixelValue.toFixed(1)} px`
}
```

- ShapeRenderer: ruler labels, angle labels use `formatMeasurement`
- PropertiesPanel Measurements tab: all values display in mm/cm when calibrated
- Cobb angle classification unchanged (degrees are degrees regardless of calibration)

### 5. AnnotationCanvas Integration

- Pass `pixelsPerMm` from X-ray data down to:
  - ShapeRenderer (for label rendering)
  - PropertiesPanel (for measurements tab)
  - StatusBar (for indicator)
  - Export renderer (for PDF measurements table)
- After successful calibration API call, update local state without full page reload
- Calibration tool state: `idle` → `drawing` → `dialog_open` → `idle`

### 6. Export Updates (export-renderer.ts)

- PNG export: measurement labels render in mm when calibrated
- PDF export:
  - Header includes: "Calibration: 0.23 mm/px (25mm coin)" or "Uncalibrated"
  - Measurements summary table uses mm values
  - Footer note: "Measurements calibrated using [calibrationNote]"

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| K | Activate Calibration Reference tool |

Add to KeyboardShortcutsPanel under "Measurement Tools" section.

---

## Flow

```
1. User selects Calibration tool (K) or clicks toolbar icon
2. User draws a line on a known-distance object (e.g., coin in X-ray)
3. Drawing confirmation appears (Accept ✓ / Reject ✗)
4. User accepts → CalibrationDialog opens
5. User enters real-world distance (e.g., "25") and unit (mm)
6. User clicks "Calibrate"
7. System computes pixelsPerMm = pixelDistance / 25
8. PUT /api/xrays/[xrayId]/calibrate saves to DB
9. Reference line removed from canvas
10. StatusBar updates to "Calibrated: X.XX mm/px"
11. All existing ruler/measurement labels re-render in mm
12. Auto-save triggers to persist updated measurement labels
```

---

## Files to Create

- `src/components/annotation/CalibrationDialog.tsx` — Modal dialog component

## Files to Modify

- `prisma/schema.prisma` — Add 3 fields to Xray model
- `src/components/annotation/AnnotationToolbar.tsx` — Add calibration tool
- `src/components/annotation/AnnotationCanvas.tsx` — Calibration tool state, pass pixelsPerMm
- `src/components/annotation/StatusBar.tsx` — Calibration indicator
- `src/components/annotation/ShapeRenderer.tsx` — mm measurement labels
- `src/components/annotation/PropertiesPanel.tsx` — mm values in measurements tab
- `src/components/annotation/KeyboardShortcutsPanel.tsx` — Add K shortcut
- `src/hooks/useDrawingTools.ts` — Calibration tool drawing behavior
- `src/lib/measurements.ts` — Add formatMeasurement utility
- `src/lib/export-renderer.ts` — mm values in PNG/PDF export
- `src/types/annotation.ts` — Add calibration tool to ToolId type
- `src/app/api/xrays/[xrayId]/calibrate/route.ts` — New API route

---

## Tests

### Unit Tests (src/lib/__tests__/measurements.test.ts)

- `formatMeasurement` returns px when uncalibrated
- `formatMeasurement` returns mm when calibrated
- `formatMeasurement` returns cm for values ≥ 10mm
- `formatMeasurement` leaves degrees unchanged regardless of calibration
- Calibration computation: known pixel distance + known mm → correct pixelsPerMm
- Edge case: very small pixelsPerMm (< 0.01)
- Edge case: very large pixelsPerMm (> 100)
- Edge case: zero distance input rejected

### API Tests (src/app/api/xrays/__tests__/calibrate.test.ts)

- PUT sets isCalibrated, pixelsPerMm, calibrationNote
- PUT validates pixelsPerMm is positive
- PUT validates pixelsPerMm max 1000
- PUT validates calibrationNote max 100 chars
- DELETE clears all calibration fields
- Auth: rejects unauthenticated requests
- Auth: rejects requests for X-rays user doesn't own

---

## Out of Scope

- Clinic-level default calibration (removed in enhance-3, staying removed)
- CalibrationMethod enum (removed in enhance-3, staying removed)
- DICOM Pixel Spacing auto-calibration (separate DICOM Import spec)
- Multiple calibration references per X-ray (one is sufficient)

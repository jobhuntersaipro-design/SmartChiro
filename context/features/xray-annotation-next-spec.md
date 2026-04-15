# X-Ray Annotation — Next Phase Spec

## Status

Not Started

## Overview

Next phase of X-ray annotation features, prioritized by clinical utility and competitive differentiation. These features transform SmartChiro from a drawing tool into a clinical-grade radiograph analysis platform.

---

## Feature 1: Calibration System (P0)

### Problem

All measurements (ruler, Cobb angle) currently display in pixels — clinically useless. Chiropractors need real-world units (mm/cm) to make diagnostic decisions, track progress, and include in reports.

### Behavior

- **New tool**: Calibration Reference tool in the measurement section of the toolbar
- User draws a line between two points on a known-distance object in the X-ray (e.g., a coin, ruler marker, or vertebral body of known size)
- Dialog appears asking: "Enter the real-world distance of this line" with a number input and unit selector (mm/cm)
- System computes `pixelsPerMm = pixelDistance / realWorldMm`
- All existing and future measurements on this X-ray auto-convert to mm/cm
- Calibration persists per X-ray (stored on the Xray model)
- Visual indicator in StatusBar: "Calibrated: 0.23 mm/px" or "Uncalibrated"
- Recalibrate anytime by redrawing the reference line

### Data Model Changes

```prisma
model Xray {
  // ... existing fields
  isCalibrated    Boolean @default(false)
  pixelsPerMm     Float?    // computed from calibration reference
  calibrationNote String?   // e.g. "25mm coin" — what was used as reference
}
```

### API Changes

- `PUT /api/xrays/[xrayId]/calibrate` — Set pixelsPerMm, calibrationNote
- `DELETE /api/xrays/[xrayId]/calibrate` — Remove calibration

### UI

- Calibration tool icon: straightedge/ruler with "mm" badge
- Keyboard shortcut: `K`
- CalibrationDialog: modal with distance input, unit dropdown (mm/cm), reference label input
- StatusBar shows calibration status
- Measurements tab in PropertiesPanel shows mm values when calibrated, px when not
- Export (PNG/PDF) includes calibration status and uses mm values

### Measurement Display Logic

```
if (xray.isCalibrated && xray.pixelsPerMm) {
  displayValue = pixelValue / pixelsPerMm
  unit = "mm"
} else {
  displayValue = pixelValue
  unit = "px"
}
```

### Tests

- Calibration computation accuracy (known pixel distance → mm conversion)
- Measurement display switches from px to mm after calibration
- Calibration persists across sessions (save/reload)
- Recalibration updates all existing measurements
- Edge cases: very small/large pixelsPerMm, zero distance

---

## Feature 2: DICOM Import (P0)

### Problem

Most X-ray machines output DICOM (.dcm) files. Chiropractors currently must manually export to JPEG/PNG before uploading — a friction point that slows adoption.

### Behavior

- Accept `.dcm` files in addition to JPEG/PNG in the upload flow
- Parse DICOM metadata on upload (client-side or server-side)
- Extract the pixel data and convert to a viewable image (PNG/JPEG) for canvas rendering
- Extract and store relevant DICOM tags as metadata
- Auto-populate X-ray fields from DICOM tags (body region, view type, patient info)
- Support Window/Level presets from DICOM metadata
- Store both original DICOM file and converted image in R2

### DICOM Tags to Extract

| Tag | DICOM ID | Maps To |
|-----|----------|---------|
| Patient Name | (0010,0010) | Display only (verify matches) |
| Body Part | (0018,0015) | Xray.bodyRegion |
| View Position | (0018,5101) | Xray.viewType |
| Pixel Spacing | (0028,0030) | Xray.pixelsPerMm (auto-calibration!) |
| Window Center | (0028,1050) | ImageAdjustments.windowCenter |
| Window Width | (0028,1051) | ImageAdjustments.windowWidth |
| Bits Allocated | (0028,0100) | Rendering depth |
| Photometric Interpretation | (0028,0004) | Invert handling (MONOCHROME1 vs 2) |
| Study Date | (0008,0020) | Display metadata |
| Modality | (0008,0060) | Validation (expect CR/DX/DR) |

### Library

- **cornerstone.js** (`@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader`) — industry-standard DICOM parsing for web
- Alternative: `dwv` (DICOM Web Viewer) — lighter weight
- Evaluate both; prefer cornerstone for maturity and community

### Data Model Changes

```prisma
model Xray {
  // ... existing fields
  originalFileUrl   String?   // R2 URL for original DICOM (when source is DICOM)
  sourceFormat      String    @default("image") // "image" | "dicom"
  dicomMetadata     Json?     // raw extracted DICOM tags
}
```

### Upload Flow Changes

1. User drops `.dcm` file (or selects via file picker)
2. Client-side: parse DICOM header, extract pixel data, render to canvas, export as PNG
3. Upload both original DICOM and converted PNG to R2
4. POST confirm with extracted metadata
5. Auto-set pixelsPerMm from DICOM Pixel Spacing tag (if present)
6. Auto-set bodyRegion/viewType from DICOM tags (with manual override)

### File Constraints Update

| Type | Max Size | Extensions |
|------|----------|------------|
| Images | 300 MB | `.png`, `.jpg`, `.jpeg` |
| DICOM | 300 MB | `.dcm`, `.dicom` |

### Tests

- Parse sample DICOM file and extract correct tags
- Convert DICOM pixel data to viewable PNG
- Auto-calibration from Pixel Spacing tag
- Body region mapping from DICOM Body Part tag
- Reject non-radiology DICOM (e.g., ultrasound if modality != CR/DX/DR)
- Handle missing optional tags gracefully

---

## Feature 3: AI Landmark Detection (P1)

### Problem

Manual Cobb angle and measurement placement takes 2-3 minutes per X-ray. AI-assisted landmark detection can reduce this to seconds while improving consistency.

### Behavior

- **"AI Assist" button** in the annotation toolbar (or header)
- On click: sends the X-ray image to Claude Vision API with a specialized prompt
- Claude identifies vertebral landmarks, endplates, and anatomical reference points
- Returns suggested measurement placements (Cobb angle lines, ruler positions)
- Suggestions appear as ghost shapes (dashed, 50% opacity) on the canvas
- User can accept (click checkmark), adjust (drag endpoints), or dismiss each suggestion
- Accepted suggestions become regular shapes in the canvas state

### AI Pipeline

```
1. User clicks "AI Assist"
2. Client sends POST /api/xrays/[xrayId]/ai-analyze
3. Server fetches X-ray image from R2
4. Server sends to Claude Vision API with structured prompt:
   - "Identify vertebral endplates and suggest Cobb angle measurements"
   - "Identify cervical lordosis landmarks"
   - Prompt varies by bodyRegion (cervical vs thoracic vs lumbar)
5. Claude returns JSON with landmark coordinates and suggested measurements
6. Server stores results in Annotation.aiLandmarks / aiMeasurements
7. Client renders suggestions as ghost shapes
8. User accepts/rejects each suggestion
```

### Claude Vision Prompt Structure

```
You are analyzing a {bodyRegion} {viewType} X-ray image.

Identify the following landmarks and return their pixel coordinates:
- Vertebral body corners (superior/inferior endplates)
- Spinous processes
- Sacral base (if visible)

For each pair of endplates that shows curvature, suggest a Cobb angle measurement.

Return JSON:
{
  "landmarks": [
    { "label": "T1 Superior Endplate", "points": [[x1,y1], [x2,y2]], "confidence": 0.92 }
  ],
  "suggestedMeasurements": [
    {
      "type": "cobb_angle",
      "label": "T4-T12 Cobb Angle",
      "line1": [[x1,y1], [x2,y2]],
      "line2": [[x3,y3], [x4,y4]],
      "confidence": 0.88
    }
  ]
}
```

### API

- `POST /api/xrays/[xrayId]/ai-analyze` — Trigger AI analysis
  - Request: `{ bodyRegion, viewType, annotationId? }`
  - Response: `{ landmarks, suggestedMeasurements, tokenUsage }`
- Results cached on Annotation model (`aiLandmarks`, `aiMeasurements` fields already exist)

### UI

- "AI Assist" button with sparkle icon in AnnotationHeader
- Loading state: pulsing overlay with "Analyzing X-ray..."
- Ghost shapes rendered with dashed stroke, 50% opacity, distinct color (#AF52DE purple)
- Per-suggestion accept/dismiss controls (checkmark/X)
- "Accept All" / "Dismiss All" batch controls
- Confidence badge on each suggestion (High >0.85, Medium 0.7-0.85, Low <0.7)

### Guardrails

- Rate limit: max 5 AI analyses per X-ray per day
- Token usage tracking for cost monitoring
- Always show as "suggestions" — never auto-commit to canvas
- Disclaimer: "AI suggestions are for reference only. Always verify measurements clinically."

### Tests

- Mock Claude Vision response and verify ghost shape rendering
- Accept suggestion → converts to regular shape
- Dismiss suggestion → removes from canvas
- Cached results load from DB on re-open
- Error handling: API timeout, malformed response, rate limit

---

## Feature 4: Annotation Templates (P1)

### Problem

Chiropractors draw the same measurement patterns on every cervical, thoracic, or lumbar X-ray. This repetitive work takes 5-10 minutes per X-ray.

### Behavior

- **Template library** accessible from a new toolbar button or menu
- Pre-built templates for common analysis patterns:
  - **Cervical Analysis**: Lordosis arc, George's line, Atlas laterality, disc space markers
  - **Lumbar Analysis**: Ferguson's angle, disc space measurements, Cobb angle guides
  - **Full Spine**: Cobb angle measurement lines at key vertebral levels
  - **Pelvis**: Femur head lines, sacral base angle
- Applying a template places guide shapes on the canvas at default positions
- User adjusts endpoints to match the specific X-ray anatomy
- Templates are pre-styled with measurement colors (#00D4AA teal)
- Users can save custom templates from their current annotations

### Data Model

```prisma
model AnnotationTemplate {
  id          String   @id @default(cuid())
  name        String
  description String?
  bodyRegion  BodyRegion
  category    String   @default("custom") // "system" | "custom"
  shapes      Json     // Array of BaseShape (same format as canvasState.shapes)
  thumbnail   String?  // auto-generated preview

  // Custom templates belong to a user
  createdById String?
  createdBy   User?    @relation("TemplateCreator", fields: [createdById], references: [id])

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([bodyRegion, category])
}
```

### API

- `GET /api/templates?bodyRegion=CERVICAL` — List templates (system + user's custom)
- `POST /api/templates` — Save custom template
- `DELETE /api/templates/[templateId]` — Delete custom template (own only)

### UI

- Template button in toolbar (grid/layout icon), shortcut: `T`
- TemplatePanel: slide-out panel or modal showing template cards
- Cards show: thumbnail preview, name, body region badge, shape count
- "Apply" button on each card → places shapes on canvas
- "Save as Template" button in PropertiesPanel → saves current shapes as custom template
- System templates are read-only, custom templates can be renamed/deleted

### System Templates (Ship With)

1. **Cervical Lordosis Analysis**
   - 4 horizontal ruler lines at C2, C4, C6, C7 levels (placeholder positions)
   - Arc measurement guide for lordosis curve
   - George's line (posterior vertebral body alignment)

2. **Lumbar Cobb Angle**
   - 2 Cobb angle line pairs (upper/lower endplates)
   - Ferguson's angle guide (L5-S1)
   - Disc space measurement rulers at L3-L4, L4-L5, L5-S1

3. **Full Spine Scoliosis**
   - 3 Cobb angle measurement pairs (thoracic, thoracolumbar, lumbar)
   - Vertical plumb line from C7

4. **Pelvic Analysis**
   - Horizontal reference line across femur heads
   - Sacral base angle measurement
   - Leg length discrepancy ruler

### Tests

- Apply template places correct shapes on canvas
- Custom template save/load roundtrip
- Template shapes are editable after placement
- Body region filter works correctly

---

## Feature 5: Progress Tracking & Comparison Reports (P2)

### Problem

Chiropractors need to demonstrate treatment progress to patients. Currently, the compare view shows two X-rays side by side but doesn't leverage measurement data to show quantitative improvement.

### Behavior

- **Measurement diff** between two annotation sessions on the same body region
- Auto-generates a comparison table: "Cobb angle: 32° → 24° (↓25%)"
- **Progress report PDF** with:
  - Patient info header
  - Side-by-side annotated X-ray images
  - Measurement comparison table with arrows (↑ worse / ↓ improved)
  - Date range and visit count
  - Doctor's notes field (editable before export)
  - Clinic branding (logo, name, address)
- Timeline view: measurement trends over multiple X-rays (chart)

### Data Flow

```
1. User navigates to Compare view (/dashboard/xrays/compare)
2. Selects two X-rays of the same body region
3. System loads annotations for both
4. Extracts all measurements from canvasState.shapes
5. Matches measurements by type + label (e.g., "Cobb Angle T4-T12")
6. Computes diff (absolute change, percentage change, direction)
7. Displays comparison table alongside X-ray images
8. "Generate Report" button → PDF with full comparison
```

### API

- `POST /api/xrays/compare-measurements` — Compare measurements between two annotations
  - Request: `{ annotationId1, annotationId2 }`
  - Response: `{ comparisons: [{ label, type, before, after, change, percentChange, direction }] }`
- `POST /api/reports/progress` — Generate progress report PDF
  - Request: `{ patientId, xrayIds: [id1, id2], doctorNotes? }`
  - Response: PDF buffer

### UI Changes to Compare View

- Measurement comparison panel below/beside the split view
- Table columns: Measurement | Before | After | Change | Trend
- Color-coded: green for improvement, red for worsening, gray for unchanged
- "Generate Progress Report" button → downloads PDF
- Doctor's notes textarea (optional, included in PDF)

### Progress Timeline (Future Enhancement)

- For patients with 3+ X-rays of the same body region
- Line chart showing measurement values over time
- X-axis: dates, Y-axis: measurement value
- Accessible from patient detail page

### Tests

- Measurement extraction from canvasState shapes
- Diff computation (absolute, percentage, direction)
- PDF generation with comparison table
- Handle missing/unmatched measurements gracefully
- Handle uncalibrated vs calibrated measurement comparison

---

## Feature 6: Annotation Versioning (P2)

### Problem

Currently, auto-save overwrites `canvasState` — no way to view or restore previous states. If a chiropractor accidentally deletes annotations or wants to review changes over time, the data is lost.

### Behavior

- **Explicit save** creates a version snapshot (separate from auto-save)
- Version history panel shows all saved versions with timestamps
- Click a version to preview it (read-only overlay)
- "Restore" button to revert to a previous version
- Auto-save continues to update the current working state
- Versions are created on:
  - Manual save (Cmd+S)
  - Before applying AI suggestions
  - Before applying a template

### Data Model

```prisma
model AnnotationVersion {
  id            String   @id @default(cuid())
  version       Int      // sequential version number
  label         String?  // optional user label, e.g. "Before AI analysis"
  canvasState   Json     // snapshot of full canvas state
  imageAdjustments Json?
  shapeCount    Int
  measurementCount Int

  annotationId  String
  annotation    Annotation @relation(fields: [annotationId], references: [id], onDelete: Cascade)
  createdById   String

  createdAt     DateTime @default(now())

  @@index([annotationId, version])
}
```

### API

- `GET /api/annotations/[annotationId]/versions` — List versions (metadata only, no canvasState)
- `GET /api/annotations/[annotationId]/versions/[versionId]` — Get full version with canvasState
- `POST /api/annotations/[annotationId]/versions` — Create version snapshot
- `POST /api/annotations/[annotationId]/versions/[versionId]/restore` — Restore version

### UI

- Version history button in AnnotationHeader (clock icon)
- Dropdown/panel showing version list: "v3 — Apr 15, 2:30 PM (12 shapes)"
- Preview mode: read-only canvas overlay with "Viewing v2" banner
- "Restore this version" button (creates a new version from current state before restoring)
- Auto-label for system-triggered versions ("Before AI analysis", "Before template apply")

### Limits

- Max 50 versions per annotation (oldest auto-pruned)
- Version canvasState stored as JSON (same format as Annotation.canvasState)

### Tests

- Create version snapshot on manual save
- Restore version replaces current canvasState
- Restore creates a backup version of current state first
- Version list displays in reverse chronological order
- Auto-pruning at 50 versions

---

## Feature 7: Touch & Tablet Support (P3)

### Problem

Chiropractors often review X-rays on iPads in the treatment room. Current canvas interactions are mouse-only.

### Behavior

- **Pinch-to-zoom**: two-finger pinch gesture maps to zoom
- **Two-finger pan**: two-finger drag maps to viewport pan
- **Single-finger draw**: one-finger touch maps to active drawing tool
- **Long-press select**: 500ms press on a shape to select it
- **Touch-friendly toolbar**: larger hit targets (min 44x44px per Apple HIG)
- **Palm rejection**: ignore touches with large contact area (when stylus is active)

### Implementation Notes

- Use `pointer events` API (already in use) — works for both mouse and touch
- Add `touch-action: none` on canvas to prevent browser gestures
- Detect `pointerType === "touch"` for gesture recognition
- Use `TouchEvent` for multi-touch (pinch/pan) since PointerEvents don't natively support multi-touch gestures
- Apple Pencil support: `pointerType === "pen"` with pressure sensitivity for stroke width

### UI Adjustments for Touch

- Toolbar icons: 44x44px minimum touch targets (currently 40x40px — minor bump)
- Properties panel: larger sliders and color swatches
- Drawing confirmation: larger accept/reject buttons
- Zoom bar: larger +/- buttons

### Tests

- Pinch gesture triggers zoom
- Two-finger drag triggers pan
- Single-finger draw creates shapes
- Apple Pencil pressure affects stroke width
- No conflicts between gestures

---

## Implementation Order

| Phase | Feature | Depends On | Est. Complexity |
|-------|---------|------------|-----------------|
| 1 | Calibration System | None | Medium |
| 2 | DICOM Import | None (parallel with 1) | Medium-High |
| 3 | Annotation Templates | None (parallel with 1-2) | Medium |
| 4 | AI Landmark Detection | Calibration (better with mm) | High |
| 5 | Progress Tracking | Calibration (meaningful comparisons) | Medium |
| 6 | Annotation Versioning | None | Low-Medium |
| 7 | Touch & Tablet | None | Medium |

Features 1, 2, and 3 can be developed in parallel. Feature 4 (AI) benefits from calibration being in place first. Feature 5 (Progress) benefits from both calibration and having real measurement data.

---

## Notes

- Calibration was previously implemented and removed in xray-enhance-3-spec.md (CalibrationDialog + calibrate API route + CalibrationMethod enum deleted). This spec re-introduces it with a simpler design — no enum, no clinic-level defaults, just per-X-ray pixelsPerMm.
- AI fields (`aiLandmarks`, `aiMeasurements`) already exist on the Annotation model — no migration needed for Feature 3.
- The `sourceFormat` and `dicomMetadata` fields for DICOM support require a new migration.
- Template system is a new model requiring migration.
- Versioning system is a new model requiring migration.

# SmartChiro Viewer — Part 1: Overview & Architecture

> **Series**: [Overview & Architecture] · [Canvas Engine](./viewer-spec-part2-canvas.md) · [Tools, Measurements & AI Landmarks](./viewer-spec-part3-tools.md)

---

## What this is

A web-based image viewer for chiropractic X-rays, built as the **foundation feature** of SmartChiro. It ships before patient records, appointments, or invoicing. Every later clinical feature wires back into this viewer — a patient profile will embed it, a consultation will reference its annotations, a report will export its marked-up images. So it's worth building right, in isolation, before the rest of the product accretes around it.

The reference product is **MedDream**, a mature web-based DICOM viewer used by hospitals worldwide. SmartChiro Viewer is not trying to replicate the full MedDream feature set — MedDream is a 10+ year product with FDA clearance and dozens of features specific to hospital radiology workflows (DICOM multi-frame, MPR/MIP/3D reconstruction, hanging protocols, PET-CT fusion, ECG waveform display, etc.). Most of that is irrelevant to chiropractic practice. SmartChiro Viewer takes the **realistic subset that matters for a chiropractor reading a JPEG/PNG X-ray** and adds one capability MedDream doesn't have: AI-assisted landmark detection via Claude vision.

This part covers scope, technical decisions, AI strategy, and build order. Parts 2 and 3 cover implementation.

---

## How this spec differs from the previous one

The earlier 5-part spec (upload → canvas → tools → measurements → API) was scoped for the full clinical product with R2 storage, Prisma schemas, presigned URLs, multi-tenant access, and patient-scoped routing. That spec was correct for the eventual destination — but it conflated v1 work with v3 work, which slowed v1 down.

This rewrite makes four structural improvements:

1. **Scope amputation.** No cloud storage, no database, no API routes except a single thin proxy for Claude vision (the API key has to live server-side, but everything else is client-only). No auth, no patient context. The image lives in browser memory via `URL.createObjectURL`. v1 is ephemeral by design — refreshing the page wipes the session, and that's fine, because there's no patient data to lose yet. Persistence layers in at v2 once the patient model exists.

2. **Decisions made, not deferred.** The old spec said "canvas library: TBD — evaluating Konva.js, Fabric.js, or custom." That decision wasn't actually blocking; it was avoidance. This spec picks Konva.js and explains why (see "Tech decisions" below). Same for state management, file handling, persistence — all locked.

3. **Math written out.** The old spec described the coordinate system at a conceptual level. The transform composition (translate → scale → rotate → flip) is exactly the part that breaks subtly when implemented. Part 2 of this spec writes both the forward (image → screen) and inverse (screen → image) transforms in code, because the inverse is what every mouse-click handler needs and it is not obvious to derive correctly.

4. **AI as a feature, not an afterthought.** The old spec didn't address AI landmark detection at all. This spec treats Claude vision as a first-class v1 feature with its own section, an honest accuracy expectation, and a UX (draggable points) that gracefully degrades when the AI is wrong. Manual placement and AI suggestion produce the same data structure, so the rest of the viewer doesn't need to know which is which.

Three files instead of five matches the smaller scope. The five-file structure made sense when each part was a separate domain owned by potentially separate work sessions; v1 is small enough that one engineer holds it all in their head, and three files keep related concepts together.

---

## v1 scope

### Image manipulation (11 features)

- Pan with mouse drag
- Zoom with mouse wheel (centered on cursor, not on image center)
- Zoom in / zoom out buttons
- Fit-to-image (auto-scale to fill viewport with padding)
- Magnify glass (hover lens that shows a zoomed-in circle of the area under the cursor)
- Brightness slider (0–200%, default 100%)
- Contrast slider (0–200%, default 100%)
- Invert colors toggle
- Rotate 90° clockwise (button, repeated clicks cycle 0/90/180/270)
- Flip horizontal toggle
- Flip vertical toggle
- Reset view (returns scale, pan, rotation, flip, brightness, contrast to defaults; preserves measurements and annotations)
- Fullscreen toggle

### Measurements (7 features)

- **Line** — 2-click distance measurement
- **Polyline** — chained lines: click, click, click... ends with double-click, Escape, or Done button. Each segment shows its own length; total length shown at the chain endpoint
- **Angle** — 3-click angle measurement (endpoint → vertex → endpoint), shown in degrees
- **Cobb angle** — angle between two independently-drawn lines (4 clicks total: 2 for first line, 2 for second). Used for spine curvature analysis
- **Ellipse area** — drag from corner to corner of bounding box, shows area in mm²
- **Rectangle area** — drag from corner to corner, shows area in mm²
- **Calibration** — draw a line over a known reference (a ruler in the image, or a vertebral body of known size), enter real-world length in mm, all subsequent measurements auto-convert from pixels to mm

### Annotations (3 features)

- **Text label** — click to place, type text, draggable after creation
- **Arrow** — 2-click arrow with arrowhead at the second point
- **Freehand draw** — click and drag to draw a free curve, useful for circling areas of interest

### View management (3 features)

- **Multi-image session** — upload several images at once, see thumbnails in a left sidebar, click any thumbnail to switch the active image
- **Side-by-side comparison** — toggle a 2-pane mode to view two images simultaneously (e.g. before/after a treatment series). Each pane has independent pan/zoom/measurements
- **Image switcher** — keyboard shortcuts (J/K or arrow keys) to cycle through loaded images quickly

### AI (1 feature)

- **Claude vision landmark detection** — button on the toolbar. Sends the current image to Claude vision, which returns approximate coordinates for ~16 anatomical landmarks (femoral heads, iliac crests, sacral landmarks, etc.). Each suggestion renders as a draggable point on the canvas. The user drags points that are off; correct points are left alone. Once finalized, the landmarks drive automatic measurement of pelvic alignment parameters (FHHD, ICHD, etc.) — same parameters as the Heliyon paper

### Saving (2 features)

- **Export as PNG** — flatten the current view (image + all annotations) to a PNG download
- **Print** — open the browser's print dialog with a print-optimized stylesheet

### Total v1 surface

**27 distinct features.** Realistic for a 2–4 week solo build given Konva.js handles the heavy lifting (selection, transforms, hit detection).

---

## Out of scope for v1 (deliberately)

| Feature | When | Why deferred |
|---|---|---|
| DICOM file support | v2 | Adds `cornerstone.js` dependency, window/level presets from DICOM tags, multi-frame, `PixelSpacing` auto-calibration. JPEG/PNG covers most chiropractic clinics' workflow today |
| Patient records / persistence | v2 | Whole separate data model. v1 viewer must work standalone first |
| Hanging protocols (saved view layouts) | v3 | Needs DB-backed user prefs |
| Key objects, presentation states (DICOM PR/KO) | v3 | DICOM-specific, irrelevant for JPEG/PNG |
| Reports (writing radiologist-style structured findings) | v3 | Whole separate feature with its own data model |
| Study forwarding to PACS | Never (probably) | Hospital radiology workflow, not chiropractic |
| 3D / MPR / MIP reconstruction | Never (probably) | Requires CT/MRI volumetric data, not 2D X-rays |
| PET-CT fusion | Never | Not chiropractic |
| ECG waveform, video, PDF embedded as DICOM | Never | Not chiropractic |
| Multi-monitor support | Never (probably) | Browser limitation; users can open multiple tabs |
| Hospital-grade audit logs / HIPAA / FDA clearance | If/when SmartChiro pursues regulated markets | Massive compliance scope |

---

## Tech decisions (locked)

| Decision | Choice | Reasoning |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Already SmartChiro's stack |
| Component | Single client component (`'use client'`) | Canvas needs `window`; SSR adds no value |
| Canvas library | **Konva.js + react-konva** | See note below |
| Styling | Tailwind | Matches SmartChiro |
| State | Local `useState` + a single `useReducer` for shapes | No Zustand for v1 — a flat reducer for the shapes array is enough |
| File handling | `URL.createObjectURL` | No upload, no server, image stays in browser memory |
| Persistence | None | v1 is intentionally ephemeral. Refresh wipes the session |
| AI proxy | Single Next.js API route at `/api/viewer/detect-landmarks` | Server-side route exists only because Claude API key cannot be in client bundle. No DB access |
| TypeScript | Yes | Catches coordinate-math errors at compile time |

### Why Konva.js (revising the earlier "native canvas" instinct)

Earlier discussion leaned toward native `<canvas>` 2D context for transparency. With v1 scope expanded from "lines and angles only" to **27 features including draggable AI landmarks, ellipse/rectangle drag-to-create, freehand draw, text labels, and multi-image side-by-side**, Konva.js is the right call:

- **Drag-and-drop on shapes is built in.** Critical for the AI landmarks UX (16 draggable points per image) and for "all points are draggable everywhere" rule. Implementing this on raw canvas is its own multi-day project.
- **Hit detection is built in.** Click a shape to select it, click empty area to deselect. Native canvas requires you to maintain your own spatial index.
- **Transformer (resize/rotate handles) is built in.** Needed for ellipse/rectangle/text resize after creation.
- **Layers** map cleanly to image layer / shape layer / overlay layer separation we need anyway.
- **Performance** is fine for hundreds of shapes per session, well above v1 needs.
- **Bundle size** ~100KB gzipped. Acceptable.
- **Migration cost from native canvas later would be high.** Cheaper to start with Konva.

The transparency loss is real — Konva's transform model is its own thing, and you have to learn it. But the productivity gain across 27 features outweighs the loss on the 3–4 we'd hand-roll either way (pan, zoom, brightness/contrast filtering).

When to revisit: never, probably. If shape count ever exceeds a few thousand per session, look at WebGL renderers (PixiJS), but chiropractic X-ray sessions will never get there.

### Why no Zustand/Redux

The state tree is flat: one image session, one array of shapes, one array of pending click points, one calibration object, one tool selection, view transform parameters. No deeply nested data, no cross-component coordination beyond parent-child prop passing. `useState` and one `useReducer` for the shapes array (so undo/redo works via reducer history) is sufficient. Reach for Zustand only when v2 adds patient context and the viewer needs to coordinate with the patient panel.

---

## AI strategy

### What AI does

User uploads a pelvic X-ray, clicks "Detect landmarks." The viewer:

1. Encodes the current image to base64
2. Sends it to `/api/viewer/detect-landmarks` (Next.js API route)
3. Server calls Claude vision with a structured prompt asking for 16 anatomical landmarks as JSON
4. Server returns the landmarks array
5. Viewer renders each landmark as a draggable point on the canvas
6. User drags points that are misplaced; leaves correct ones alone
7. As points are dragged, downstream measurements (FHHD, ICHD, sacral parameters, etc.) recompute live

### Honest expectation: Claude vision will not match a trained CNN

The Heliyon paper (Moon et al., 2024) trained a custom dual-stage ResNet50 on 245 labeled pelvic X-rays. Their results:

- Easy landmarks (femoral heads, symphysis pubis): mean radial error ~1mm, hit rate within 2mm: 80–88%. Excellent.
- Iliac crests: mean radial error 4mm, hit rate within 2mm: 34–41%. Mediocre.
- Sacrum landmarks: mean radial error 4mm, hit rate within 2mm: 21–44%. Poor — the paper's own conclusion was that even their purpose-built CNN couldn't reach clinician-level accuracy on these landmarks because surrounding anatomy obscures the sacrum on 2D radiographs.

Claude vision is a general-purpose multimodal model, not a specialized landmark detector. Realistic expectations:

- Easy landmarks: probably 5–15mm off, vs the paper's ~1mm. User will drag most of them slightly.
- Hard landmarks (sacrum): probably 15–30mm off. User will reposition substantially.

Net effort with AI: drag 12-ish points by varying amounts. Net effort without AI: place 16 points from scratch.

**The win is real but modest.** Marketing it as "AI does the analysis" would be dishonest and dangerous. Position it as "AI gives you a starting point — verify and adjust." This is what the Heliyon paper itself recommends ("adjunct tool, clinicians refine AI suggestions").

### Why this is still worth shipping in v1

- It's a genuine differentiator vs MedDream, which has no AI landmark feature
- It demonstrates the AI-assisted workflow that v2 (custom-trained model) will eventually replace
- Logging "where users drag landmarks to" gives you a labeled dataset over time. After 12–18 months of usage, you have your own training data for a custom model
- The fallback when AI is bad is the manual placement workflow, which exists anyway

### Privacy note

Claude vision processes the image server-side via Anthropic's API. v1 doesn't collect identifying patient information (no patient name, ID, etc. — the image is uploaded standalone). Add a clear disclaimer in the UI: *"X-ray images are sent to Claude (Anthropic) for landmark detection. Do not upload images containing visible patient identifiers. SmartChiro does not store images on our servers."*

For v2, when patient context is added, this disclaimer must be revisited and likely a privacy mode added (no AI processing for sensitive images).

---

## Build order

Six numbered phases. Each phase is independently shippable to a dev environment for self-testing. No phase blocks on a future phase's work.

### Phase 1 — Project setup and image loading (½ day)

- Create `/app/viewer/page.tsx` as a client component
- Install `konva` and `react-konva`
- Build the layout shell: top bar (logo + upload button), left toolbar (placeholder buttons), center canvas, right panel (placeholder)
- Implement file upload via `<input type="file" multiple>`, store images in browser memory via `URL.createObjectURL`
- Render the first uploaded image on a Konva `Stage` + `Layer` + `Image` at fit-to-viewport scale
- **Done when**: User can upload a PNG, see it centered on the canvas

### Phase 2 — Image manipulation (1–2 days)

- Pan via Stage drag
- Zoom via Stage scale, centered on mouse cursor (this is non-trivial — see Part 2 for the math)
- Brightness/contrast/invert via Konva `Image.filters` and `cache()` for performance
- Rotate 90° / flip H / flip V via Stage rotation and scaleX/Y
- Reset view button
- Fullscreen toggle
- Magnify glass — hover lens implemented as a second small Konva Stage following the cursor
- **Done when**: All 13 image manipulation features work as expected

### Phase 3 — Measurements (3–5 days)

This is the largest phase. Build in this order:

1. Line tool (2 clicks, draws a line, shows distance label, line endpoints draggable)
2. Calibration tool (line tool + modal asking for real-world length, stores `pixelsPerMm`)
3. Polyline tool (chained click workflow, double-click/Escape/Done to finish, all points draggable)
4. Angle tool (3 clicks, draws two segments meeting at vertex, shows angle)
5. Cobb angle tool (4 clicks for two independent lines, calculates angle between them)
6. Rectangle area tool (drag-to-create, draggable corners, shows area in mm²)
7. Ellipse area tool (drag-to-create, draggable handles, shows area in mm²)

Every tool follows the same pattern: a `Shape` data structure, a click handler that adds points to a `pending` array, a renderer that draws the shape (and a preview while pending), and a measurement label that recalculates as points move.

- **Done when**: User can measure any geometric quantity on a calibrated image

### Phase 4 — Annotations (1–2 days)

- Text label tool (click to place, inline edit on creation, draggable after)
- Arrow tool (2 clicks, arrowhead at second point)
- Freehand draw (mouse-down, capture path of mouse moves, mouse-up to finalize)
- Color picker (5 preset colors: green, yellow, red, white, cyan) shared across all annotation tools
- Stroke width selector (1, 2, 3 px)

- **Done when**: User can add visual notes to an image

### Phase 5 — Multi-image and comparison (2 days)

- Left sidebar with thumbnails of all uploaded images
- Click thumbnail → switch active image (preserve each image's annotations independently)
- Comparison mode toggle: split canvas into two panes, dropdown on each pane to pick the image
- Keyboard shortcuts (J/K or arrow keys) for switching active image

- **Done when**: User can flip between multiple X-rays and compare two side-by-side

### Phase 6 — AI landmarks + export (2–3 days)

- Build `/api/viewer/detect-landmarks` Next.js API route
  - Accepts base64 image
  - Calls Anthropic Claude vision API with structured JSON prompt asking for 16 named landmarks
  - Returns array of `{ name, x, y, confidence }`
- Add "Detect landmarks" button to toolbar, only enabled when an image is loaded
- Render returned landmarks as draggable Konva `Circle` shapes with labels
- As landmarks move, recompute and display pelvic alignment parameters in the right panel
- Export as PNG (use Konva's `toDataURL` on the Stage)
- Print (browser print dialog with print-optimized CSS)

- **Done when**: User can run AI detection, fine-tune landmarks, see live measurement updates, export the result

### Total estimate

**10–15 days of solo work.** Add 30% buffer for the unknowns of working with Konva for the first time — call it **3 weeks**.

---

## What lives where

```
app/
  viewer/
    page.tsx                  Main viewer page, mounts <ViewerShell>
    components/
      ViewerShell.tsx         Layout: top bar, sidebar, canvas, right panel
      Canvas.tsx              Konva Stage + image + shapes layer
      Toolbar.tsx             Left toolbar with all tools
      RightPanel.tsx          Image adjustments, measurements list, calibration
      Thumbnails.tsx          Left sidebar with image thumbnails
      CalibrationModal.tsx    Modal for entering real-world length
      MagnifyLens.tsx         Hover magnify glass overlay
    lib/
      coordinates.ts          screenToImage, imageToScreen helpers
      shapes.ts               Shape type definitions, factory functions
      measurements.ts         Distance, angle, area, Cobb angle calculations
      reducer.ts              Shapes reducer (add, update, delete, undo, redo)
      ai.ts                   Client-side wrapper for /api/viewer/detect-landmarks
    types.ts                  Shared TypeScript types
  api/
    viewer/
      detect-landmarks/
        route.ts              POST handler — calls Claude vision, returns landmarks
```

---

## Related

- **Part 2 — Canvas Engine** covers coordinate math, the Konva stage setup, image transforms, and rendering pipeline.
- **Part 3 — Tools, Measurements & AI Landmarks** covers each tool's data shape, click flow, drag behavior, and the Claude vision integration in detail.

---

🦴 **SmartChiro Viewer — Part 1 of 3**

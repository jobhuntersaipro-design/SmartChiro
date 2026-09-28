# Parked Feature: AI Landmark Detection (X-Ray Viewer)

> Moved out of `context/current-feature.md` on 2026-09-28 when WhatsApp Cloud API reminders became the current feature. Content unchanged below.

## Status

In Progress — merged to `main` 2026-09-24

**Branch:** `feat/xray-ai-landmarks` (merged; the branch's own commit was marked "in progress", so verify the Goals below before marking complete)

## Spec

Authoritative spec lives in the existing 3-part viewer wishlist — only the
AI sections apply for this branch:

- `context/features/xray-new-phase-1-spec.md` §AI strategy (lines ~144–186)
- `context/features/xray-new-phase-3-spec.md` §AI landmark detection (lines ~413–545)

**Important framing:** treat these specs as a feature checklist, not a
clean-slate rebuild. We already shipped the patient-scoped, DB-persisted,
SVG-based annotation system over ~10 prior features. AI landmarks adds a new
shape kind, a new toolbar action, a new server route, and a Heliyon-param
panel — it does NOT touch the canvas engine, RBAC, or persistence model.

## Goals

### Server: privacy-isolated landmark detection route
- New `POST /api/viewer/detect-landmarks` (NOT `/api/xrays/...` — the route
  name encodes that the request scope is pixels-only, no DB lineage).
  - **Auth check:** requester must have `canViewXray` access to the X-ray ID.
  - **Server fetches** image bytes from R2 using the X-ray ID.
  - **Strip everything before calling Anthropic.** Send only the raw image
    bytes. NOT: xrayId, patientId, name, IC, branch, doctor, visit metadata,
    filename, any DB-resolvable identifier. The X-ray ID never leaves our
    server.
  - Call `claude-opus-4-7` vision with the structured prompt from Part 3
    §Server-side prompt — 16 named pelvic landmarks, JSON-only response.
  - Validate Claude's response: parse JSON, clamp coordinates to image bounds,
    default `confidence` to 0.5 if missing, accept partial responses (fewer
    than 16 landmarks).
  - Errors: `image_too_large`, `vision_api_error`, `rate_limited`.
- **No DB writes** by this route. The client decides what to do with the
  returned landmarks (render → drag → save via existing annotation save).

### Client: new shape kind + draggable rendering
- Extend `ShapeType` with `'landmark'`; extend the discriminated union with:
  ```ts
  interface LandmarkShape extends BaseShape {
    type: 'landmark';
    name: string;            // canonical, e.g. "top_of_left_femoral_head"
    displayName: string;     // human-readable, e.g. "L femoral head"
    confidence: number;      // 0..1 from Claude (or 1.0 if user-placed)
    source: 'ai' | 'manual';
  }
  ```
- `ShapeRenderer` adds a new branch: cyan `Circle` + label, draggable, with
  a small confidence indicator (low confidence = dashed ring).
- Shapes serialize through the existing `canvasState` JSON column — no
  Prisma migration. Loading an annotation with landmarks just works.

### Toolbar: "Detect landmarks" action
- New entry in `AnnotationToolbar` at the bottom (separator + cyan icon).
- Disabled when no image is active.
- Click → loading spinner → calls `/api/viewer/detect-landmarks` with the
  X-ray ID → on success, adds N `LandmarkShape`s to the canvas in a single
  undo entry (so Cmd+Z removes them all).
- Above the button (in a tooltip or small popover): the privacy disclaimer
  *"Image bytes are sent to Anthropic for landmark detection. No patient
  information is included. AI placement is approximate — verify and adjust."*

### Pelvic alignment side panel
- New section in the right `PropertiesPanel` (or a new tab) shown only when
  ≥1 landmark is present: "Pelvic Analysis."
- Computes the Heliyon parameters live from current landmark positions —
  recomputes on every drag move. Per Part 3 §Downstream measurements:
  - **FHHD** (femoral head height difference)
  - **ICHD** (iliac crest height difference)
  - **ALFHRF** (angle femoral horizontal vs image horizontal)
  - **DOCS** (symphysis pubis to S2-tubercle plumb)
  - Plus L/R IM, L/R SAM, L/R ISM (deferred to v2 if landmarks for those
    aren't reliable enough — start with the 4 above).
- Show in mm/° when calibrated; suppress with a "Calibrate to display in mm"
  hint when not.

### UX: review-and-adjust workflow
- Per spec §Honest accuracy expectations: position AI as **starting point**.
  Initial placement will be 5–30 mm off (femoral heads good, sacrum poor).
- Cyan = AI-placed; once a user drags a landmark, set `source: 'manual'`
  and switch the rendering to a solid (non-dashed) ring so the user can see
  which landmarks they've reviewed.
- "Reset to AI" affordance per landmark (or globally) to undo manual
  positioning back to the original AI suggestion.

## Notes

### Locked Decisions

1. **Privacy boundary stops at the API route, not the whole viewer.** The
   3-part spec's "no patient, no auth, ephemeral" stance only applies to
   what the Anthropic API receives. The viewer keeps full patient context;
   we just don't send any of it to Anthropic. (Carried forward from the
   X-Ray Viewer Fine-Tuning branch's Locked Decision #3.)
2. **Single shape kind for AI + manual landmarks.** A landmark is a
   landmark; the `source` field tracks origin but the data shape, dragging,
   serialization, and downstream-measurement computation are identical.
   This keeps the Heliyon-param panel agnostic of where points came from.
3. **No custom-trained model in this branch.** Claude vision only. v2
   logs drag corrections for a future labeled dataset (out of scope).
4. **Model:** `claude-opus-4-7` for vision. Best accuracy at the cost of
   latency (~3–8s) — acceptable for a manual-trigger action.
5. **Error UX:** server errors surface as a toast with the error code; the
   user retains the option to place landmarks manually instead.
6. **Streaming not used.** The endpoint is request/response — Claude returns
   the full JSON in one shot; no need for SSE/streaming.

### Non-Goals

- DICOM support
- Automatic landmark detection on upload (only on manual trigger)
- Cross-image landmark identity (that's the comparison branch's problem)
- Custom-trained CNN
- Saving Claude's raw response to the DB (only the parsed/placed landmarks
  via the existing annotation save path)

### Privacy boundary (locked per user, carried over)

```
Client (annotate page)
   │  POST /api/viewer/detect-landmarks  { xrayId }
   ▼
Next.js API route
   │  1. auth check (canViewXray on xrayId)
   │  2. fetch image bytes from R2
   │  3. call Anthropic with image bytes ONLY
   ▼
Anthropic Claude vision
   │  receives: image bytes
   │  receives NOT: xrayId, patientId, name, IC, branch, filename, any DB ids
```


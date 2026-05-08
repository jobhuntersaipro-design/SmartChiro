# X-Ray Timeline Comparison + Print

> **Status:** Parked. Will ship after `feat/xray-ai-landmarks` so delta math
> can leverage shared landmark identity in addition to manual measurement IDs.
>
> **Branch (when ready):** `feat/xray-timeline-comparison`
>
> **Companion specs:** `context/features/xray-new-phase-1-spec.md` §AI strategy,
> `context/features/xray-new-phase-3-spec.md` §AI landmark detection (those
> ship first and unlock the auto-delta path described in this spec).

---

## Why both in one branch

The two features reinforce one workflow: a chiropractor doing a pre/post
treatment consult opens comparison mode to talk a patient through the deltas,
then prints the side-by-side view as a takeaway. Without comparison, print is
just a single-image PDF. Without print, comparison is consult-only and the
patient leaves empty-handed. Bundling them keeps the `@media print` stylesheet
work in one place — single-image and two-image layouts share the same header /
measurements / notes template.

---

## Scope

### Patient-scoped timeline comparison

- **Picker scoped to one patient.** Comparison opens from a single patient's
  X-ray gallery (`/dashboard/patients/[id]/details` X-rays tab) or from any
  X-ray's annotate page via a "Compare with…" button. The picker only lists
  X-rays belonging to that patient — never the whole branch's library.
- **Smart defaults on launch.** When comparison opens with a primary X-ray
  selected, auto-pick the secondary based on what's most useful:
  - If the primary is the patient's **latest** X-ray and there are 2+ visits,
    default secondary = the **first** X-ray of the same `viewType` (longest
    timeline span — pre/post a course of treatment).
  - If the primary is the latest and there are exactly 2 X-rays, secondary =
    the only other one.
  - If the primary is mid-timeline, default secondary = the **chronologically
    adjacent** X-ray of the same view type (pre vs current).
  - If no same-view-type sibling exists, fall back to chronologically adjacent
    regardless of view type, with a soft warning chip ("Different view —
    deltas may not align").
- **Auto-match by view type.** Use the existing `Xray.viewType` enum (AP /
  LATERAL / OBLIQUE / etc.) — when the user picks a primary, the secondary
  combobox highlights same-`viewType` candidates and demotes others to a
  "Different view" subgroup. This is a UX nudge, not a hard restriction —
  user can still pick across view types if they want.
- **Delta calculations.** When measurements share a stable identity across
  the two annotations, render the delta inline:
  - **Source 1: shared measurement ID** — `L1` on annotation A vs `L1` on
    annotation B. The IDs are stamped at creation (already shipped). If the
    user wants L1-on-A to compare with L2-on-B, they can rename one.
  - **Source 2: shared AI landmark name** (post-AI-landmarks branch) —
    `top_of_left_femoral_head` on A vs same on B. Auto-paired by `name`.
  - Display: `L1   Femoral head height   A: 12.4 mm  B: 14.1 mm  Δ +1.7 mm`
  - When units don't match (one calibrated, one not), suppress delta and
    show a "Calibrate both to compare" hint.
- **Independent pan/zoom by default.** Each pane has its own viewport state
  — already shipped, swap-bug fixed in the X-Ray Viewer Fine-Tuning branch.
- **Optional sync toggle (NEW).** A "Link views" toggle in the comparison
  toolbar. When ON: panning or zooming one pane mirrors to the other; both
  panes share a single `ViewportState`. When OFF (default): each pane is
  independent. The toggle persists in URL state so a shared link reopens
  with the same setting. Sync mode is most useful when the two images are
  framed similarly (same machine, same positioning); for differently-framed
  images keep it off.

### Print (companion)

- **Browser print dialog** triggered by a Print button in the header
  (alongside Save / Export PNG / Export PDF). Uses `window.print()` against
  a hidden print container — no new component tree.
- **Two layouts driven by `@media print`:**
  - **Single-image** (default annotate page): clinic header + annotated X-ray
    + measurement summary + notes excerpt.
  - **Comparison-mode**: clinic header + two X-rays side-by-side at fit-to-page
    + measurement table with delta column + notes excerpt for the primary.
- **Page header strip** (both layouts):
  - Clinic logo + name from the **active branch** (the user's current branch
    context — not the X-ray's uploading branch, since the print is "from this
    practice's letterhead")
  - Patient name from `Xray.patient` relation
  - Date: in single-image mode, `Xray.createdAt` (study date); in comparison
    mode, both dates rendered as `2026-01-12 → 2026-05-08`
- **Measurement rows** use the stable IDs (L1/A1/C1…) we just shipped:
  - Single: `L1   Femoral head height   12.4 mm`
  - Comparison: `L1   Femoral head height   A: 12.4  B: 14.1  Δ +1.7 mm`
- **Calibrated → mm/mm²; uncalibrated → px/px²**, per measurement (not all
  or nothing — one row can be mm and another px if only one was calibrated).
- **Notes block:** first 200 chars of the most recent `XrayNote` revision,
  ellipsis if truncated. In comparison mode, only the primary X-ray's notes
  show (secondary's notes are usually pre-treatment context the chiro already
  reviewed).
- **Page break logic:**
  - Single-image: targets one page. If the measurement list overflows, it
    spills to page 2 with the same header strip.
  - Comparison: same — one page if it fits (most cases), two if not.
- **Implementation**: `@media print` CSS hides toolbar / sidebar / header
  bar / drawing UI; reveals a `<div className="print-only">` container that's
  invisible on screen. The print container is rendered into the same React
  tree (no separate route); the browser's native print dialog handles paper
  size, orientation, and "Save as PDF".

---

## Architecture

### Where does comparison live?

Two viable shapes; this spec picks **B**:

**A. Enhance existing `/dashboard/xrays/[xrayId]/annotate` with a comparison
toggle.** Reuses the existing canvas, just splits it. Pro: one route to
maintain. Con: the annotate page is already 1,700+ lines; adding comparison
state on top makes it a 2,500-line component.

**B. New route `/dashboard/xrays/compare`** (we already have a half-built
`/dashboard/xrays/compare` route + `/api/xrays/compare`). Pro: clean
separation; the annotate page stays single-image-focused. Con: shapes are
read-only in comparison (drawing happens on the per-X-ray annotate page);
need to navigate back to annotate to edit.

Choosing **B** matches the data flow: comparison reads two annotations and
overlays measurement deltas. It's a viewer mode, not an editor mode. Editing
stays on `/annotate`. The "Compare with…" button in the annotate header
opens `/dashboard/xrays/compare?primary={xrayId}&secondary={pickerSelection}`.

### URL state

```
/dashboard/xrays/compare?primary=xray_A&secondary=xray_B&sync=true|false
```

Shareable links — a doctor can paste the URL to a colleague and they land in
the same comparison view.

### Routes

| Method  | Path                                            | Status                                                                                                                                                                 |
|---------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| GET     | `/api/xrays/compare?ids=xray_A,xray_B`          | Already exists. Verify it returns latest annotation per X-ray + measurements + viewType + createdAt + patient relation.                                                |
| GET     | `/api/patients/[id]/xrays-for-comparison`       | NEW. Patient-scoped X-ray list with `viewType`, `createdAt`, `latestAnnotationId`, and `measurementIds[]` for the picker. Cheaper than full xray list when the picker just needs metadata. |

No new schema. No migration. Comparison is a pure view layer over existing
data.

### Delta math (where it lives)

A pure helper in `src/lib/comparison.ts`:

```typescript
export interface MeasurementPair {
  id: string;            // "L1" / "top_of_left_femoral_head" / etc.
  label: string;         // human-readable
  unitA: 'mm' | 'px' | 'deg' | 'mm²' | 'px²';
  unitB: 'mm' | 'px' | 'deg' | 'mm²' | 'px²';
  valueA: number | null; // null if missing on side A
  valueB: number | null;
  delta: number | null;  // null if either side missing OR units mismatch
}

export function pairMeasurements(
  shapesA: BaseShape[],
  shapesB: BaseShape[],
): MeasurementPair[]
```

Pairing rules (in priority order):
1. Both sides have a `measurementId` and they match → pair.
2. Both sides have `kind: 'landmark'` and the `name` matches → pair (post-AI).
3. Otherwise unpaired (still listed under each X-ray's column, no delta).

Test coverage target: pair-by-id, pair-by-landmark-name, unit-mismatch
suppression, missing-side handling, AI-source vs manual-source mix.

---

## UX flow

### Comparison page

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to patient    Lim Wei Chern    [Patient: visits ▾]         │  ← header
├────────────────────────────────────────────────────────────────────┤
│  ┌─ Primary ─────────┐    ┌─ Secondary ───────┐    [🔗 Link views] │
│  │ AP — 2026-05-08 ▾ │    │ AP — 2026-01-12 ▾ │    [🖨 Print]      │
│  └───────────────────┘    └───────────────────┘                     │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │                      │  │                      │                │
│  │   [Annotated A]      │  │   [Annotated B]      │                │
│  │   pan/zoom A         │  │   pan/zoom B         │                │
│  │                      │  │                      │                │
│  └──────────────────────┘  └──────────────────────┘                │
├────────────────────────────────────────────────────────────────────┤
│  DELTAS                                                             │
│  L1  Femoral head height        A: 12.4 mm  B: 14.1 mm   Δ +1.7 mm │
│  A1  Sacral base angle          A: 47.3°    B: 45.0°     Δ −2.3°   │
│  C1  Cobb angle (L1–L4)         A: 23.5°    B: 19.0°     Δ −4.5°   │
│  L2  Iliac crest difference     A: 8.1 mm   B: —         (B missing)│
└────────────────────────────────────────────────────────────────────┘
```

### Smart-default behavior on launch

- **From annotate page → "Compare":** primary = current xray; secondary =
  most useful sibling (first xray of same view type, or chronologically
  adjacent if there's only one other).
- **From X-rays gallery tab → "Compare":** primary = most recent xray of the
  selected view type; secondary = first xray of that view type. If <2 xrays
  exist, the Compare button is disabled with a tooltip "Need at least 2
  X-rays to compare."

### View-type auto-match in the picker

Each combobox option shows a view-type chip:

```
☉ AP    2026-05-08    Lumbar AP standing
☉ AP    2026-01-12    Lumbar AP standing
─ Other views ───────────────────────────
   LAT   2026-01-12    Lumbar lateral
```

Same-view-type entries grouped at the top; "Other views" sub-section below
with reduced opacity. The auto-default never picks across view types unless
no same-view sibling exists.

### Sync toggle

When ON, pan/zoom on either pane drives both. Mechanism: a single shared
`ViewportState` instead of two. Drawing tools are not in scope for the
comparison page (read-only) so there's no shape-sync to worry about.

### Print button

Same `Print` button works on:
- The single-image annotate page → renders the single-image print layout.
- The comparison page → renders the side-by-side print layout.

The `@media print` stylesheet checks `body[data-comparison="true"]` to switch
layouts. The comparison page sets that data attribute on mount.

---

## Out of scope for this branch

- **AI auto-pairing across treatment courses.** v1 pair-by-name handles
  same-session AI landmarks. Cross-session "this is the same anatomical point
  on a different X-ray" is harder (different angles, different framing) and
  belongs to a future ML-assisted enhancement.
- **Multi-image timeline (3+ X-rays at once).** Pair-wise only for v1.
- **Animated dissolve / overlay between primary and secondary.** Real
  registration requires alignment; dissolving misaligned X-rays is misleading.
- **Side-by-side editing** (drawing a measurement on the comparison page).
  Editing stays on `/annotate`. The Compare button on the annotate header
  makes it 1-click to switch.
- **Treatment outcome scoring / "is this getting better?"** Pure delta math
  only — clinical interpretation is the chiropractor's call.
- **Print of the comparison view as an emailable HTML report.** The OS
  "Save as PDF" path covers digital sharing.

---

## Open questions for review

1. **Does the print include drawn freehand and arrows, or measurement-only?**
   Recommend: include everything — a freehand circle around L4-L5 is part of
   the chiro's narrative. Toggle "include annotations" in print settings if
   needed (defer to v2).

2. **Sync zoom factor: 1:1 pixel-equal, or fit-to-pane-equal?** When the user
   zooms 2× on pane A in sync mode, does pane B zoom to 2× of its own fit
   (matched relative scale) or to the same absolute scale (pane B might zoom
   off-screen if its image is larger)? Recommend matched relative scale —
   each pane interprets the sync as "scale by the same factor relative to my
   own fit-to-pane baseline."

3. **What happens when the patient deletes one of the X-rays mid-session?**
   The comparison view should detect 404 on the `?ids=` fetch and gracefully
   redirect back to the patient page with a toast.

4. **Should "Other views" stay clickable in the picker, or be locked behind
   a confirmation?** Recommend clickable with the soft warning chip — chiros
   sometimes legitimately compare AP vs LAT for one specific landmark.

5. **Calibration mismatch UX.** If A is calibrated and B isn't, what does the
   measurement table show? Recommend: show A in mm and B in px, suppress
   delta with a "calibrate B" inline action.

---

## Build order (when this branch starts)

1. **GET `/api/patients/[id]/xrays-for-comparison`** — patient-scoped
   metadata listing + tests. ~½ day.
2. **`pairMeasurements` helper** in `src/lib/comparison.ts` + unit tests
   covering all pairing rules. ~½ day.
3. **`/dashboard/xrays/compare` page redesign** — reuse `MultiViewGrid`'s
   per-cell viewport (already independent), add picker comboboxes, smart
   default selection, deltas table. ~2 days.
4. **Sync toggle** — single shared `ViewportState` when active, broadcast
   via a small `useSyncedViewports` hook. ~½ day.
5. **`@media print` stylesheet + hidden print container** — render single-
   and comparison-mode layouts, header strip, measurements table, notes
   excerpt. ~1 day.
6. **Print button wiring** in both annotate header and comparison header.
   `window.print()` after a layout-ready RAF. ~½ day.

**Total estimate: ~5 days of solo work.** Add 30% buffer = **~1 week.**

---

## Tests

Following the project's TDD-where-possible pattern:

- **Pure helpers** (vitest):
  - `pairMeasurements` — pair-by-id, pair-by-landmark-name, unit-mismatch,
    one-side-missing, AI-source vs manual mix
  - `pickSmartDefaultSecondary(primary, allXrays)` — latest→first, latest→
    only-other, mid→chronologically-adjacent, no-same-view fallback
- **Integration** (vitest + Neon):
  - `GET /api/patients/[id]/xrays-for-comparison` — RBAC (DOCTOR sees only
    own patients, OWNER/ADMIN sees branch), response shape, viewType groups
- **Component-helper** (vitest):
  - View-type grouping in the picker
  - Calibration-mismatch row rendering
- **No E2E for print** — browser `window.print()` is hard to test
  programmatically. Manual checklist covers it.

---

## After this ships, what's next?

Remaining deferred items from the X-Ray Viewer Fine-Tuning history entry:

- Magnify glass lens
- Rectangle / ellipse area tools
- Exact 5-color palette (green/yellow/red/white/cyan)
- 1/2/3 px stroke chips
- Per-Xray calibration persistence (`Xray.isCalibrated`/`pixelsPerMm`
  promoted out of the per-annotation `imageAdjustments` JSON)

None are blocking. Each is a half-day to two-day standalone branch. The
biggest remaining piece — AI landmark detection — ships *before* this one.

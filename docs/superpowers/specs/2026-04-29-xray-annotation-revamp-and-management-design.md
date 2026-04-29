# X-Ray Annotation Revamp & Management — Design

**Status:** Draft
**Date:** 2026-04-29
**Branch (proposed):** `feat/xray-annotation-revamp-and-management`
**Inspiration:** [MedDream Web Viewer](https://aws.meddream.com/view.html)

---

## 1. Problem

Two surfaces of the X-ray feature need work:

1. **The annotation viewer** at `/dashboard/xrays/[patientId]/[xrayId]/annotate` is hard to use.
   - Tools and chrome compete with the X-ray for screen space (pain F).
   - Mouse buttons are under-used compared to standard medical viewers — chiropractors trained on PACS / MedDream expect right-drag for window/level and wheel-scroll between studies (pain B).
2. **The patient X-Rays tab** at `/dashboard/patients/[patientId]/details` (X-Rays tab) is a bare grid:
   - No notes per X-ray.
   - DELETE has no auth check (security gap).
   - No filters, no batch actions, no inline rename, no delete confirm, no annotation count badge.
   - Owner / doctor expectations around upload + delete + notes aren't met.

This spec ships both as one PR.

## 2. Goals

- Reduce annotation-viewer chrome, increase image area, adopt MedDream-style mouse conventions.
- Let owners and doctors of a patient's branch upload, rename, delete, and write versioned notes for any X-ray of that patient.
- Close the auth gap on `PATCH /api/xrays/[id]` and `DELETE /api/xrays/[id]`.
- Remove the orphaned `calibration` tool from the toolbar (it has no working dialog or API since `xray-enhance-3`).

## 3. Non-Goals

- DICOM import.
- Re-introducing the calibration tool / mm measurements (still on Phase 2 roadmap).
- Window-level clinical presets (bone / soft tissue) — not needed for chiropractic JPEG/PNG X-rays.
- A clinic-wide X-ray library route at `/dashboard/xrays`.
- Replacing the existing PatientImageSidebar / multi-view grid — they stay.

## 4. Architecture Overview

Two surfaces, one PR, shared permission helper.

```
/dashboard/patients/[id]/details (X-Rays tab)   ── upgrades in place ──┐
                                                                       │
/dashboard/xrays/[patientId]/[xrayId]/annotate  ── viewer revamp ──────┤
                                                                       │
                                       ┌───────────────────────────────┘
                                       ▼
                       New API: /api/xrays/[id]/notes (GET / POST)
                       Updated API: /api/xrays/[id] (auth check on PATCH/DELETE)
                       Updated API: /api/xrays/upload-url, /api/xrays/upload (auth check)
                       New helper:  src/lib/auth/xray.ts → canManageXray(user, xray)
                       New model:   XrayNote (revisions; current = latest)
```

## 5. Data Model

### 5.1 New: `XrayNote`

```prisma
model XrayNote {
  id        String   @id @default(cuid())
  bodyMd    String   // markdown / plain text — rendered as plain text in MVP

  xrayId    String
  xray      Xray     @relation(fields: [xrayId], references: [id], onDelete: Cascade)

  authorId  String
  author    User     @relation("XrayNoteAuthor", fields: [authorId], references: [id])

  createdAt DateTime @default(now())

  @@index([xrayId, createdAt])
  @@index([authorId])
}
```

`Xray.notes XrayNote[]` back-relation. `User."XrayNoteAuthor"` back-relation.

**Semantics:**

- Each save inserts a new row (no in-place updates).
- "Current note" = `findFirst({ where: { xrayId }, orderBy: { createdAt: "desc" } })`.
- "History" = same query without `take: 1`.
- Empty body is allowed (clears the note); the empty row still appears in history with an "(cleared)" marker rendered client-side.

### 5.2 `Xray` model

No schema changes. The orphaned calibration columns (`isCalibrated`, `pixelsPerMm`, `calibrationNote`) stay in the DB to avoid migration churn and to keep the door open for Phase 2 calibration. They're already nullable and unused in code paths after this PR.

### 5.3 Migration

`prisma migrate dev --name add_xray_note` — single forward migration adding `XrayNote` table and its indexes.

## 6. Permissions

### 6.1 Helper

`src/lib/auth/xray.ts`:

```ts
export type XrayCapability = "read" | "manage";

export async function getXrayCapability(
  userId: string,
  xrayId: string
): Promise<XrayCapability | null>;

export async function canManageXray(
  userId: string,
  xrayId: string
): Promise<boolean>;
```

**Logic:**

1. Load `Xray` → `Patient` → `branchId`.
2. Find the user's `BranchMember` row for that `branchId`.
3. No membership → `null` (treat as 404 to avoid existence leaks).
4. Membership with role `OWNER`, `ADMIN`, or `DOCTOR` → `"manage"`.
5. (`VIEWER` is not yet a real role in `BranchRole`, but the helper is built to add it later by returning `"read"`.)

### 6.2 Capability matrix

| Action | OWNER | ADMIN | DOCTOR | not in branch |
| --- | :-: | :-: | :-: | :-: |
| GET X-ray / annotations / notes | ✅ | ✅ | ✅ | ❌ |
| Upload X-ray to patient | ✅ | ✅ | ✅ | ❌ |
| Rename / edit metadata | ✅ | ✅ | ✅ | ❌ |
| Delete (archive) X-ray | ✅ | ✅ | ✅ | ❌ |
| Create / view notes | ✅ | ✅ | ✅ | ❌ |

A future `VIEWER` role would get GET-only.

## 7. API Surface

### 7.1 New routes

**`GET /api/xrays/[xrayId]/notes`**

```jsonc
// 200
{
  "current": { "id": "...", "bodyMd": "...", "author": { "id":"...", "name":"..." }, "createdAt": "..." } | null,
  "history": [ /* same shape, oldest last */ ]
}
```

**`POST /api/xrays/[xrayId]/notes`**

```jsonc
// body
{ "bodyMd": "string, max 10_000 chars" }

// 201
{ "current": { ... }, "history": [ ... ] }
```

Validation: `bodyMd` is a string (trimmed), max 10,000 chars. Empty string is allowed.

### 7.2 Tightened existing routes

All four gain `canManageXray(session.user.id, xrayId)` (or the upload variant: branch-membership of the patient) and return `404` on `null`:

- `PATCH /api/xrays/[xrayId]` — currently no auth. Allowlist extends to `status` so the restore flow (§8.7) can flip `ARCHIVED` → `READY`.
- `DELETE /api/xrays/[xrayId]` — currently no auth.
- `POST /api/xrays/upload-url` — currently no patient-level auth.
- `POST /api/xrays/upload` — currently no patient-level auth.

### 7.3 Error contract

Standard project shape: `{ error: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR", message: string }`.

## 8. Patient X-Rays Tab — UX

Replaces the current `PatientXraysTab`. Lives at the same import path.

### 8.1 Header

- Sticky at top of tab (below patient header).
- Left: count `X-Rays (12)`.
- Middle: filter chip row — Body region, View type, Date (last 7d / 30d / all). Multi-select chips.
- Right: sort dropdown (Newest / Oldest / Title A-Z), batch toggle (`Select`).
- "Upload X-Ray" primary button (existing) — clicking it expands the inline drop zone (current pattern, preserved).

### 8.2 Upload zone

- Always visible drag target across the entire tab body when files are being dragged in (full-tab dropzone overlay). Solves the discoverability problem of the current "click Upload first" flow.
- Multi-file batch (already works in `PatientImageSidebar`; reuse the queue logic).

### 8.3 Card grid

Each card:

- Thumbnail (160×120, `#1A1F36` bg, `object-contain`).
- Status chip in top-left: `Uploading` (spinner) / `Ready` (none, omitted) / `Archived` (gray).
- Annotation count chip in top-right: `2 annotations` (purple if >0).
- Body: title (inline editable on click), body region pill, view type pill, date.
- Notes preview line (single-line truncate) below the date if a current note exists. If empty: `Add notes…` link.
- Hover: kebab menu top-right with `Open`, `Rename`, `Edit metadata`, `Edit notes`, `Delete`.

Click card body (not kebab) → opens the annotate viewer in a new tab (current behavior preserved).

### 8.4 Batch mode

- Toggle activates checkboxes on cards.
- Bottom toolbar appears: `N selected · Delete · Cancel`.
- Delete shows confirm dialog listing the X-ray titles.

### 8.5 Notes drawer

Right-side `<Sheet>` (shadcn) opened from kebab → `Edit notes` or from the annotation viewer.

- Header: X-ray title + body region pill.
- Current note: large `<textarea>`, plain text, max 10,000 chars (counter shown when >9,000).
- `Save note` button (primary). Disabled when content unchanged.
- "History" expandable section below: list of past revisions, newest first, `Author · time-ago`. Each item shows a 3-line preview; clicking expands to full body. No restore action in MVP — copy/paste if you need to revert.

### 8.6 Delete confirm

Standard `<AlertDialog>`: "Archive this X-ray? Annotations will be preserved but it'll be hidden from the patient's gallery. This can be undone by support."

### 8.7 Archived X-rays

Default listing excludes `status === "ARCHIVED"`. A "Show archived" toggle in the filter chip row lets the user reveal them; archived cards render with the gray status chip and the kebab menu shows `Restore` (sets status back to `READY`) instead of `Delete`.

### 8.8 Empty state

Unchanged copy ("No X-rays uploaded yet") but the upload zone is now front and center instead of behind a button click.

## 9. Annotation Viewer — UX Revamp

Lives at `/dashboard/xrays/[patientId]/[xrayId]/annotate`. The shell, multi-view grid, and properties panel stay; the chrome and input mapping change.

### 9.1 Layout (single view)

```
┌─────────────────────────────────────────────────────────────────┐
│ Top bar (40px white)                                            │
│ Patient › Title✏     Adjust  Notes  Save✓  ✕                    │
├──┬──────────────────────────────────────────────────┬───────────┤
│  │                                                  │  Series   │
│L │                                                  │  thumbs   │
│e │                                                  │  (right   │
│f │                  Canvas (#0a1220)                │   edge,   │
│t │                                                  │  64px,    │
│  │                                                  │  collap-  │
│r │                                                  │  sible)   │
│a │                                                  │           │
│i │                                                  │           │
│l │                                                  │           │
├──┴──────────────────────────────────────────────────┴───────────┤
│ Status bar (28px) — zoom · fit · 1:1 · annotation count · tool  │
└─────────────────────────────────────────────────────────────────┘
```

The existing right Properties panel slides over the series strip when the user expands it (Layers / Measurements / Notes tabs). Default: collapsed. Auto-expand on first measurement (existing behavior, preserved).

### 9.2 Left rail (`44px` wide, `#0a1220` bg)

Tools, top to bottom, grouped by separators:

- **Navigate** — Hand (`H`)
- **Draw** — Freehand (`P`), Line (`L`), Text (`T`), Eraser (`X`)
- **Measure** — Ruler (`M`), Angle (`Shift+M`), Cobb Angle (`Cmd+Shift+M`)

Removed: **Calibration** (orphaned since enhance-3 — no dialog, no API).

Active tool: filled `#533afd` chip with white icon; inactive: `rgba(255,255,255,.06)` bg + `#cdd5e2` icon. Hover shows existing tooltip pattern (label + shortcut + description). Undo/redo move to the **status bar** so the rail stays purely for tool selection.

### 9.3 Top bar

- Left: breadcrumb `Patient › Title✏` (existing inline-editable title preserved).
- Right (in order): `Adjust` (existing popover), `Notes` (new — opens drawer), `Save`, `✕`.
- The `?` shortcuts button moves into the `Adjust` popover footer to free space.

### 9.4 Series strip (right edge, new)

- 64px wide expanded, 18px collapsed. Toggle by clicking the small chevron at the top.
- Lists all X-rays of the same patient (most recent first).
- Each thumbnail: 56×56, label below = body region abbreviation + date.
- Current X-ray highlighted with a `#533afd` left bar.
- Click a thumbnail → navigate to `/dashboard/xrays/{patientId}/{xrayId}/annotate`. Auto-save fires before navigation (existing autosave path).
- This deprecates the old left `PatientImageSidebar` for single view (it remains for grid views, where it's needed).

### 9.5 Mouse / wheel conventions

| Input | Action |
| --- | --- |
| Left button + drag | Active tool (draw, measure, etc.) |
| **Middle button + drag** | Pan canvas |
| **Right button + drag** | Window / Level — horizontal drag = window center, vertical = window width (mapped to brightness/contrast under the hood) |
| Wheel (no modifier) | **Scroll between X-rays in the series strip** |
| Ctrl + wheel | Zoom |
| Shift + wheel | Window/level fine-tune (1px per tick) |
| Pinch on trackpad | Zoom |
| Right-click long-press (≥350 ms with no movement) | Context menu (open notes, copy measurement values, delete shape, etc.) |

Right-button drag is detected on `pointerdown` button === 2 with `preventDefault()` on `contextmenu` for the canvas only (long-press still fires the menu after release because the drag is gated by movement).

These behaviors live in a new `useViewerInputs` hook so the existing tool handlers stay focused on tool logic.

### 9.6 First-run overlay

- Shown the first time a user opens any annotate page.
- Modal-style overlay with 4 tile cards: pan / window-level / scroll-series / zoom — each with a mini-icon and one-line text.
- "Got it" CTA stores `localStorage["smartchiro:viewer-firstrun-v1"] = "1"`. Versioned so we can re-show on future major changes.
- Help icon `?` in shortcuts panel re-opens it on demand.

### 9.7 Notes drawer (shared with §8.5)

Same drawer, opened from the top-bar `Notes` button. Save returns the user to the canvas; current note becomes a small badge on the `Notes` button (`Notes • 1`).

### 9.8 Cleanup pass

- Remove `calibration` from `ToolId` union (`src/types/annotation.ts`), from the toolbar, from the keyboard handler, from any tests asserting it.
- Delete the "Uncalibrated" status text in `StatusBar.tsx` and any related calibration UI strings.
- Leave the DB columns; mark them in a code comment as "reserved for Phase 2 calibration".

## 10. State, Hooks, & Components

**New components:**

- `src/components/annotation/SeriesStrip.tsx`
- `src/components/annotation/FirstRunOverlay.tsx`
- `src/components/annotation/NotesDrawer.tsx` (shared with X-Rays tab)
- `src/components/xray/XrayCard.tsx` (split from `PatientXraysTab`)
- `src/components/xray/XrayCardKebab.tsx`
- `src/components/xray/XrayFilterBar.tsx`
- `src/components/xray/XrayBatchToolbar.tsx`
- `src/components/xray/DeleteXrayDialog.tsx`

**New hooks:**

- `src/hooks/useViewerInputs.ts` — wires middle-drag, right-drag, modifier-aware wheel.
- `src/hooks/useXrayNotes.ts` — fetches notes, mutates with optimistic update.

**Updated:**

- `src/components/annotation/AnnotationToolbar.tsx` — repaints as left rail; removes calibration; moves undo/redo out.
- `src/components/annotation/AnnotationHeader.tsx` — adds `Notes` button.
- `src/components/annotation/StatusBar.tsx` — adopts undo/redo; removes "Uncalibrated".
- `src/components/patients/PatientXraysTab.tsx` — orchestrates new sub-components.
- `src/lib/auth/xray.ts` — new helper, replaces inline auth code.

## 11. Testing Strategy

### 11.1 Unit / integration (vitest)

- `xray-notes.api.test.ts` — POST creates revision, GET returns current + history ordering, validation, role enforcement (4 roles × 2 endpoints = 8 cases).
- `xray-rbac.test.ts` — rerun the 4 mutation routes (PATCH, DELETE, upload-url, upload) for OWNER, ADMIN, DOCTOR, non-member (16 cases). Assert non-member gets 404 (no existence leak).
- `useViewerInputs.test.ts` — synthesize pointer/wheel events, assert pan / W-L / scroll-series / zoom branches.
- `SeriesStrip.test.tsx` — renders thumbnails, highlights current, click navigates.
- `NotesDrawer.test.tsx` — typing → save → optimistic update → history list grows.
- `XrayFilterBar.test.tsx` — chip toggles emit correct filter state; empty state when filters exclude everything.
- Toolbar snapshot test confirms calibration tool is gone.

### 11.2 Manual

Documented in PR description:

1. Upload 3 X-rays → drag-drop multi-file works.
2. Rename inline → persists.
3. Add a note, edit it, see history grow.
4. Delete with confirm → archives.
5. From annotator: middle-drag pans; right-drag adjusts brightness; wheel scrolls between X-rays; Ctrl+wheel zooms.
6. First-run overlay shows on first visit, dismisses, doesn't return.

### 11.3 Out of scope

- Playwright smoke tests (current project doesn't run them in CI).
- Pixel-perfect visual regression.

## 12. Rollout

- Single PR off `feat/xray-annotation-revamp-and-management`.
- Ship behind no flag — additive (new model + new routes) and refactoring (UX of two existing surfaces). No breaking data changes.
- Bump `localStorage` first-run key to force the overlay for everyone once.

## 13. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Right-button drag conflicts with browser context menu | Suppress `contextmenu` on the canvas; surface our own menu via long-press |
| Wheel-scroll-series surprises web users | First-run overlay; setting in profile (Phase 2) to revert to "wheel = zoom" |
| Notes audit log balloons | Soft cap at 100 revisions / X-ray (oldest dropped); enforced in the POST route |
| Auth helper is wrong → users get 403/404 unexpectedly | RBAC test matrix exhaustively covers it |
| Removing calibration breaks anything | Already orphaned — no callers; tests confirm |

## 14. Open Questions / Future

- Phase 2 brings back calibration with a real dialog and `pixelsPerMm` flow. The DB columns and the `isCalibrated` field stay reserved.
- Phase 2 may add `VIEWER` role and read-only sharing; the auth helper is shaped to extend.
- Window-level clinical presets if user research shows demand.

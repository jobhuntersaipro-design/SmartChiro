# X‑Ray Annotation Spec — Part 1: Enhancement

## Overview
Enhance the X-ray annotation page with better navigation, inline editing, improved tool defaults, and batch upload support.

---

## Requirement 1: Patient Name → Patient Detail Page

**What:** Clicking the patient name in the annotation header breadcrumb should navigate to `/dashboard/[patientId]`.

**Current state:**
- Patient name is displayed as plain text in `src/components/annotation/AnnotationHeader.tsx` (breadcrumb: "John Doe > Untitled X-ray")
- No `/dashboard/[patientId]` route exists yet

**Implementation:**

### 1a. Create Patient Detail Page (simple placeholder)
- Route: `src/app/dashboard/[patientId]/page.tsx`
- Server component that fetches patient data from Prisma by `patientId`
- Display: patient name, contact info, list of X-rays with links back to annotation pages
- Use the standard dashboard layout (sidebar + top bar)
- Keep it minimal — this page will be enhanced in a future spec

### 1b. Make Patient Name Clickable
- In `AnnotationHeader.tsx`, wrap the patient name `<span>` with a Next.js `<Link>` to `/dashboard/${patientId}`
- Style: add `cursor-pointer`, `hover:underline`, keep existing color `#697386`
- `patientId` is already available — it's in the route params and passed through props

**Files to touch:**
- `src/app/dashboard/[patientId]/page.tsx` (new)
- `src/components/annotation/AnnotationHeader.tsx` (edit)

---

## Requirement 2: Inline X-Ray Title Editing

**What:** Clicking "Untitled X-ray" in the header should let users edit the title inline, with a subtle animation to hint editability.

**Current state:**
- X-ray title rendered as a static `<span>` in `AnnotationHeader.tsx`
- Title comes from `xray.title ?? "Untitled X-ray"` (server-side fallback)
- PATCH `/api/xrays/[xrayId]` already exists for updating X-ray metadata

**Implementation:**

### 2a. Inline Edit Component
- Replace the static title `<span>` with an inline-editable component
- **Display mode:** shows title text with a subtle pencil icon on hover (Lucide `Pencil` icon, 12px, `#A3ACB9`, fades in)
- **Edit mode:** clicking transforms into a text `<input>`, auto-focused, pre-filled with current title
- **Save:** on Enter or blur, PATCH to `/api/xrays/[xrayId]` with `{ title: newTitle }`
- **Cancel:** on Escape, revert to original title
- **Validation:** trim whitespace, if empty revert to "Untitled X-ray"

### 2b. Subtle Animation Hints
- On first load (or when title is "Untitled X-ray"), add a gentle pulse/glow animation on the title to hint it's editable
- CSS: `@keyframes subtle-pulse` — brief border-bottom highlight that plays once, 1.5s duration
- On hover: smooth transition to show pencil icon (`opacity 0→1, 150ms ease`)
- On click→edit transition: smooth width expansion of the input (`transition: width 200ms ease`)

### 2c. Optimistic Update
- Update the displayed title immediately on save (don't wait for API response)
- Show a brief checkmark or subtle green flash on successful save
- On error, revert to previous title and show toast

**Files to touch:**
- `src/components/annotation/AnnotationHeader.tsx` (edit — add inline edit logic)
- `src/app/globals.css` (add subtle-pulse keyframe if needed)

---

## Requirement 3: Default Tool & Toolbar Improvements

**What:** Change default tool to Pan (hand), remove the mouse/select cursor tool, and add useful tool hints.

**Current state:**
- Default tool is `"select"` (mouse pointer) — set in `useCanvasInteraction.ts` line 43
- 15 tools defined in `AnnotationToolbar.tsx` with icons and keyboard shortcuts
- Tools: select, hand, freehand, line, polyline, arrow, rectangle, ellipse, bezier, text, eraser, ruler, angle, cobb_angle, calibration_reference
- No tooltips or usage instructions on tools

**Implementation:**

### 3a. Change Default Tool
- In `src/hooks/useCanvasInteraction.ts`, change default from `"select"` to `"hand"`
- Ensure Pan tool behavior works correctly on initial load (it should — hand tool already exists)

### 3b. Remove Select (Mouse) Tool
- Remove `"select"` from the `ToolId` type in `src/types/annotation.ts`
- Remove the select tool entry from `tools` array in `AnnotationToolbar.tsx`
- Update any code that references `"select"` tool to use `"hand"` as fallback
- Re-assign keyboard shortcut: "V" can be removed or reassigned
- **Important:** Ensure shape selection still works — selection behavior should activate when clicking on existing shapes regardless of active tool (except eraser), or consider keeping selection as a behavior within the hand/pan tool

### 3c. Add Tool Tooltips/Instructions
- Add a tooltip on hover for each tool button showing:
  - Tool name (bold)
  - One-line description of what it does
  - Keyboard shortcut
- Use a lightweight tooltip (not a modal/popover that blocks the canvas)
- Position: appear below or to the right of the toolbar button
- Delay: 400ms hover delay before showing (don't trigger on quick passes)
- Style: dark background (`#0A2540`), white text, `rounded-[4px]`, `text-xs`, max-width 200px

**Tool descriptions:**
| Tool | Description |
|------|-------------|
| Pan | Click and drag to move around the X-ray |
| Freehand | Draw freely with your cursor |
| Line | Draw a straight line between two points |
| Polyline | Draw connected line segments, double-click to finish |
| Arrow | Draw an arrow pointing in one direction |
| Rectangle | Draw a rectangle by clicking and dragging |
| Ellipse | Draw an ellipse or circle (hold Shift for circle) |
| Bezier | Draw a smooth curve with control points |
| Text | Click to add a text label |
| Eraser | Click on any annotation to remove it |
| Ruler | Measure distance between two points |
| Angle | Measure the angle between three points |
| Cobb Angle | Measure Cobb angle between two lines |
| Calibration | Set a known distance for accurate measurements |

### 3d. Add More Useful Tools (Optional Enhancements)
Consider adding these to the toolbar if time permits:
- **Zoom In / Zoom Out** buttons (currently only scroll/pinch zoom exists) — shortcuts `+` / `-`
- **Fit to Screen** button — shortcut `0` — resets zoom to fit the full image
- **Reset View** — shortcut `Home` — resets zoom + pan to default

**Files to touch:**
- `src/types/annotation.ts` (edit — remove `"select"` from ToolId)
- `src/hooks/useCanvasInteraction.ts` (edit — change default tool)
- `src/components/annotation/AnnotationToolbar.tsx` (edit — remove select, add tooltips, optionally add zoom tools)
- `src/hooks/useDrawingTools.ts` (audit — ensure no hard dependency on select tool)

---

## Requirement 4: Batch X-Ray Upload from Annotation Page

**What:** Allow doctors to upload additional X-rays (single or batch) directly from the X-ray annotation page.

**Current state:**
- `XrayUpload` component exists (`src/components/xray/XrayUpload.tsx`) — used in patient detail sheet on /dashboard/patients
- Upload API at `/api/xrays/upload` handles single file upload to R2
- PatientImageSidebar (`src/components/annotation/PatientImageSidebar.tsx`) shows patient's X-rays on the left
- No upload trigger exists on the annotation page itself

**Implementation:**

### 4a. Add Upload Button to Patient Image Sidebar
- Add an "Upload" button at the top of `PatientImageSidebar` (below the patient name/header area)
- Icon: `Upload` from Lucide, with label "Upload X-ray"
- Style: secondary button (white bg, `#E3E8EE` border, `rounded-[4px]`)
- Clicking opens an upload dialog/modal

### 4b. Upload Dialog with Batch Support
- Modal dialog using shadcn `Dialog` component
- Reuse the existing `XrayUpload` component inside the dialog
- **Batch enhancement:** modify `XrayUpload` to accept multiple files
  - Change file input to `multiple`
  - Show a list of selected files with individual progress bars
  - Upload files sequentially (not in parallel — avoid overwhelming R2)
  - Show per-file status: pending → uploading → complete / error
  - Allow removing individual files from the queue before upload starts
- **File limit:** max 20 files per batch upload
- **Auto-refresh:** after upload completes, refresh the PatientImageSidebar thumbnail list to show new X-rays

### 4c. Drag-and-Drop on Sidebar
- Allow dragging files directly onto the PatientImageSidebar area as an alternative to the upload button
- Show a visual drop zone indicator when dragging files over the sidebar
- Same batch upload flow as 4b

**Files to touch:**
- `src/components/annotation/PatientImageSidebar.tsx` (edit — add upload button + drop zone)
- `src/components/xray/XrayUpload.tsx` (edit — add batch support with `multiple` input)
- Possibly a new `src/components/xray/XrayUploadDialog.tsx` if the dialog wrapper is complex enough

---

## Implementation Order

1. **Requirement 3** (tool defaults + tooltips) — lowest risk, self-contained
2. **Requirement 2** (inline title editing) — self-contained UI change
3. **Requirement 1** (patient detail page link) — creates a new route
4. **Requirement 4** (batch upload) — most complex, touches upload pipeline

## Testing

- `npm run build` must pass with no errors
- Manual verification in browser for each requirement
- Verify keyboard shortcuts still work after tool changes
- Test inline title edit with empty strings, long strings, special characters
- Test batch upload with 1 file, multiple files, and mixed valid/invalid files

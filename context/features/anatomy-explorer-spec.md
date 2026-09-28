# Anatomy Explorer (3D Skeleton & Muscles)

## Overview

New sidebar page at `/dashboard/anatomy` with an interactive 3D body map, inspired
by the "tap a body region and it zooms in" anatomy reels. Two layers:

- **Skeleton**: 243 selectable structures, including every vertebra C1–L5
  (labelled with level codes), 23 intervertebral discs (C2–C3 … L5–S1), skull,
  rib cage, pelvis and limbs.
- **Muscles**: 435 selectable muscle parts in 11 regions, drawn over a
  non-interactive skeleton underlay that can be toggled. About 5M triangles
  with 16-bit positions (20 MB).

## Interaction

- Drag the model to rotate it. Drag empty space beside the model to move
  (pan) the view, like the X-ray viewer's hand tool; a pointer-down raycast
  decides which. The cursor shows a grab hand over empty space. Right-drag also
  pans, and scroll zooms (camera-controls).
- Hover shows a tooltip; click selects and flies the camera to the part.
  Posterior parts are viewed from behind and lateral parts from their side
  (`focusView` in `src/lib/anatomy/camera.ts`).
- Shift / Cmd / Ctrl + click toggles multi-select without moving the camera.
- Esc clears. "Isolate selection" ghosts everything except the selection.
- Side panel: selection card (Focus / Clear), search (matches labels and level
  codes, e.g. `L5`), collapsible anatomical groups with per-group hide/show.
- Selections are kept separately for each layer while switching tabs.

### Clinical muscle groups (Muscles tab)

- A click in 3D selects the whole **clinical group on that side**, e.g. right
  Quadriceps, Hamstrings, Rotator cuff, Erector spinae or Calf. There are 47
  groups, defined in `scripts/anatomy-muscle-groups.mjs` and matched by
  muscle name within the muscle's body region. Hovering highlights the whole
  group, and the tooltip names the group and the muscle under the cursor.
- Alt+click selects a single muscle. Shift/Cmd/Ctrl+click adds to or removes
  from the selection.
- Side panel: region → clinical group → muscles. A group's name selects both
  sides; its R / L buttons select one side. The selection card collapses a
  fully selected group into one entry listing its members.
- Focus views a group from its own outward direction (its explode vector),
  e.g. quadriceps from the front.

### Seeing deeper muscles (Muscles tab)

- **Peel to**: Superficial / Intermediate / Deep. Each muscle has a depth
  layer (238 / 164 / 33) worked out at build time by a voxel peel in
  `scripts/anatomy-layers.mjs`: a muscle is exposed when a clear line of sight
  runs from its surface out of the body (bones block it). Superficial muscles
  are removed and the test repeats. Two overrides cover BodyParts3D quirks
  (the rectus sheath is modelled on the external oblique, and the deep calf
  flexors surface only as tendons).
- **Expand** slider (exploded view, 0–100%) works in two levels. First each
  clinical group moves away from its anchor: the body axis for the trunk, the
  limb's axis for limbs, and its own centroid for the hands and feet. Then the
  muscles within each group spread around the group's centre. At full
  expansion that is roughly 10–25 cm. Superficial muscles get extra lift, and
  movement of limb groups toward the midline is damped so the two legs'
  adductors don't collide.
- The per-group **Expand** button in the side panel limits expansion to the
  chosen groups. With no group picked it applies to the whole body.
- Rows show a muscle's layer. Rows for muscles that are peeled away are dimmed,
  and selecting one moves the peel to its layer.
- The model loads with a byte-level progress bar, and hovering the Muscles tab
  prefetches the model.

## Assets

- Source: BodyParts3D v3.0 (CC BY-SA 2.1 JP). Attribution is shown in the
  viewer, and `public/models/anatomy/LICENSE.txt` ships with the models.
- `scripts/build-anatomy-models.mjs <bp3d-checkout>` converts about 20.6M source
  triangles to about 5.8M (skeleton 0.76M / 3.3 MB, muscles 5.0M / 20.4 MB,
  meshopt-compressed GLB) and writes `src/lib/anatomy/manifest.json` (id,
  label, group, side, spinal level, plus depth layer and explode vector for
  muscles). The build takes about 70 s.
- Loading needs no CDN: meshopt decoding is bundled and lighting uses the
  procedural `RoomEnvironment`.

## Libraries

`three`, `@react-three/fiber`, `@react-three/drei`. Build-time only:
`@gltf-transform/*`, `meshoptimizer`.

## Out of scope / follow-ups

- Saving selected regions to a patient record or visit (e.g. pain map on SOAP
  notes).
- Female model and higher-detail per-region models (BodyParts3D 3.0 is a single
  male model).
- Serving GLBs from R2/CDN instead of `public/`.

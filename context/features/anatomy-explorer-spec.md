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

- Drag to rotate, right-drag to pan, scroll to zoom (camera-controls).
- Hover shows a tooltip; click selects and flies the camera to the part.
  Posterior parts are viewed from behind and lateral parts from their side
  (`focusView` in `src/lib/anatomy/camera.ts`).
- Shift / Cmd / Ctrl + click toggles multi-select without moving the camera.
- Esc clears. "Isolate selection" ghosts everything except the selection.
- Side panel: selection card (Focus / Clear), search (matches labels and level
  codes, e.g. `L5`), collapsible anatomical groups with per-group hide/show.
- Selections are kept separately for each layer while switching tabs.

### Seeing deeper muscles (Muscles tab)

- **Peel to**: Superficial / Intermediate / Deep. Each muscle has a depth
  layer (238 / 164 / 33) worked out at build time by a voxel peel in
  `scripts/anatomy-layers.mjs`: a muscle is exposed when a clear line of sight
  runs from its surface out of the body (bones block it). Superficial muscles
  are removed and the test repeats. Two overrides cover BodyParts3D quirks
  (the rectus sheath is modelled on the external oblique, and the deep calf
  flexors surface only as tendons).
- **Expand** slider (exploded view, 0–100%): muscles ease outward from their
  limb's axis (trunk: the body axis; hands and feet: their own centroid).
  Superficial muscles travel furthest, which opens gaps onto deeper ones.
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

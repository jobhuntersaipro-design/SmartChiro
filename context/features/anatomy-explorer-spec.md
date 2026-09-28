# Anatomy Explorer (3D Skeleton & Muscles)

## Overview

New sidebar page at `/dashboard/anatomy` with an interactive 3D body map, inspired
by the "tap a body region and it zooms in" anatomy reels. Two layers:

- **Skeleton**: 243 selectable structures, including every vertebra C1–L5
  (labelled with level codes), 23 intervertebral discs (C2–C3 … L5–S1), skull,
  rib cage, pelvis and limbs.
- **Muscles**: 435 selectable muscle parts in 11 regions, drawn over a
  non-interactive skeleton underlay that can be toggled.

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

## Assets

- Source: BodyParts3D v3.0 (CC BY-SA 2.1 JP). Attribution is shown in the
  viewer, and `public/models/anatomy/LICENSE.txt` ships with the models.
- `scripts/build-anatomy-models.mjs <bp3d-checkout>` converts about 20.6M source
  triangles to about 1.55M (skeleton 3.3 MB, muscles 3.8 MB meshopt-compressed
  GLB) and writes `src/lib/anatomy/manifest.json` (id, label, group, side,
  spinal level).
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

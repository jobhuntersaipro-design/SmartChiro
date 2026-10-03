# AI Pelvis Analysis — validity check, 16 landmarks, 10 parameters

Source paper: Moon K-R, Byon SS, Kim SH, Lee B-D. *Automated assessment of pelvic
radiographs using deep learning: A reliable diagnostic tool for pelvic
malalignment.* Heliyon 2024;10(8):e29677. https://pmc.ncbi.nlm.nih.gov/articles/PMC11040132/

Replaces the AI parts of `xray-ai-landmarks-goals.md` (that branch's panel never
worked: detection emitted `top_of_femoral_head_1` while the analysis looked up
`top_of_left_femoral_head`, so every parameter showed "Missing").

## Flow

`Detect landmarks` in the X-ray viewer → `POST /api/viewer/detect-landmarks { xrayId, view }`
(`view` = the viewer's rotation and vertical flip). The server checks access, fetches the
film from R2, turns it upright as the viewer shows it, and sends **image pixels only** to
Claude (`claude-opus-5-5`, structured JSON output, server-side refusal fallback). Points
come back in the stored film's pixels; the whole run has a 105 s budget (504 `TIMEOUT`
after that) and stops when the browser gives up.

1. **Check (pass 1, effort low).** Whole film, downscaled. Reports: radiograph or not,
   projection, region, which pelvic structures are fully visible, hip implant, drawn
   overlays, quality, the R/L side marker and a box around the bony pelvis.
   `decideSuitability` (pure code) **rejects** unless: radiograph · AP or PA · both
   iliac crests, both femoral heads, sacrum and symphysis visible · upright · no hip
   implant · quality not poor. This is the paper's inclusion rule ("the region from the iliac
   crest to the femoral head") plus its implant exclusion. Rejection → HTTP 422
   `NOT_SUITABLE` with plain-language reasons, shown in a dialog.
   Accepted with warnings: ischial tuberosities out of view (common on full-spine
   films; landmarks 4/6 dropped, IM not measurable), burnt-in marks, fair quality.
2. **Detect (pass 2, effort high).** Crop to the pelvis box (+6%), ask for the 16
   landmarks three times in parallel, take the per-landmark median. Confidence =
   model confidence × agreement between runs; spatial order rule (14, 11, 13, 7, 15,
   12, 16 along S2) halves confidence where violated; refinement never raises it.
3. **Refine (pass 3, effort medium).** Landmarks 1–6 and 8 only: zoomed crop with a
   marker at the estimate; accept the adjustment if it stays near the estimate.

Patient side: the R/L marker decides which image side is the patient's right; without
one, the standard AP convention (patient's right on the image left) is assumed.

## Landmarks (paper Fig. 2; paper "left" = image left)

| # | Landmark | # | Landmark |
|---|---|---|---|
| 1 | Top of image-left femoral head | 9 | Image-left sacral groove |
| 2 | Top of image-right femoral head | 10 | Image-right sacral groove |
| 3 | Top of image-left iliac crest | 11 | Lateral image-left sacrum (S2 level) |
| 4 | Bottom of image-left ischial tuberosity | 12 | Lateral image-right sacrum |
| 5 | Top of image-right iliac crest | 13 | Medial image-left (PSIS shadow on sacrum) |
| 6 | Bottom of image-right ischial tuberosity | 14 | Lateral image-left ilium |
| 7 | Second sacral tubercle (S2) | 15 | Medial image-right (PSIS shadow on sacrum) |
| 8 | Centre of the pubic symphysis | 16 | Lateral image-right ilium |

Stored as `landmark` shapes: `landmarkName` = catalog key (`src/lib/pelvic-landmarks.ts`),
`landmarkSide` = patient R/L, `landmarkConfidence`, `landmarkOriginalX/Y` for Reset to AI.

## Parameters (paper Table 2) — `src/lib/pelvic-analysis.ts`

Femur base line (FBL) = line 1–2 (`u` direction, `n` normal).

| Param | Construction | Normal |
|---|---|---|
| FHHD | vertical gap between 1 and 2 (image axis) | < 10 mm |
| ALFHRF | angle of line 1–2 vs image horizontal | < 1° |
| ICHD | gap between FBL-parallel lines through 3 and 5 | < 5 mm |
| DOCS | distance of 8 from the line through 7 at right angles to FBL | < 3 mm |
| IM R/L | crest to ischial tuberosity along `n` (3–4, 5–6) | \|R−L\| < 5 mm |
| SAM R/L | 7 to lateral sacrum along `u` (7–11, 7–12) | \|R−L\| < 5 mm |
| ISM R/L | lateral ilium to medial sacrum along `u` (14–13, 16–15) | \|R−L\| < 5 mm |

Units: px always; mm when the film is calibrated (calibration line → `pixelsPerMm`);
mm ranges are only judged when calibrated. Parameters are measured in the frame the
viewer shows (rotation/flips applied), so "lower" means lower on screen. The viewer draws
the construction lines (Fig. 5 style) and they follow the landmarks live while dragging.
Re-running detection moves the existing landmarks (same shapes), so rulers snapped to
them follow.

## Measured accuracy (development check — one film, treat as indicative)

Test film: the paper's own Fig. 2 with its 16 ground-truth dots erased (OpenCV inpainting +
film grain; the model was asked and could not find the erased marks). ≈0.23 mm/px, assumed
from femoral-head spacing. The **shipped pipeline** (`analysePelvis`, 3 runs, real Opus 5.5
answers) vs the paper's trained CNN (200 films):

| Parameter | Shipped pipeline (MAE) | Paper (MAE) |
|---|---|---|
| FHHD | 0.7 mm | 0.47 mm |
| ALFHRF | 0.2° | 0.14° |
| ICHD | 0.8 mm | 0.72 mm |
| DOCS | 0.3 mm | 1.03 mm |
| IM R / L | 1.2 / 3.0 mm | 0.87 / 0.79 mm |
| ISM R / L | 2.6 / 2.5 mm | 1.87 / 1.67 mm |
| **SAM R / L** | **18 / 10 mm** | 1.81 / 2.01 mm |

Landmarks: mean radial error ≈10 mm overall, but the edge landmarks the parameters lean on
(femoral heads, crests, ischia, symphysis, lateral ilia) are within ~2–8 mm; the sacral
group (7, 9–13, 15) is placed ~15 mm too low, which is why SAM is unreliable. The paper's
CNN is also weakest on the sacrum (SAM ICC 0.83–0.89). The UI therefore draws low-confidence
landmarks with dashed rings and flags SAM ("check landmarks 7, 11 and 12").

Tried and not shipped: anatomical re-wording of the sacral landmarks (no gain); a zoomed
sacral-region pass (mean error 45→38 px, but one of three runs got worse); per-landmark
tight crops (lose context, large jumps). An earlier, more optimistic estimate (~3.4 mm) was
inflated by faint traces of the erased dots and is withdrawn.

Validity check: correct on all 7 test cases (an AP pelvis, two AP full-spine films, a
lateral full-spine film, a chest-only crop, an app screenshot, an annotated figure). In the
app, a full-spine film's "R" marker on the image right correctly switched patient sides.

## Cost / latency

Up to 11 model calls per analysis (1 check + 3 detect + up to 7 refine), ~25–45 s,
roughly US$0.20–0.35 per film at Opus 5.5 list price.

## Not in scope

DICOM pixel spacing; automatic mm without a calibration line; exporting the
construction lines into PNG/PDF; bias correction from user drags (old code is
unused — it learned from already-corrected points and mixed clinics).

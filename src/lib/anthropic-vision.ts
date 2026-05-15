import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

/**
 * Pure helper that asks Claude vision to identify pelvic anatomical landmarks
 * on an X-ray image. The function signature is the privacy boundary: the only
 * inputs are image bytes + image dimensions. There is no way to leak xrayId,
 * patientId, branch, doctor, filename, or any other DB-resolvable identifier
 * through this function — by construction, it never has access to them.
 *
 * The route handler at `/api/viewer/detect-landmarks` enforces auth + the R2
 * fetch; this file only sees pixels.
 */

export interface Landmark {
  name: string;        // canonical, unique within a response (e.g. "top_of_femoral_head_1")
  displayName: string; // human-readable, may repeat across siblings (e.g. "Femoral head")
  x: number;           // image-pixel x coordinate (top-left origin)
  y: number;           // image-pixel y coordinate
}

/**
 * Body-region-agnostic landmark prompt. The shape and constraints are
 * encoded in the user prompt; the system prompt only sets identity. The
 * worked example below is informed by the canonical 16-landmark pelvic AP
 * set (Heliyon Moon et al. 2024) so Claude has a concrete shape to mimic;
 * non-pelvic radiographs reuse the same JSON contract with region-
 * appropriate landmark names.
 */
function buildPrompt(imageWidth: number, imageHeight: number): string {
  return [
    "Task: identify pelvic skeletal landmarks on this radiograph and return",
    "them as JSON. Accuracy matters far more than count.",
    "",
    "Coordinate system:",
    `  - Image is ${imageWidth} px wide and ${imageHeight} px tall.`,
    "  - Origin (0, 0) is the TOP-LEFT pixel.",
    "  - x increases to the right; y increases DOWNWARD.",
    `  - All x in [0, ${imageWidth}]. All y in [0, ${imageHeight}].`,
    "",
    "FUNDAMENTAL RULE — trace the bone edge, do NOT pick the bone center:",
    "Every landmark below names a SPECIFIC POINT on a SPECIFIC BONE EDGE",
    "(e.g. 'most superior point of the femoral head sphere'). Your job is to",
    "trace the curved bone outline with your eye and pick the single pixel",
    "that satisfies the geometric description (most-superior, most-lateral,",
    "most-inferior, etc.). It is NOT the visual center of the bone region.",
    "If you pick the center of a bone instead of the named edge point, every",
    "downstream measurement is wrong. Re-read each description before placing.",
    "",
    "Scope: focus only on the pelvic region. Even if the image shows a full",
    "spine or whole body, ONLY return pelvic landmarks. Do NOT place points on",
    "cervical/thoracic/lumbar vertebrae above L5, the skull, or any non-pelvic",
    "structure.",
    "",
    "═══════════════════════════════════════════════════════════════════",
    "FRAMING STEP — do this BEFORE placing any landmark:",
    "═══════════════════════════════════════════════════════════════════",
    "",
    "Before picking any individual landmark, anchor yourself in the image by",
    "identifying the four pelvic bounds. Hold these four y/x values in mind",
    "for the rest of your analysis — every landmark must be placed inside",
    "this rectangle, and most have proportional position checks below.",
    "",
    "  1. y_top    = y-coordinate of the HIGHEST PIXEL of any iliac crest",
    "                (the topmost edge of the bony pelvic outline)",
    "  2. y_bot    = y-coordinate of the LOWEST PIXEL of any ischial",
    "                tuberosity (the bottom-most bony edge of the pelvic",
    "                ring; below this is just the femurs and soft tissue)",
    "  3. x_left   = x-coordinate of the LEFTMOST pixel of either iliac",
    "                wing's outer flare",
    "  4. x_right  = x-coordinate of the RIGHTMOST pixel of either iliac",
    "                wing's outer flare",
    "",
    "Define:  H = y_bot - y_top    (vertical extent of the pelvis)",
    "         x_mid = midline x-coordinate (the symphysis pubis and S2",
    "                 tubercle sit on this vertical line; usually close",
    "                 to (x_left + x_right) / 2 but use anatomy not math)",
    "",
    "Sanity-check the frame: pelvic H is typically larger than (x_right -",
    "x_left) / 1.2 on AP pelvic films and smaller than 2× that width. If",
    "your frame violates that, you have likely mistaken some other bone",
    "(spine, sacrum-only, femur) for the pelvis — re-examine.",
    "",
    "VERTICAL POSITION CHECK for each landmark (use these as guardrails,",
    "not gospel — they're rough proportional anchors to catch gross errors):",
    "",
    "  Iliac crest top      → y ≈ y_top                  (the topmost point)",
    "  Sacral grooves       → y ≈ y_top + 0.20·H         (~20% down)",
    "  L5 vertebra body     → y ≈ y_top + 0.05·H or above (sits above pelvis)",
    "  Lateral iliac        → y ≈ y_top + 0.35·H         (~35% down — at the",
    "                          maximum flare; near SI joint level)",
    "  S2 tubercle          → y ≈ y_top + 0.45·H         (just below SI joints)",
    "  Femoral head top     → y ≈ y_top + 0.55·H         (~55% down — at",
    "                          the acetabular roof level)",
    "  Symphysis pubis      → y ≈ y_top + 0.80·H         (~80% down, on the",
    "                          midline at x_mid)",
    "  Ischial tuberosity   → y ≈ y_bot                  (the lowest point)",
    "",
    "If your placement is more than ~10% of H off from these checks, look",
    "again — you have probably misidentified the structure.",
    "",
    "",
    "Allowed landmarks (use exactly these snake_case names — drop any you",
    "cannot locate confidently):",
    "",
    "──────────────────────────────────────────────────────────────────",
    "HIGH-CONFIDENCE ANCHORS (always include on a clear pelvic AP — these",
    "are the four bilateral pairs that anchor every downstream measurement):",
    "──────────────────────────────────────────────────────────────────",
    "",
    "• top_of_femoral_head — Two points (left + right).",
    "  WHAT IT IS: the most superior pixel of the femoral head's curved",
    "  bony outline. The femoral head is the smooth round 'ball' at the",
    "  top of the femur (thigh bone) that fits into the acetabulum (the",
    "  cup-shaped hip socket of the pelvis).",
    "  HOW TO FIND IT — work bottom-up from the femur shaft, NOT top-down",
    "  from the iliac wing:",
    "  Step 1: find the femur shaft. It's a thick vertical white bone",
    "  running down from the hip joint into the thigh. There is one on",
    "  each side of the image.",
    "  Step 2: trace each femur shaft UPWARD. It widens into the femoral",
    "  neck (a short angled segment), then curves into a near-perfect",
    "  CIRCLE — that circle is the femoral head. The circle sits INSIDE",
    "  the C-shaped acetabulum on the pelvis.",
    "  Step 3: pick the pixel at the TOP of that circle's outline — the",
    "  12-o'clock point on the femoral-head sphere, right where it meets",
    "  the inferior edge of the acetabular roof.",
    "  POSITION CHECK: the femoral heads are USUALLY LOWER on the image",
    "  than people expect. They sit roughly 55%–65% of the way down the",
    "  pelvic vertical extent (y ≈ y_top + 0.55·H to 0.65·H). They are",
    "  ALWAYS below the lateral iliac flare and ALWAYS above the ischial",
    "  tuberosities. If your placement isn't between those two y-levels,",
    "  it is wrong.",
    "  COMMON ERRORS to avoid (CRITICAL — these have happened):",
    "    - Placing it WAY too high, somewhere on the iliac wing or the SI",
    "      joint. The iliac wing is at y_top + ~0.25·H; the femoral head",
    "      is more than TWICE as far down. If your placement is in the",
    "      upper half of the pelvis, you have the wrong structure.",
    "    - Placing on the femoral neck (the angled column BELOW the ball",
    "      — you want the ball itself)",
    "    - Placing inside the acetabulum (the socket; you want the BALL",
    "      that sits inside the socket)",
    "    - Placing at the geometric center of the femoral head circle",
    "      (you want the TOP EDGE of the circle, not its center)",
    "    - Confusing with the greater trochanter (the bony lump on the",
    "      LATERAL outer side of the femur, level with the femoral neck",
    "      — that's a different structure)",
    "",
    "• top_of_iliac_crest — Two points (left + right).",
    "  WHAT IT IS: the single highest pixel of the iliac crest — the",
    "  curved bony ridge that forms the TOP edge of each side of the",
    "  pelvis. On most AP pelvic X-rays this is the HIGHEST POINT of any",
    "  pelvic bone visible in the image.",
    "  HOW TO FIND IT: identify the wing-shaped ilium (the broad flat",
    "  bone on each side that fans out above the hip socket). Its upper",
    "  border is a smooth arching white curve — that IS the iliac crest.",
    "  Trace that curve and pick the single topmost pixel.",
    "  COMMON ERRORS to avoid:",
    "    - Placing on the sacrum, the SI joint, or anywhere on the",
    "      midline (the iliac crest is on the OUTER curve of each wing)",
    "    - Placing too low on the wing (you want the TOP of the curve,",
    "      not the middle of the wing)",
    "    - Confusing with the anterior superior iliac spine (ASIS) —",
    "      ASIS is at the front, lower; iliac crest is higher and curves",
    "      backward over the wing",
    "",
    "• lateral_iliac — Two points (left + right).",
    "  WHAT IT IS: the most lateral (furthest from the body's midline)",
    "  pixel of each iliac wing — the point where the bony outer edge",
    "  of the ilium bulges out widest.",
    "  HOW TO FIND IT: locate the OUTER edge of each iliac wing (the",
    "  edge facing away from the spine). Trace that curved bony edge",
    "  from the iliac crest at the top, down and outward. The wing",
    "  widens, reaches a maximum 'flare,' then narrows back inward",
    "  toward the acetabulum (hip socket). Pick the SINGLE pixel where",
    "  the outward bulge is maximum — that is, the pixel with the",
    "  greatest x-distance from the body midline.",
    "  POSITION CHECK: vertically, this pixel sits roughly midway",
    "  between the top of the iliac crest and the top of the acetabular",
    "  roof — typically near the level of the sacroiliac (SI) joint.",
    "  COMMON ERRORS to avoid:",
    "    - Placing it near the top of the wing (that's the iliac crest)",
    "    - Placing it down on the acetabular rim (way too low)",
    "    - Picking a point inside the bone shadow rather than on its",
    "      outer edge — the landmark is on the OUTLINE, not in the body",
    "      of the wing",
    "    - Drifting medially onto the SI joint or sacrum",
    "",
    "• ischial_tuberosity — Two points (left + right).",
    "  WHAT IT IS: the most inferior (lowest) pixel of each ischial",
    "  tuberosity — the rounded bony 'sit bones' at the very bottom of",
    "  the pelvis. They are the part of the pelvic skeleton a person",
    "  sits on.",
    "  HOW TO FIND IT: scan to the BOTTOM of the pelvic ring. Above",
    "  each ischial tuberosity sits a large oval dark hole (the",
    "  obturator foramen). The ischial tuberosity is the rounded white",
    "  bony shadow JUST BELOW each obturator foramen. Trace its curved",
    "  lower outline and pick the single LOWEST pixel.",
    "  POSITION CHECK: both ischial tuberosities are roughly symmetric",
    "  about the midline, just LATERAL to and slightly BELOW the level",
    "  of the symphysis pubis.",
    "  COMMON ERRORS to avoid:",
    "    - Placing on the inferior pubic ramus (the thin curved bony",
    "      bridge running from the symphysis to the ischial tuberosity",
    "      — that is a different structure)",
    "    - Placing inside the obturator foramen (the dark hole)",
    "    - Picking the center of the tuberosity instead of its inferior",
    "      edge",
    "    - Placing on the greater trochanter of the femur (which sits",
    "      LATERAL to the ischial tuberosity, beyond the pelvic ring)",
    "",
    "──────────────────────────────────────────────────────────────────",
    "MIDLINE / SECONDARY landmarks (include only if clearly identifiable):",
    "──────────────────────────────────────────────────────────────────",
    "",
    "• symphysis_pubis — One point.",
    "  WHAT IT IS: the geometric center of the symphysis pubis joint",
    "  space — the cartilaginous joint at the midline of the lower",
    "  pelvis that connects the left and right pubic bones.",
    "  HOW TO FIND IT: at the BOTTOM-CENTER of the pelvic ring, between",
    "  the two pubic bones, find a thin VERTICAL dark/lucent stripe",
    "  (the joint space). The stripe is typically 1–4 mm wide and",
    "  ~15–25 mm tall. Place the landmark at the GEOMETRIC CENTER of",
    "  this stripe — halfway between its top and bottom edges, halfway",
    "  between its left and right edges. The two pubic bones on either",
    "  side should be roughly symmetric across this midline point.",
    "  POSITION CHECK: the symphysis sits roughly halfway between the",
    "  acetabular roofs and on the midline (equidistant from the two",
    "  obturator foramina).",
    "  COMMON ERRORS to avoid:",
    "    - Placing on the superior or inferior tip of the joint instead",
    "      of in the middle",
    "    - Placing on the white pubic bone instead of in the dark",
    "      lucent joint space",
    "    - Confusing with overlying soft tissue shadows (urethra,",
    "      bladder gas, bowel gas)",
    "    - Drifting up onto the bladder shadow above",
    "",
    "• second_sacral_tubercle — One point.",
    "  WHAT IT IS: the S2 median sacral tubercle — a small midline",
    "  bony bump on the dorsal (back) surface of the sacrum at the",
    "  level of the SECOND sacral vertebra.",
    "  HOW TO FIND IT:",
    "  Step 1: locate the sacrum — the triangular wedge-shaped bone in",
    "  the midline between the two iliac wings, below the L5 vertebra,",
    "  above the coccyx.",
    "  Step 2: find the median sacral crest — a faint vertical chain",
    "  of small bumps running down the midline of the sacrum (the",
    "  fused sacral spinous processes). The bumps from top to bottom",
    "  are S1, S2, S3, S4.",
    "  Step 3: pick the SECOND bump from the top (S2). S1 sits at the",
    "  level just below the sacral promontory (the anterior edge of",
    "  the S1 body); S2 is one segment lower.",
    "  POSITION CHECK: S2 is on the exact vertical midline of the",
    "  pelvis, slightly below the level of the sacroiliac joints.",
    "  COMMON ERRORS to avoid:",
    "    - Picking S1 instead of S2 (one level too high)",
    "    - Picking the sacral promontory (which is the anterior edge",
    "      of the upper sacral body — much higher than S2)",
    "    - Drifting off the midline onto a sacral ala or the SI joint",
    "    - Confusing with bowel-gas shadows overlying the sacrum",
    "",
    "• sacral_groove — Two points (left + right).",
    "  WHAT IT IS: the dorsal sacral grooves — small paired concavities",
    "  on the dorsal surface of the upper sacrum, just LATERAL to the",
    "  median sacral crest at the S1 level, where the erector spinae",
    "  muscle origins recess into the bone.",
    "  HOW TO FIND IT: at the top of the sacrum, identify the median",
    "  sacral crest (the chain of S1/S2 bumps described above). On",
    "  either side of S1, look for a faint darker concavity in the bone",
    "  surface — these are the sacral grooves. Place each landmark in",
    "  the center of each groove.",
    "  POSITION CHECK: the two grooves are roughly symmetric, sitting",
    "  about 10–20 mm lateral to the median sacral crest, at the S1",
    "  level (i.e., just above the S2 tubercle).",
    "  Often subtle on AP X-rays — SKIP if you cannot see them clearly.",
    "",
    "• l5_vertebra — One point.",
    "  WHAT IT IS: the geometric center of the L5 vertebral body — the",
    "  lowest lumbar vertebra, immediately above the sacrum.",
    "  HOW TO FIND IT:",
    "  Step 1: identify the sacrum (triangular bone at the bottom of",
    "  the spine, between the two iliac wings).",
    "  Step 2: directly above the sacrum is the L5 vertebra, a roughly",
    "  rectangular bony shadow with a clear superior and inferior",
    "  endplate.",
    "  Step 3: place the landmark at the GEOMETRIC CENTER of the L5",
    "  body — halfway between its top and bottom endplates, halfway",
    "  between its left and right lateral edges.",
    "  POSITION CHECK: the L5 body sits on the midline, just above the",
    "  L5-S1 disc space (which sits just above the sacral promontory).",
    "  COMMON ERRORS to avoid:",
    "    - Picking L4 by mistake (count vertebrae from the sacrum",
    "      upward — the first lumbar body above the sacrum is L5)",
    "    - Placing on the spinous process or transverse processes",
    "      instead of the vertebral body itself",
    "    - Drifting up to the L5-S1 disc space (which is BETWEEN L5",
    "      and S1, not on L5)",
    "  Only include this landmark if the entire L5 body is clearly",
    "  visible in the frame.",
    "",
    "Do NOT include: lateral_sacrum, medial_sacrum, or any deep sacrum",
    "landmark beyond S2 + sacral grooves — these have been too unreliable.",
    "",
    "How many points: aim for 8–10 confident landmarks. Better to return",
    "6 reliable landmarks than 14 sloppy ones. The four high-confidence",
    "bilateral pairs (8 points total) are the priority — get those right",
    "before adding any midline secondary landmarks.",
    "",
    "Naming: use snake_case for `name` and a short Title-case label for",
    "`displayName` (≤ 24 chars).",
    "",
    "Bilateral landmarks (left + right): emit BOTH points and disambiguate",
    "the `name` by appending `_1` to the LEFTMOST (lower x) and `_2` to the",
    "rightmost. `displayName` repeats — that's fine; the `_1`/`_2` suffix on",
    "`name` keeps each entry uniquely addressable.",
    "",
    "Do NOT include left/right designations (left, right, l, r) in `name` or",
    "`displayName`. Vision models often flip radiographic L/R; we strip those",
    "words downstream and infer laterality from x-position.",
    "",
    "Escape hatch: if this image is not a diagnostic pelvic radiograph (it's",
    "a photo, illustration, non-pelvic body part with no pelvis visible,",
    "blank, or heavily corrupted), return [].",
    "",
    "Each (x, y) is a SINGLE PRECISE PIXEL marking the exact anatomical",
    "point. Not a region, not a region center, not the center of a label",
    "rectangle. For example, top_of_femoral_head is a single pixel at the",
    "highest curved point of the femoral head sphere — not somewhere within",
    "the femoral head silhouette.",
    "",
    "Output schema (one entry per landmark):",
    "  { \"name\": \"<snake_case>\", \"displayName\": \"<Title case>\",",
    "    \"x\": <pixels>, \"y\": <pixels> }",
    "",
    "Worked example for a clear pelvic AP (1024 × 768 image; coordinates",
    "illustrative). High-confidence anchors first (the four bilateral pairs),",
    "then secondary midline landmarks:",
    "[",
    "  { \"name\": \"top_of_femoral_head_1\",   \"displayName\": \"Femoral head\",   \"x\": 380, \"y\": 480 },",
    "  { \"name\": \"top_of_femoral_head_2\",   \"displayName\": \"Femoral head\",   \"x\": 640, \"y\": 480 },",
    "  { \"name\": \"top_of_iliac_crest_1\",    \"displayName\": \"Iliac crest\",    \"x\": 270, \"y\": 220 },",
    "  { \"name\": \"top_of_iliac_crest_2\",    \"displayName\": \"Iliac crest\",    \"x\": 760, \"y\": 220 },",
    "  { \"name\": \"lateral_iliac_1\",         \"displayName\": \"Lat. iliac\",     \"x\": 200, \"y\": 360 },",
    "  { \"name\": \"lateral_iliac_2\",         \"displayName\": \"Lat. iliac\",     \"x\": 820, \"y\": 360 },",
    "  { \"name\": \"ischial_tuberosity_1\",    \"displayName\": \"Ischial tub.\",   \"x\": 410, \"y\": 660 },",
    "  { \"name\": \"ischial_tuberosity_2\",    \"displayName\": \"Ischial tub.\",   \"x\": 610, \"y\": 660 },",
    "  { \"name\": \"second_sacral_tubercle\",  \"displayName\": \"S2 tubercle\",    \"x\": 510, \"y\": 380 },",
    "  { \"name\": \"symphysis_pubis\",         \"displayName\": \"Symphysis pubis\",\"x\": 510, \"y\": 600 },",
    "  { \"name\": \"sacral_groove_1\",         \"displayName\": \"Sacral groove\",  \"x\": 480, \"y\": 340 },",
    "  { \"name\": \"sacral_groove_2\",         \"displayName\": \"Sacral groove\",  \"x\": 540, \"y\": 340 },",
    "  { \"name\": \"l5_vertebra\",             \"displayName\": \"L5 vertebra\",    \"x\": 510, \"y\": 280 }",
    "]",
    "",
    "Return ONLY the JSON array. No prose, no markdown fences.",
  ].join("\n");
}

const SYSTEM_PROMPT =
  "You are a medical imaging assistant for chiropractic analysis specializing in PELVIC radiographs. Identify pelvic skeletal landmarks and return them as structured JSON exactly matching the schema in the user message. Be conservative — accuracy on a smaller, well-defined set is preferred over breadth. Skip any landmark you cannot locate with confidence.";

export type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface DetectLandmarksOptions {
  imageBytes: Buffer;
  mediaType: SupportedMediaType;
  imageWidth: number;
  imageHeight: number;
  /**
   * Optional injection point for tests — pass a mock `Anthropic` instance so
   * the privacy regression test can capture the request payload without
   * making a real API call. Production callers omit this.
   */
  client?: Anthropic;
  /**
   * If true (default), normalize the image's histogram before sending to
   * Claude — stretches the darkest pixel to 0 and the brightest to 255,
   * which on under-exposed or low-contrast X-rays can sharpen bone edges
   * enough to improve landmark detection. Tests override to `false` so the
   * mocked Anthropic call sees the original mock bytes verbatim.
   */
  preprocess?: boolean;
}

export class VisionApiError extends Error {
  constructor(
    public readonly code: "image_too_large" | "vision_api_error" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "VisionApiError";
  }
}

/**
 * Strip JSON fences and surrounding prose if Claude returned any (it shouldn't,
 * given the prompt — but the model occasionally adds a code fence anyway).
 */
function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

/**
 * Strip left/right designations from a landmark name. Vision LLMs often flip
 * laterality on radiographs (the patient's right is on the viewer's left),
 * and chiropractors can read the L/R themselves from position — so we drop
 * the prefix entirely instead of risking a mislabeled side.
 *
 * Examples:
 *   "top_of_left_femoral_head"     → "top_of_femoral_head"
 *   "L Femoral Head"               → "Femoral head"
 *   "Right Iliac Crest"            → "Iliac crest"
 *   "lateral_aspect_of_R_ilium"    → "lateral_aspect_of_ilium"
 */
export function stripLaterality(s: string): string {
  return s
    // snake_case forms: _left_ / _right_ / _l_ / _r_ anywhere
    .replace(/(^|_)(left|right|l|r)(_|$)/gi, (_m, before, _kw, after) =>
      before && after ? "_" : "",
    )
    // Title-Case prefix: "Left ", "Right ", "L ", "R "
    .replace(/^(Left|Right|L|R)\s+/i, "")
    // Embedded "L " or "R " markers (rare but seen)
    .replace(/\s+(Left|Right)\s+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
}

/**
 * Capitalize first letter, leave the rest as-is. Applied to displayName
 * after stripping so "femoral head" → "Femoral head".
 */
function titleish(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Strip a trailing `_1` / `_2` / ... suffix Claude may have added to keep
 * bilateral landmark names unique. Used so we can re-disambiguate ourselves
 * after laterality stripping (Claude's suffix may not survive intact when
 * we also strip a left/right token in the middle of the name).
 */
function dropDuplicateSuffix(name: string): string {
  return name.replace(/_\d+$/, "");
}

/**
 * After laterality stripping, multiple Claude entries can collapse to the
 * same root name (e.g. both "left_femoral_head" and "right_femoral_head"
 * become "femoral_head"). Re-disambiguate by sorting collisions by
 * x-coordinate and appending `_1`, `_2`, … so each `name` stays unique
 * within the response.
 */
function disambiguateNames(landmarks: Landmark[]): Landmark[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < landmarks.length; i++) {
    const root = dropDuplicateSuffix(landmarks[i].name);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  const out = landmarks.map((l) => ({ ...l }));
  for (const [root, indices] of groups) {
    if (indices.length === 1) {
      // Single match — emit the unsuffixed root name.
      out[indices[0]].name = root;
      continue;
    }
    // Multiple matches — sort by x, then suffix _1, _2, … left-to-right.
    // Apply the same numeric suffix to displayName so the canvas label
    // disambiguates each landmark of a bilateral pair ("Iliac crest 1" /
    // "Iliac crest 2"). Numbering is consistent across all bilateral
    // landmarks because they are all ordered by x — landmark #1 is always
    // on the lower-x side of the image, landmark #2 on the higher-x side.
    indices.sort((a, b) => out[a].x - out[b].x);
    indices.forEach((idx, i) => {
      out[idx].name = `${root}_${i + 1}`;
      // Strip any pre-existing trailing " 1" / " 2" the model may have
      // added against instructions before appending our canonical suffix.
      const baseDisplay = out[idx].displayName.replace(/\s+\d+$/, "").trim();
      out[idx].displayName = `${baseDisplay} ${i + 1}`;
    });
  }
  return out;
}

function parseLandmarks(
  raw: string,
  imageWidth: number,
  imageHeight: number,
): Landmark[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    throw new VisionApiError("vision_api_error", "Claude returned non-JSON content.");
  }
  if (!Array.isArray(parsed)) {
    throw new VisionApiError("vision_api_error", "Expected a JSON array.");
  }

  const out: Landmark[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string" || typeof e.x !== "number" || typeof e.y !== "number") {
      continue;
    }
    const rawName = e.name;
    const rawDisplay = typeof e.displayName === "string" ? e.displayName : e.name;
    // Drop Claude's _1/_2 suffix before stripping laterality, otherwise
    // "left_femoral_head_1" would become "femoral_head_1" and never collide
    // with its right-side partner ("femoral_head_2") for re-disambiguation.
    const stripped = stripLaterality(dropDuplicateSuffix(rawName)) || rawName;
    const displayStripped = stripLaterality(rawDisplay) || rawDisplay;
    out.push({
      name: stripped,
      displayName: titleish(displayStripped),
      x: Math.max(0, Math.min(imageWidth, e.x)),
      y: Math.max(0, Math.min(imageHeight, e.y)),
    });
  }
  return disambiguateNames(out);
}

const MAX_BYTES = 8 * 1024 * 1024; // Anthropic's hard cap is ~10MB; leave headroom

/**
 * Histogram-normalize the image so the darkest pixel is 0 and the brightest
 * is 255. On under-exposed or low-contrast X-rays this sharpens bone edges
 * enough to noticeably improve landmark detection. Falls back to the
 * original bytes if sharp can't decode them (e.g. unusual encoding) — we
 * never want preprocessing to fail the request.
 */
async function preprocessForVision(
  bytes: Buffer,
  mediaType: SupportedMediaType,
): Promise<{ bytes: Buffer; mediaType: SupportedMediaType }> {
  try {
    // Sharp normalizes the histogram (`.normalize()`) — equivalent to
    // ImageMagick's `-normalize` / `auto-level`. JPEG out keeps the file
    // size manageable for the base64 payload; PNG is preserved for PNG-
    // input lossless cases. GIF / WebP fall through to JPEG output.
    const pipeline = sharp(bytes, { failOn: "none" }).normalize();
    if (mediaType === "image/png") {
      const out = await pipeline.png().toBuffer();
      return { bytes: out, mediaType: "image/png" };
    }
    const out = await pipeline.jpeg({ quality: 92 }).toBuffer();
    return { bytes: out, mediaType: "image/jpeg" };
  } catch {
    return { bytes, mediaType };
  }
}

export async function detectLandmarks(
  opts: DetectLandmarksOptions,
): Promise<Landmark[]> {
  if (opts.imageBytes.byteLength > MAX_BYTES) {
    throw new VisionApiError(
      "image_too_large",
      `Image is ${(opts.imageBytes.byteLength / 1_000_000).toFixed(1)}MB; max is ${MAX_BYTES / 1_000_000}MB.`,
    );
  }

  // Default-on histogram normalization — improves Claude's bone-edge
  // detection on washed-out X-rays. Tests opt out via `preprocess: false`.
  const { bytes, mediaType } = (opts.preprocess ?? true)
    ? await preprocessForVision(opts.imageBytes, opts.mediaType)
    : { bytes: opts.imageBytes, mediaType: opts.mediaType };

  const client = opts.client ?? new Anthropic();
  const base64 = bytes.toString("base64");

  let response;
  try {
    response = await client.messages.create({
      // Opus has materially better fine-grained spatial reasoning than Sonnet
      // for medical-imaging landmark placement, at the cost of ~3-8s latency
      // per call — acceptable for a manual-trigger action. Per AI Landmark
      // spec §Locked Decisions #4.
      model: "claude-opus-4-7",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: buildPrompt(opts.imageWidth, opts.imageHeight) },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new VisionApiError("rate_limited", "Anthropic API rate limit exceeded.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new VisionApiError("vision_api_error", `Anthropic API error: ${err.message}`);
    }
    throw err;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new VisionApiError("vision_api_error", "Claude response had no text block.");
  }
  return parseLandmarks(textBlock.text, opts.imageWidth, opts.imageHeight);
}

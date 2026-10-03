/**
 * The 16 pelvic landmarks of Moon et al., "Automated assessment of pelvic
 * radiographs using deep learning", Heliyon 2024 (PMC11040132), Fig. 2.
 *
 * Numbering follows the paper. The paper's "left"/"right" are IMAGE sides
 * (its Fig. 5 films carry the "R" marker on the image left), so keys and
 * definitions here name image sides; patient sides are derived per film from
 * where the patient's right lies on the image (see `patientSideOf`).
 *
 * Shared by the server (prompt text) and the client (labels, analysis).
 */

export type ImageSide = "left" | "right" | "mid";
export type PatientSide = "R" | "L";

export type PelvicLandmarkKey =
  | "femoral_head_top_img_left"
  | "femoral_head_top_img_right"
  | "iliac_crest_top_img_left"
  | "ischial_tuberosity_bottom_img_left"
  | "iliac_crest_top_img_right"
  | "ischial_tuberosity_bottom_img_right"
  | "s2_tubercle"
  | "symphysis_pubis"
  | "sacral_groove_img_left"
  | "sacral_groove_img_right"
  | "sacrum_lateral_img_left"
  | "sacrum_lateral_img_right"
  | "sacrum_medial_img_left"
  | "ilium_lateral_img_left"
  | "sacrum_medial_img_right"
  | "ilium_lateral_img_right";

export interface PelvicLandmarkDef {
  /** Paper number, 1-16. */
  id: number;
  key: PelvicLandmarkKey;
  /** Short anatomical name without side, for labels. */
  short: string;
  imageSide: ImageSide;
  /**
   * `edge` landmarks are well-defined bone-edge extremes (they gain from a
   * zoomed refinement pass); `sacral` ones need the whole sacrum in view.
   */
  group: "edge" | "sacral";
  /** What the model is asked to find, in image-side terms. */
  definition: string;
}

export const PELVIC_LANDMARKS: readonly PelvicLandmarkDef[] = [
  { id: 1, key: "femoral_head_top_img_left", short: "Femoral head", imageSide: "left", group: "edge",
    definition: "Top of the image-left femoral head: the most superior point on the outline of the femoral head (the ball), where it meets the acetabular roof." },
  { id: 2, key: "femoral_head_top_img_right", short: "Femoral head", imageSide: "right", group: "edge",
    definition: "Top of the image-right femoral head: same definition on the image-right hip." },
  { id: 3, key: "iliac_crest_top_img_left", short: "Iliac crest", imageSide: "left", group: "edge",
    definition: "Top of the image-left iliac crest: the highest point of the iliac crest's outline." },
  { id: 4, key: "ischial_tuberosity_bottom_img_left", short: "Ischial tuberosity", imageSide: "left", group: "edge",
    definition: "Bottom of the image-left ischial tuberosity: the lowest point of the ischium's outline." },
  { id: 5, key: "iliac_crest_top_img_right", short: "Iliac crest", imageSide: "right", group: "edge",
    definition: "Top of the image-right iliac crest: the highest point of the iliac crest's outline." },
  { id: 6, key: "ischial_tuberosity_bottom_img_right", short: "Ischial tuberosity", imageSide: "right", group: "edge",
    definition: "Bottom of the image-right ischial tuberosity: the lowest point of the ischium's outline." },
  { id: 7, key: "s2_tubercle", short: "S2 tubercle", imageSide: "mid", group: "sacral",
    definition: "Second sacral tubercle (S2): on the sacral midline at the level of the S2 segment, the point a pelvic plumb line passes through; it lies below the sacral base, about level with the middle of the sacroiliac joints." },
  { id: 8, key: "symphysis_pubis", short: "Symphysis pubis", imageSide: "mid", group: "edge",
    definition: "Centre of the pubic symphysis: the midpoint of the symphysis joint between the two pubic bones." },
  { id: 9, key: "sacral_groove_img_left", short: "Sacral groove", imageSide: "left", group: "sacral",
    definition: "Image-left sacral groove (sulcus): the notch at the top of the sacrum on the image-left side, where the superior border of the sacral ala meets the L5-S1 region; it sits above the S2 level, between the midline and the sacroiliac joint." },
  { id: 10, key: "sacral_groove_img_right", short: "Sacral groove", imageSide: "right", group: "sacral",
    definition: "Image-right sacral groove (sulcus): same definition on the image-right side." },
  { id: 11, key: "sacrum_lateral_img_left", short: "Lateral sacrum", imageSide: "left", group: "sacral",
    definition: "Lateral aspect of the image-left sacrum: on the horizontal line through landmark 7, the outermost edge of the sacrum on the image-left side (the sacral border at the sacroiliac joint)." },
  { id: 12, key: "sacrum_lateral_img_right", short: "Lateral sacrum", imageSide: "right", group: "sacral",
    definition: "Lateral aspect of the image-right sacrum: same definition on the image-right side." },
  { id: 13, key: "sacrum_medial_img_left", short: "Medial sacrum", imageSide: "left", group: "sacral",
    definition: "Medial aspect of the image-left posterior ilium (posterior superior iliac spine): the most medial point of its shadow where it overlaps the sacrum, near the S2 level; it lies between landmarks 11 and 7." },
  { id: 14, key: "ilium_lateral_img_left", short: "Lateral ilium", imageSide: "left", group: "edge",
    definition: "Lateral aspect of the image-left ilium: the most lateral point of the iliac wing's outer flare." },
  { id: 15, key: "sacrum_medial_img_right", short: "Medial sacrum", imageSide: "right", group: "sacral",
    definition: "Medial aspect of the image-right posterior ilium (posterior superior iliac spine): same definition; it lies between landmarks 7 and 12." },
  { id: 16, key: "ilium_lateral_img_right", short: "Lateral ilium", imageSide: "right", group: "edge",
    definition: "Lateral aspect of the image-right ilium: the most lateral point of the iliac wing's outer flare." },
];

/**
 * Spatial rules every correct placement satisfies; given to the model and
 * checked again in code.
 */
export const PELVIC_LANDMARK_ORDER_RULE =
  "Along the S2 level the left-to-right order is always 14, 11, 13, 7, 15, 12, 16. Landmarks 9 and 10 sit above 7; 8 is directly below 7; 1 and 2 are below the sacrum and above 4 and 6.";

const BY_ID = new Map(PELVIC_LANDMARKS.map((l) => [l.id, l]));
const BY_KEY = new Map(PELVIC_LANDMARKS.map((l) => [l.key, l]));

export function landmarkById(id: number): PelvicLandmarkDef | undefined {
  return BY_ID.get(id);
}

export function landmarkByKey(key: string): PelvicLandmarkDef | undefined {
  return BY_KEY.get(key as PelvicLandmarkKey);
}

/**
 * Patient side of an image side, given which image side holds the patient's
 * right (the standard AP convention puts it on the image left).
 */
export function patientSideOf(
  imageSide: ImageSide,
  patientRightOn: "left" | "right",
): PatientSide | null {
  if (imageSide === "mid") return null;
  return imageSide === patientRightOn ? "R" : "L";
}

/** Canvas label, e.g. "1 R Femoral head" or "7 S2 tubercle". */
export function landmarkLabel(def: PelvicLandmarkDef, side: PatientSide | null): string {
  return side ? `${def.id} ${side} ${def.short}` : `${def.id} ${def.short}`;
}

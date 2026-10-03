/**
 * Contract of POST /api/viewer/detect-landmarks — AI pelvic landmark
 * detection on an AP pelvis (or AP full-spine) radiograph.
 *
 * Request: DetectLandmarksRequest
 *
 * 200 → DetectLandmarksResponse (image accepted, landmarks placed)
 * 422 → DetectLandmarksRejection (image not suitable for AI analysis)
 * 504 → { error: "TIMEOUT"; message } (the analysis ran out of time; try again)
 * 429 → { error: "DAILY_LIMIT" | "RATE_LIMITED"; message }
 * other → { error: string; message: string }
 *
 * With `Accept: application/x-ndjson` a request that gets as far as the
 * analysis answers 200 with one JSON object per line: DetectLandmarksProgress
 * lines, then a single DetectLandmarksDone carrying the status and body above.
 *
 * The film is analysed upright as the viewer shows it: its `view` rotation
 * and vertical flip applied, any horizontal flip ignored. "Image left/right"
 * (landmark keys, side marker, patientRightOn) means the sides of that
 * upright frame. Coordinates are always STORED-image pixels: the X-ray's own
 * grid (EXIF orientation applied), top-left origin, before any view
 * transform.
 */

/** The viewer's rotation and vertical flip (imageAdjustments.rotation / flipV; never flipH). */
export interface PelvisAnalysisView {
  rotation: 0 | 90 | 180 | 270;
  flipV: boolean;
}

export interface DetectLandmarksRequest {
  xrayId: string;
  /** Defaults to { rotation: 0, flipV: false }. */
  view?: PelvisAnalysisView;
}

/** What the first (gate) pass saw in the upright film. */
export interface PelvisImageAssessment {
  isRadiograph: boolean;
  projection: "AP" | "PA" | "lateral" | "oblique" | "other" | "unknown";
  region: "pelvis" | "full_spine" | "lumbar" | "hip" | "chest" | "other";
  /** Iliac crests toward the top and femurs pointing down; false is a rejection. */
  upright: boolean;
  visible: {
    iliacCrests: boolean;
    femoralHeads: boolean;
    ischialTuberosities: boolean;
    sacrum: boolean;
    pubicSymphysis: boolean;
  };
  hipImplant: boolean;
  /** Measurement lines or landmark dots burnt into the image (side markers don't count). */
  overlays: boolean;
  quality: "good" | "fair" | "poor";
  /** Side marker letter and the (upright) image side it sits on, if one is legible. */
  sideMarker: { letter: "R" | "L"; imageSide: "left" | "right" } | null;
  /** Bony pelvis box in stored-image pixels: [x0, y0, x1, y1]. */
  pelvisBox: [number, number, number, number] | null;
  notes: string;
}

export interface DetectedLandmark {
  /** Paper number, 1-16 (Moon et al., Heliyon 2024, Fig. 2). */
  id: number;
  /** PelvicLandmarkKey (image sides of the upright frame), stored as shape.landmarkName. */
  key: string;
  /** Stored-image pixels, top-left origin. */
  x: number;
  y: number;
  /** 0-1: the model's confidence combined with agreement between runs. */
  confidence: number;
}

export interface DetectLandmarksResponse {
  landmarks: DetectedLandmark[];
  assessment: PelvisImageAssessment;
  /** Upright-frame image side holding the patient's right, and how that was decided. */
  patientRightOn: "left" | "right";
  sideSource: "marker" | "assumed";
  /** Accepted, but with caveats the user should see (e.g. ischial tuberosities out of view). */
  warnings: string[];
  model: string;
  /** X-rays analysed today against the user's daily limit (this one included). */
  usage?: AiUsageToday;
}

export interface AiUsageToday {
  used: number;
  limit: number;
}

export type AnalysisStage = "load" | "check" | "detect" | "refine";

export interface DetectLandmarksProgress {
  type: "progress";
  stage: AnalysisStage;
  label: string;
  /** 0-100: where the bar is now. */
  percent: number;
  /** 0-100: where it will be after the next step; the bar may creep toward it meanwhile. */
  ceiling: number;
}

export interface DetectLandmarksDone {
  type: "done";
  status: number;
  body: DetectLandmarksResponse | DetectLandmarksRejection | { error: string; message: string };
}

export interface DetectLandmarksRejection {
  error: "NOT_SUITABLE";
  message: string;
  /** Plain-language reasons the image was rejected, one per line. */
  reasons: string[];
  assessment: PelvisImageAssessment;
}

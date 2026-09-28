/**
 * What counts as "something saved" on an annotation. Shared by the client
 * saver and the annotation APIs so an X-ray that was only opened and closed
 * never gets an Annotation row (and never shows up as "annotated").
 */

/** Number of shapes in a stored canvasState (`AnnotationCanvasState.shapes`). */
export function countShapes(canvasState: unknown): number {
  if (!canvasState || typeof canvasState !== "object") return 0;
  const shapes = (canvasState as { shapes?: unknown }).shapes;
  return Array.isArray(shapes) ? shapes.length : 0;
}

/**
 * True when the image adjustments differ from the defaults — brightness,
 * contrast, invert, orientation or calibration. These are stored on the
 * annotation row, so they are worth saving even with no shapes.
 */
export function hasCustomAdjustments(adjustments: unknown): boolean {
  if (!adjustments || typeof adjustments !== "object") return false;
  const a = adjustments as Record<string, unknown>;
  return (
    (typeof a.brightness === "number" && a.brightness !== 0) ||
    (typeof a.contrast === "number" && a.contrast !== 0) ||
    a.invert === true ||
    a.flipH === true ||
    a.flipV === true ||
    (typeof a.rotation === "number" && a.rotation !== 0) ||
    (typeof a.pixelsPerMm === "number" && a.pixelsPerMm > 0)
  );
}

/** Nothing drawn and nothing adjusted — not worth creating an annotation for. */
export function isEmptyAnnotation(canvasState: unknown, adjustments: unknown): boolean {
  return countShapes(canvasState) === 0 && !hasCustomAdjustments(adjustments);
}

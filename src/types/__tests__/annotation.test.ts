import { describe, it, expect } from 'vitest'
import {
  screenToImage,
  imageToScreen,
  computeBoundingBox,
  simplifyPoints,
  createEmptyCanvasState,
  applyZoomAroundAnchor,
  DEFAULT_SHAPE_STYLE,
  ANNOTATION_COLOR_PRESETS,
  ZOOM_MIN,
  ZOOM_MAX,
  type Point,
  type ViewTransform,
} from '../annotation'

// ─── screenToImage / imageToScreen ───

describe('screenToImage', () => {
  it('converts with no pan/zoom (identity)', () => {
    const transform: ViewTransform = { zoom: 1, panX: 0, panY: 0 }
    expect(screenToImage(100, 200, transform)).toEqual({ x: 100, y: 200 })
  })

  it('accounts for zoom', () => {
    const transform: ViewTransform = { zoom: 2, panX: 0, panY: 0 }
    const result = screenToImage(200, 400, transform)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  it('accounts for pan', () => {
    const transform: ViewTransform = { zoom: 1, panX: 50, panY: 100 }
    const result = screenToImage(150, 300, transform)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  it('accounts for zoom + pan combined', () => {
    const transform: ViewTransform = { zoom: 2, panX: 50, panY: 100 }
    const result = screenToImage(250, 500, transform)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })
})

describe('imageToScreen', () => {
  it('converts with no pan/zoom (identity)', () => {
    const transform: ViewTransform = { zoom: 1, panX: 0, panY: 0 }
    expect(imageToScreen(100, 200, transform)).toEqual({ x: 100, y: 200 })
  })

  it('accounts for zoom', () => {
    const transform: ViewTransform = { zoom: 2, panX: 0, panY: 0 }
    const result = imageToScreen(100, 200, transform)
    expect(result.x).toBe(200)
    expect(result.y).toBe(400)
  })

  it('accounts for pan', () => {
    const transform: ViewTransform = { zoom: 1, panX: 50, panY: 100 }
    const result = imageToScreen(100, 200, transform)
    expect(result.x).toBe(150)
    expect(result.y).toBe(300)
  })
})

describe('screenToImage <-> imageToScreen round-trip', () => {
  it('round-trips correctly', () => {
    const transform: ViewTransform = { zoom: 1.5, panX: -30, panY: 75 }
    const original = { x: 42, y: 99 }
    const screen = imageToScreen(original.x, original.y, transform)
    const back = screenToImage(screen.x, screen.y, transform)
    expect(back.x).toBeCloseTo(original.x)
    expect(back.y).toBeCloseTo(original.y)
  })
})

// ─── computeBoundingBox ───

describe('computeBoundingBox', () => {
  it('returns zero for empty points', () => {
    expect(computeBoundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('returns zero-size for single point', () => {
    expect(computeBoundingBox([{ x: 10, y: 20 }])).toEqual({
      x: 10,
      y: 20,
      width: 0,
      height: 0,
    })
  })

  it('computes bounding box for two points', () => {
    const points: Point[] = [
      { x: 10, y: 20 },
      { x: 50, y: 80 },
    ]
    expect(computeBoundingBox(points)).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 60,
    })
  })

  it('handles points in any order', () => {
    const points: Point[] = [
      { x: 50, y: 80 },
      { x: 10, y: 20 },
      { x: 30, y: 50 },
    ]
    expect(computeBoundingBox(points)).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 60,
    })
  })

  it('handles negative coordinates', () => {
    const points: Point[] = [
      { x: -10, y: -20 },
      { x: 10, y: 20 },
    ]
    expect(computeBoundingBox(points)).toEqual({
      x: -10,
      y: -20,
      width: 20,
      height: 40,
    })
  })
})

// ─── simplifyPoints (Ramer-Douglas-Peucker) ───

describe('simplifyPoints', () => {
  it('returns input for 0 or 1 points', () => {
    expect(simplifyPoints([], 1)).toEqual([])
    expect(simplifyPoints([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }])
  })

  it('returns input for 2 points', () => {
    const pts: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(simplifyPoints(pts, 1)).toEqual(pts)
  })

  it('removes collinear points', () => {
    // Three collinear points: the middle one should be removed
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ]
    const result = simplifyPoints(pts, 0.1)
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ])
  })

  it('keeps non-collinear points with tight tolerance', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 0 },
    ]
    const result = simplifyPoints(pts, 0.1)
    expect(result.length).toBe(3)
  })

  it('reduces a zigzag with high tolerance', () => {
    // Create a zigzag with small deviations
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: -0.1 },
      { x: 3, y: 0.1 },
      { x: 4, y: -0.1 },
      { x: 5, y: 0 },
    ]
    const result = simplifyPoints(pts, 1)
    // With tolerance 1, deviations of 0.1 should be removed
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ])
  })

  it('preserves sharp corners with appropriate tolerance', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]
    const result = simplifyPoints(pts, 1)
    expect(result.length).toBe(3) // corner should be kept
  })
})

// ─── createEmptyCanvasState ───

describe('createEmptyCanvasState', () => {
  it('returns correct default structure', () => {
    const state = createEmptyCanvasState()
    expect(state.version).toBe(1)
    expect(state.shapes).toEqual([])
    expect(state.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 })
    expect(state.metadata.shapeCount).toBe(0)
    expect(state.metadata.measurementCount).toBe(0)
    expect(state.metadata.lastModifiedShapeId).toBeNull()
  })

  it('returns a new object each call', () => {
    const a = createEmptyCanvasState()
    const b = createEmptyCanvasState()
    expect(a).not.toBe(b)
    expect(a.shapes).not.toBe(b.shapes)
  })
})

// ─── Constants ───

describe('DEFAULT_SHAPE_STYLE', () => {
  it('uses red stroke', () => {
    expect(DEFAULT_SHAPE_STYLE.strokeColor).toBe('#FF3B30')
  })

  it('uses 2px stroke width', () => {
    expect(DEFAULT_SHAPE_STYLE.strokeWidth).toBe(2)
  })
})

describe('ANNOTATION_COLOR_PRESETS', () => {
  it('has 8 colors', () => {
    expect(ANNOTATION_COLOR_PRESETS).toHaveLength(8)
  })

  it('starts with red', () => {
    expect(ANNOTATION_COLOR_PRESETS[0]).toBe('#FF3B30')
  })
})

// ─── applyZoomAroundAnchor ───
//
// The cursor-anchor invariant: the image-space pixel under the anchor
// before the zoom must equal the image-space pixel under the anchor
// after the zoom. These tests catch all three "broken zoom" variants
// (zoom-to-corner, zoom-to-center, off-by-one drift) since any of them
// would violate the invariant.

describe('applyZoomAroundAnchor', () => {
  // Round-trip the anchor through the new transform: the image-space pixel
  // that was under the cursor before should still be under the cursor after.
  function imageUnderAnchor(t: ViewTransform, ax: number, ay: number): Point {
    return screenToImage(ax, ay, t)
  }

  it('keeps the anchor pixel fixed for a single zoom-in step', () => {
    const prev: ViewTransform = { zoom: 1, panX: 0, panY: 0 }
    const ax = 350
    const ay = 220
    const before = imageUnderAnchor(prev, ax, ay)
    const next = applyZoomAroundAnchor(prev, 1.1, ax, ay)
    const after = imageUnderAnchor(next, ax, ay)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(next.zoom).toBeCloseTo(1.1)
  })

  it('keeps the anchor pixel fixed when starting from a non-zero pan', () => {
    const prev: ViewTransform = { zoom: 1.5, panX: -120, panY: 80 }
    const ax = 410
    const ay = 305
    const before = imageUnderAnchor(prev, ax, ay)
    const next = applyZoomAroundAnchor(prev, 0.7, ax, ay)
    const after = imageUnderAnchor(next, ax, ay)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  // The chained-zoom test catches variant 3 (the "almost-correct" off-by-one
  // drift): each step composes against the previous step's *output*, so any
  // small per-step error accumulates over many steps.
  it('accumulates no drift across many chained zoom steps', () => {
    let t: ViewTransform = { zoom: 1, panX: 50, panY: -30 }
    const ax = 612
    const ay = 188
    const initialImagePos = imageUnderAnchor(t, ax, ay)

    // 12 zoom-ins followed by 12 zoom-outs back to ~original zoom.
    for (let i = 0; i < 12; i++) t = applyZoomAroundAnchor(t, 1.1, ax, ay)
    for (let i = 0; i < 12; i++) t = applyZoomAroundAnchor(t, 1 / 1.1, ax, ay)

    const final = imageUnderAnchor(t, ax, ay)
    // Tighter than 1px tolerance — drift in variant 3 is measured in pixels
    // per step, so even sub-pixel chained drift would fail this.
    expect(final.x).toBeCloseTo(initialImagePos.x, 6)
    expect(final.y).toBeCloseTo(initialImagePos.y, 6)
  })

  it('clamps to ZOOM_MAX when the factor would exceed it', () => {
    const prev: ViewTransform = { zoom: ZOOM_MAX * 0.95, panX: 0, panY: 0 }
    const next = applyZoomAroundAnchor(prev, 5, 100, 100)
    expect(next.zoom).toBe(ZOOM_MAX)
  })

  it('clamps to ZOOM_MIN when the factor would go below it', () => {
    const prev: ViewTransform = { zoom: ZOOM_MIN * 1.05, panX: 0, panY: 0 }
    const next = applyZoomAroundAnchor(prev, 0.1, 100, 100)
    expect(next.zoom).toBe(ZOOM_MIN)
  })

  it('still anchors to the cursor when zoom is clamped', () => {
    // Verify the invariant doesn't break at the clamp boundary — important
    // because cursor anchoring uses `newZoom`, and a naive impl that uses
    // the unclamped target would drift when the user keeps zooming past max.
    const prev: ViewTransform = { zoom: ZOOM_MAX * 0.99, panX: 0, panY: 0 }
    const ax = 200
    const ay = 200
    const before = imageUnderAnchor(prev, ax, ay)
    const next = applyZoomAroundAnchor(prev, 5, ax, ay)
    const after = imageUnderAnchor(next, ax, ay)
    expect(next.zoom).toBe(ZOOM_MAX)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('does not mutate the input transform', () => {
    const prev: ViewTransform = { zoom: 1, panX: 10, panY: 20 }
    const snapshot = { ...prev }
    applyZoomAroundAnchor(prev, 1.5, 100, 100)
    expect(prev).toEqual(snapshot)
  })
})

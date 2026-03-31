import { describe, it, expect } from 'vitest'
import {
  screenToImage,
  imageToScreen,
  computeBoundingBox,
  simplifyPoints,
  createEmptyCanvasState,
  DEFAULT_SHAPE_STYLE,
  ANNOTATION_COLOR_PRESETS,
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

import { describe, it, expect } from 'vitest'
import {
  validateFileType,
  validateFileSize,
  validateDimensions,
  colourfulness,
  looksLikePhoneScreenshot,
  shouldConfirmNotXray,
  MAX_FILE_SIZE,
  COLOURFULNESS_THRESHOLD,
} from '../xray-validation'

function mockFile(overrides: { type?: string; size?: number } = {}): File {
  const blob = new Blob([''], { type: overrides.type ?? 'image/jpeg' })
  Object.defineProperty(blob, 'size', { value: overrides.size ?? 1024 })
  return blob as File
}

describe('validateFileType', () => {
  it('accepts image/jpeg', () => {
    expect(validateFileType(mockFile({ type: 'image/jpeg' }))).toEqual({ valid: true })
  })

  it('accepts image/png', () => {
    expect(validateFileType(mockFile({ type: 'image/png' }))).toEqual({ valid: true })
  })

  it('rejects image/gif', () => {
    const result = validateFileType(mockFile({ type: 'image/gif' }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('JPEG and PNG')
  })

  it('rejects image/webp', () => {
    const result = validateFileType(mockFile({ type: 'image/webp' }))
    expect(result.valid).toBe(false)
  })

  it('rejects application/pdf', () => {
    const result = validateFileType(mockFile({ type: 'application/pdf' }))
    expect(result.valid).toBe(false)
  })

  it('rejects empty MIME type', () => {
    const result = validateFileType(mockFile({ type: '' }))
    expect(result.valid).toBe(false)
  })
})

describe('validateFileSize', () => {
  it('accepts a small file', () => {
    expect(validateFileSize(mockFile({ size: 1024 }))).toEqual({ valid: true })
  })

  it('accepts a file exactly at the limit', () => {
    expect(validateFileSize(mockFile({ size: MAX_FILE_SIZE }))).toEqual({ valid: true })
  })

  it('rejects a file over 300 MB', () => {
    const result = validateFileSize(mockFile({ size: MAX_FILE_SIZE + 1 }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('300 MB')
  })
})

describe('validateDimensions', () => {
  it('accepts valid dimensions', () => {
    expect(validateDimensions({ width: 1920, height: 1080 })).toEqual({ valid: true })
  })

  it('accepts minimum dimensions (100x100)', () => {
    expect(validateDimensions({ width: 100, height: 100 })).toEqual({ valid: true })
  })

  it('accepts maximum dimensions (16384x16384)', () => {
    expect(validateDimensions({ width: 16384, height: 16384 })).toEqual({ valid: true })
  })

  it('rejects width below minimum', () => {
    const result = validateDimensions({ width: 99, height: 500 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 100')
  })

  it('rejects height below minimum', () => {
    const result = validateDimensions({ width: 500, height: 50 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('at least 100')
  })

  it('rejects width above maximum', () => {
    const result = validateDimensions({ width: 16385, height: 1000 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('16384')
  })

  it('rejects height above maximum', () => {
    const result = validateDimensions({ width: 1000, height: 16385 })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('16384')
  })
})

/** RGBA pixel data from [r, g, b] triples (fully opaque). */
function pixels(...rgb: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]))
}

describe('colourfulness', () => {
  it('is 0 for pure greyscale', () => {
    expect(colourfulness(pixels([0, 0, 0], [128, 128, 128], [255, 255, 255]))).toBe(0)
  })

  it('stays under the threshold for a slightly tinted film scan', () => {
    const tinted = pixels(...Array.from({ length: 50 }, (_, i): [number, number, number] => [i * 5, i * 5 + 3, i * 5 + 6]))
    expect(colourfulness(tinted)).toBeLessThan(COLOURFULNESS_THRESHOLD)
  })

  it('is high for a colour photo / app screenshot', () => {
    const colourful = pixels([230, 40, 40], [40, 200, 60], [30, 90, 240], [250, 250, 250])
    expect(colourfulness(colourful)).toBeGreaterThan(COLOURFULNESS_THRESHOLD)
  })

  it('averages max − min per pixel and skips transparent pixels', () => {
    const data = new Uint8ClampedArray([100, 50, 0, 255, 10, 10, 10, 255, 255, 0, 0, 0])
    expect(colourfulness(data)).toBe(50)
  })

  it('is 0 for no pixels', () => {
    expect(colourfulness(new Uint8ClampedArray())).toBe(0)
  })
})

describe('looksLikePhoneScreenshot', () => {
  it('flags a tall phone screenshot', () => {
    expect(looksLikePhoneScreenshot({ width: 1170, height: 2532 })).toBe(true)
    expect(looksLikePhoneScreenshot({ width: 1080, height: 2400 })).toBe(true)
  })

  it('flags a landscape phone screenshot', () => {
    expect(looksLikePhoneScreenshot({ width: 1600, height: 740 })).toBe(true)
  })

  it('does not flag typical film proportions', () => {
    expect(looksLikePhoneScreenshot({ width: 2000, height: 2400 })).toBe(false)
    expect(looksLikePhoneScreenshot({ width: 1024, height: 1280 })).toBe(false)
  })

  it('does not flag a tall image wider than a phone screen (e.g. a full-spine stitch)', () => {
    expect(looksLikePhoneScreenshot({ width: 1800, height: 4800 })).toBe(false)
  })
})

describe('shouldConfirmNotXray', () => {
  it('asks for colourful images or screenshot shapes, not greyscale films', () => {
    expect(shouldConfirmNotXray({ width: 2000, height: 2400 }, 2)).toBe(false)
    expect(shouldConfirmNotXray({ width: 2000, height: 2400 }, COLOURFULNESS_THRESHOLD + 1)).toBe(true)
    expect(shouldConfirmNotXray({ width: 1170, height: 2532 }, 0)).toBe(true)
  })
})

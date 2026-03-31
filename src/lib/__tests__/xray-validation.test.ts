import { describe, it, expect } from 'vitest'
import {
  validateFileType,
  validateFileSize,
  validateDimensions,
  MAX_FILE_SIZE,
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

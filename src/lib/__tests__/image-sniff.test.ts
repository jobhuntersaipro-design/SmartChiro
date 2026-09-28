import { describe, it, expect } from 'vitest'
import { sniffImage, checkUploadedImage } from '../image-sniff'

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]

/** PNG signature + IHDR chunk header for a width × height image. */
function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32(13), 0x49, 0x48, 0x44, 0x52, // IHDR
    ...u32(width), ...u32(height),
    0x08, 0x00, 0x00, 0x00, 0x00, // bit depth, colour type, compression, filter, interlace
  ])
}

/** A segment: FF marker + 2-byte length (incl. itself) + payload. */
const segment = (marker: number, payload: number[]) => [0xff, marker, ...u16(payload.length + 2), ...payload]

/** SOI, an APP0/APP1 segment or two, then a SOFn frame header. */
function jpeg(width: number, height: number, sof = 0xc0, before: number[][] = []): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    ...before.flat(),
    ...segment(sof, [0x08, ...u16(height), ...u16(width), 0x01, 0x01, 0x11, 0x00]),
    0xff, 0xd9,
  ])
}

const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00])
const exif = segment(0xe1, new Array(3000).fill(0x2a))
const dht = segment(0xc4, new Array(20).fill(0x00))

describe('sniffImage', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(sniffImage(png(2048, 2560))).toEqual({ mimeType: 'image/png', width: 2048, height: 2560 })
  })

  it('reads baseline JPEG dimensions after APP segments', () => {
    expect(sniffImage(jpeg(1170, 2532, 0xc0, [app0, exif]))).toEqual({ mimeType: 'image/jpeg', width: 1170, height: 2532 })
  })

  it('reads progressive JPEG (SOF2) and skips DHT, which is not a frame header', () => {
    expect(sniffImage(jpeg(3000, 4000, 0xc2, [app0, dht]))).toEqual({ mimeType: 'image/jpeg', width: 3000, height: 4000 })
  })

  it('tolerates 0xFF fill bytes before a marker', () => {
    const bytes = jpeg(640, 480)
    const padded = new Uint8Array([...bytes.slice(0, 2), 0xff, 0xff, ...bytes.slice(2)])
    expect(sniffImage(padded)).toMatchObject({ width: 640, height: 480 })
  })

  it('knows the type but not the size when the header is cut off', () => {
    expect(sniffImage(png(500, 500).slice(0, 12))).toEqual({ mimeType: 'image/png', width: null, height: null })
    const truncated = jpeg(500, 500, 0xc0, [app0, exif]).slice(0, 200)
    expect(sniffImage(truncated)).toEqual({ mimeType: 'image/jpeg', width: null, height: null })
  })

  it('gives no size when the scan starts before any frame header', () => {
    const bytes = new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xda, 0x00, 0x02])
    expect(sniffImage(bytes)).toEqual({ mimeType: 'image/jpeg', width: null, height: null })
  })

  it('rejects anything else', () => {
    expect(sniffImage(new TextEncoder().encode('<!doctype html>'))).toBeNull()
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull() // GIF
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeNull() // WEBP
    expect(sniffImage(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('checkUploadedImage', () => {
  const declared = { width: 2000, height: 2400 }

  it('accepts a matching file and returns the real size from its header', () => {
    expect(checkUploadedImage(jpeg(1800, 2200), 'image/jpeg', declared)).toEqual({ ok: true, width: 1800, height: 2200 })
  })

  it('falls back to the declared size when the header is not in the bytes', () => {
    expect(checkUploadedImage(png(1, 1).slice(0, 10), 'image/png', declared)).toEqual({ ok: true, width: 2000, height: 2400 })
  })

  it('rejects bytes that are not PNG/JPEG', () => {
    expect(checkUploadedImage(new TextEncoder().encode('hello'), 'image/png', declared).ok).toBe(false)
  })

  it('rejects a JPEG declared as PNG (and vice versa)', () => {
    expect(checkUploadedImage(jpeg(1000, 1000), 'image/png', declared).ok).toBe(false)
    expect(checkUploadedImage(png(1000, 1000), 'image/jpeg', declared).ok).toBe(false)
  })

  it('rejects real dimensions outside the allowed range', () => {
    expect(checkUploadedImage(png(50, 2000), 'image/png', declared).ok).toBe(false)
    expect(checkUploadedImage(png(20000, 2000), 'image/png', declared).ok).toBe(false)
  })
})

import { MAX_DIMENSION, MIN_DIMENSION } from "@/lib/xray-validation";

/*
 * Identify a PNG or JPEG from its first bytes and read its real pixel size,
 * without decoding the image. Works on a prefix of the file (e.g. a ranged
 * GET from storage); dimensions are null when they aren't in the bytes given.
 */

export type SniffedMimeType = "image/png" | "image/jpeg";

export interface SniffedImage {
  mimeType: SniffedMimeType;
  width: number | null;
  height: number | null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** How much of a stored file to fetch to find the header (EXIF/ICC segments can be large). */
export const SNIFF_BYTES = 128 * 1024;

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function positiveOrNull(n: number): number | null {
  return n > 0 ? n : null;
}

/** PNG: the first chunk must be IHDR — width and height are its first two big-endian uint32s. */
function pngDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  const isIhdr =
    bytes.length >= 24 && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isIhdr) return { width: null, height: null };
  return { width: positiveOrNull(uint32(bytes, 16)), height: positiveOrNull(uint32(bytes, 20)) };
}

/** Start-of-frame markers (baseline, progressive, lossless, arithmetic) — not DHT (C4), JPG (C8) or DAC (CC). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * EXIF orientation (1–8) from an APP1 segment's data, or 1. Phone photos are
 * stored sideways with orientation 6 or 8; browsers draw them upright.
 */
function exifOrientation(bytes: Uint8Array, start: number, end: number): number {
  // "Exif\0\0" then a TIFF header: byte order, 42, offset of the first IFD.
  if (end - start < 14 || String.fromCharCode(...bytes.subarray(start, start + 4)) !== "Exif") return 1;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const u16 = (o: number) => (little ? bytes[o] | (bytes[o + 1] << 8) : uint16(bytes, o));
  const u32 = (o: number) =>
    little ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0 : uint32(bytes, o);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/**
 * JPEG: walk the marker segments until a SOFn, which holds height then width.
 * An EXIF orientation of 5–8 (rotated 90°/270°) swaps them: the size stored is
 * the upright one the browser shows.
 */
function jpegDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  const none = { width: null, height: null };
  let orientation = 1;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return none;
    // Markers may be preceded by any number of 0xFF fill bytes.
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return none;
    const marker = bytes[offset];
    offset++;
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // End of image or start of scan before any frame header: no size to read.
    if (marker === 0xd9 || marker === 0xda) return none;
    if (offset + 2 > bytes.length) return none;
    const length = uint16(bytes, offset);
    if (length < 2) return none;
    if (marker === 0xe1) orientation = exifOrientation(bytes, offset + 2, Math.min(offset + length, bytes.length));
    if (isStartOfFrame(marker)) {
      if (offset + 7 > bytes.length) return none;
      const height = positiveOrNull(uint16(bytes, offset + 3));
      const width = positiveOrNull(uint16(bytes, offset + 5));
      return orientation >= 5 ? { width: height, height: width } : { width, height };
    }
    offset += length;
  }
  return none;
}

/** PNG or JPEG with its dimensions, or null when the bytes are neither. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return { mimeType: "image/png", ...pngDimensions(bytes) };
  if (startsWith(bytes, JPEG_SIGNATURE)) return { mimeType: "image/jpeg", ...jpegDimensions(bytes) };
  return null;
}

export type UploadedImageCheck =
  | { ok: true; width: number | null; height: number | null }
  | { ok: false; message: string };

/**
 * Server-side check of an uploaded X-ray: the bytes must really be the
 * declared PNG/JPEG, and the size stored is the one in the file header (the
 * client-declared size is only a fallback when the header wasn't in `bytes`).
 */
export function checkUploadedImage(
  bytes: Uint8Array,
  declaredMimeType: string,
  declared: { width: number | null; height: number | null },
): UploadedImageCheck {
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    return { ok: false, message: "This file isn't a PNG or JPEG image." };
  }
  if (sniffed.mimeType !== declaredMimeType) {
    const actual = sniffed.mimeType === "image/png" ? "PNG" : "JPEG";
    return { ok: false, message: `This file is really a ${actual} — rename it with the right extension and upload it again.` };
  }
  const width = sniffed.width ?? declared.width;
  const height = sniffed.height ?? declared.height;
  if (width !== null && height !== null) {
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return { ok: false, message: "Image must be at least 100 × 100 pixels." };
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      return { ok: false, message: "Image dimensions exceed the maximum of 16384 × 16384 pixels." };
    }
  }
  return { ok: true, width, height };
}

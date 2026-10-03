export const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'] as const
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'] as const
export const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB
export const MIN_DIMENSION = 100 // px
export const MAX_DIMENSION = 16384 // px (browser canvas limit)
export const THUMBNAIL_MAX_EDGE = 256 // px
export const THUMBNAIL_QUALITY = 0.8 // JPEG 80%

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ImageDimensions {
  width: number
  height: number
}

/**
 * Validate file type against allowed MIME types.
 */
export function validateFileType(file: File): ValidationResult {
  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return { valid: false, error: 'Only JPEG and PNG files are supported.' }
  }
  return { valid: true }
}

/**
 * Validate file size against the 300 MB limit.
 */
export function validateFileSize(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large. Maximum size is 300 MB.' }
  }
  return { valid: true }
}

/**
 * Load an image file and return its natural dimensions.
 */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image.'))
    }
    img.src = url
  })
}

/**
 * Validate image dimensions against min/max constraints.
 */
export function validateDimensions(dimensions: ImageDimensions): ValidationResult {
  const { width, height } = dimensions
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return { valid: false, error: 'Image must be at least 100 × 100 pixels.' }
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return {
      valid: false,
      error: 'Image dimensions exceed the maximum of 16384 × 16384 pixels.',
    }
  }
  return { valid: true }
}

/**
 * Run all client-side validations on a file.
 * Returns dimensions on success or throws with an error message.
 */
export async function validateXrayFile(file: File): Promise<ImageDimensions> {
  const typeCheck = validateFileType(file)
  if (!typeCheck.valid) throw new Error(typeCheck.error)

  const sizeCheck = validateFileSize(file)
  if (!sizeCheck.valid) throw new Error(sizeCheck.error)

  const dimensions = await getImageDimensions(file)

  const dimCheck = validateDimensions(dimensions)
  if (!dimCheck.valid) throw new Error(dimCheck.error)

  return dimensions
}

/**
 * Generate a thumbnail from a File.
 * Returns a Blob scaled to 256px longest edge, JPEG 80% quality.
 */
export function generateThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)

      const { naturalWidth, naturalHeight } = img
      const scale = THUMBNAIL_MAX_EDGE / Math.max(naturalWidth, naturalHeight)
      const width = Math.round(naturalWidth * scale)
      const height = Math.round(naturalHeight * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context.'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to generate thumbnail.'))
          }
        },
        'image/jpeg',
        THUMBNAIL_QUALITY
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for thumbnail.'))
    }
    img.src = url
  })
}

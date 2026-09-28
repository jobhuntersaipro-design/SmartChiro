import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

/**
 * Generate a presigned PUT URL for uploading a file to R2.
 * Expires in 15 minutes by default (a large film on a slow clinic line).
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client, command, { expiresIn })
}

/**
 * Size of an object in R2, or null when it doesn't exist. Other errors throw.
 */
export async function headR2Object(key: string): Promise<{ size: number } | null> {
  try {
    const res = await r2Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }))
    return { size: res.ContentLength ?? 0 }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || (error as Error).name === 'NotFound') return null
    throw error
  }
}

/**
 * The first `length` bytes of an object in R2 (ranged GET), or null when it
 * doesn't exist. Other errors throw.
 */
export async function readR2ObjectPrefix(key: string, length: number): Promise<Uint8Array | null> {
  try {
    const res = await r2Client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Range: `bytes=0-${length - 1}` })
    )
    if (!res.Body) return new Uint8Array()
    return await res.Body.transformToByteArray()
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    if (status === 404 || (error as Error).name === 'NoSuchKey') return null
    throw error
  }
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })
  await r2Client.send(command)
}

/**
 * Build the R2 storage key for an X-ray file.
 * Structure: /xrays/{branchId}/{patientId}/{xrayId}/{filename}
 */
export function buildXrayKey(
  branchId: string,
  patientId: string,
  xrayId: string,
  filename: string
): string {
  return `xrays/${branchId}/${patientId}/${xrayId}/${filename}`
}

/**
 * Generate a presigned GET URL for downloading a file from R2.
 * Expires in 24 hours by default.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 86400
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })
  return getSignedUrl(r2Client, command, { expiresIn })
}

/**
 * Upload a buffer directly to R2.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  })
  await r2Client.send(command)
}

/**
 * Get the public URL for an R2 object.
 */
export function getR2PublicUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL!
  return `${publicUrl}/${key}`
}

/**
 * Build the R2 storage key for an export file.
 * Structure: /xrays/{branchId}/{patientId}/{xrayId}/exports/{exportId}.{ext}
 */
export function buildExportKey(
  branchId: string,
  patientId: string,
  xrayId: string,
  exportId: string,
  ext: 'png' | 'pdf'
): string {
  return `xrays/${branchId}/${patientId}/${xrayId}/exports/${exportId}.${ext}`
}

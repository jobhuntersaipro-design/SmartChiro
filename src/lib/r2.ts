import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
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
 * Structure: exports/{patientId}/{xrayId}/{exportId}.{ext} — one top-level
 * prefix so a bucket lifecycle rule can expire them (the download link only
 * lasts 24 hours).
 */
export function buildExportKey(
  patientId: string,
  xrayId: string,
  exportId: string,
  ext: 'png' | 'pdf'
): string {
  return `exports/${patientId}/${xrayId}/${exportId}.${ext}`
}

/** The object key behind one of our public R2 URLs (null for any other URL). */
export function r2KeyFromUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL
  return base && url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null
}

/** Delete every object under `prefix` (1,000 per request). Returns how many. */
export async function deleteR2Prefix(prefix: string): Promise<number> {
  let deleted = 0
  let token: string | undefined
  do {
    const list = await r2Client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: token }),
    )
    const objects = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
    if (objects.length > 0) {
      await r2Client.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET_NAME, Delete: { Objects: objects, Quiet: true } }))
      deleted += objects.length
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (token)
  return deleted
}

/**
 * Storage prefixes holding a patient's files: each X-ray's folder (from its
 * stored URL, so a patient who changed branch is covered) and their exports.
 */
export function patientR2Prefixes(patientId: string, xrayFileUrls: string[]): string[] {
  const folders = xrayFileUrls.flatMap((url) => {
    const key = r2KeyFromUrl(url)
    return key && key.includes('/') ? [key.slice(0, key.lastIndexOf('/') + 1)] : []
  })
  return [...new Set([...folders, `exports/${patientId}/`])]
}

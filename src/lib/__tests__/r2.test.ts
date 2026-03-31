import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env vars before importing the module
vi.stubEnv('R2_ACCOUNT_ID', 'test-account-id')
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key')
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret')
vi.stubEnv('R2_BUCKET_NAME', 'test-bucket')
vi.stubEnv('R2_PUBLIC_URL', 'https://cdn.example.com')

// Mock the S3 SDK so the module can be imported without real credentials
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {},
  PutObjectCommand: class MockPutObjectCommand {},
  DeleteObjectCommand: class MockDeleteObjectCommand {},
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}))

describe('buildXrayKey', () => {
  let buildXrayKey: typeof import('../r2').buildXrayKey

  beforeEach(async () => {
    const mod = await import('../r2')
    buildXrayKey = mod.buildXrayKey
  })

  it('builds the correct key structure', () => {
    const key = buildXrayKey('clinic-1', 'patient-2', 'xray-3', 'original.jpg')
    expect(key).toBe('xrays/clinic-1/patient-2/xray-3/original.jpg')
  })

  it('builds thumbnail key', () => {
    const key = buildXrayKey('c1', 'p2', 'x3', 'thumbnail.jpg')
    expect(key).toBe('xrays/c1/p2/x3/thumbnail.jpg')
  })

  it('builds export key', () => {
    const key = buildXrayKey('c1', 'p2', 'x3', 'exports/export-1.png')
    expect(key).toBe('xrays/c1/p2/x3/exports/export-1.png')
  })
})

describe('getR2PublicUrl', () => {
  let getR2PublicUrl: typeof import('../r2').getR2PublicUrl

  beforeEach(async () => {
    const mod = await import('../r2')
    getR2PublicUrl = mod.getR2PublicUrl
  })

  it('returns correct public URL', () => {
    const url = getR2PublicUrl('xrays/c1/p2/x3/original.jpg')
    expect(url).toBe('https://cdn.example.com/xrays/c1/p2/x3/original.jpg')
  })

  it('does not double-slash between host and key', () => {
    const url = getR2PublicUrl('some-key.png')
    // Strip protocol, then verify no double slashes
    const withoutProtocol = url.replace('https://', '')
    expect(withoutProtocol).not.toContain('//')
    expect(url).toBe('https://cdn.example.com/some-key.png')
  })
})

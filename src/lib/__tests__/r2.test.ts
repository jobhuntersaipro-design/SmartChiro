import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env vars before importing the module
vi.stubEnv('R2_ACCOUNT_ID', 'test-account-id')
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key')
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret')
vi.stubEnv('R2_BUCKET_NAME', 'test-bucket')
vi.stubEnv('R2_PUBLIC_URL', 'https://cdn.example.com')

// Mock the S3 SDK so the module can be imported without real credentials
const send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = send
  },
  PutObjectCommand: class MockPutObjectCommand {},
  DeleteObjectCommand: class MockDeleteObjectCommand {},
  GetObjectCommand: class MockGetObjectCommand {},
  ListObjectsV2Command: class MockList {
    kind = 'list'
    constructor(public input: unknown) {}
  },
  DeleteObjectsCommand: class MockDelete {
    kind = 'delete'
    constructor(public input: unknown) {}
  },
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
    const key = buildXrayKey('branch-1', 'patient-2', 'xray-3', 'original.jpg')
    expect(key).toBe('xrays/branch-1/patient-2/xray-3/original.jpg')
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

describe('buildExportKey', () => {
  let buildExportKey: typeof import('../r2').buildExportKey

  beforeEach(async () => {
    const mod = await import('../r2')
    buildExportKey = mod.buildExportKey
  })

  it('builds the correct export key for PNG', () => {
    const key = buildExportKey('patient-2', 'xray-3', 'export-abc', 'png')
    expect(key).toBe('exports/patient-2/xray-3/export-abc.png')
  })

  it('builds the correct export key for PDF', () => {
    const key = buildExportKey('p2', 'x3', 'exp-123', 'pdf')
    expect(key).toBe('exports/p2/x3/exp-123.pdf')
  })
})

describe('patient file cleanup', () => {
  it('finds each X-ray folder from its URL plus the exports folder; ignores other URLs', async () => {
    const { patientR2Prefixes } = await import('../r2')
    expect(
      patientR2Prefixes('p2', [
        'https://cdn.example.com/xrays/b1/p2/x1/original.jpg',
        'https://cdn.example.com/xrays/b0/p2/x2/original.png',
        'https://elsewhere.example.com/xrays/b1/p2/x9/original.jpg',
      ]),
    ).toEqual(['xrays/b1/p2/x1/', 'xrays/b0/p2/x2/', 'exports/p2/'])
  })

  it('deletes every object under a prefix, page by page', async () => {
    const { deleteR2Prefix } = await import('../r2')
    send.mockReset()
    send
      .mockResolvedValueOnce({ Contents: [{ Key: 'a/1' }, { Key: 'a/2' }], IsTruncated: true, NextContinuationToken: 't' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: 'a/3' }], IsTruncated: false })
      .mockResolvedValueOnce({})
    expect(await deleteR2Prefix('a/')).toBe(3)
    const deletes = send.mock.calls.map(([c]) => c).filter((c) => c.kind === 'delete')
    expect(deletes.map((c) => c.input.Delete.Objects)).toEqual([[{ Key: 'a/1' }, { Key: 'a/2' }], [{ Key: 'a/3' }]])
    expect(send.mock.calls[2][0].input).toMatchObject({ Prefix: 'a/', ContinuationToken: 't' })
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

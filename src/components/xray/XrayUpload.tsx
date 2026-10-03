'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload, X, CheckCircle, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  validateXrayFile,
  generateThumbnail,
  type ImageDimensions,
} from '@/lib/xray-validation'
import {
  uploadXray,
  BODY_REGION_OPTIONS,
  VIEW_TYPE_OPTIONS,
  type BodyRegion,
  type ViewType,
} from '@/lib/xray-upload-client'

type UploadStage =
  | 'idle'
  | 'validating'
  | 'generating-thumbnail'
  | 'uploading'
  | 'done'
  | 'error'

interface XrayUploadProps {
  patientId: string
  onUploadComplete?: (xrayId: string) => void
}

export function XrayUpload({ patientId, onUploadComplete }: XrayUploadProps) {
  const [stage, setStage] = useState<UploadStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [bodyRegion, setBodyRegion] = useState<BodyRegion | ''>('')
  const [viewType, setViewType] = useState<ViewType | ''>('')
  const [uploadedId, setUploadedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStage('idle')
    setError(null)
    setProgress(0)
    setFileName(null)
    setFileSize(0)
    setUploadedId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (preview) {
      URL.revokeObjectURL(preview)
      setPreview(null)
    }
  }, [preview])

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setFileName(file.name)
      setFileSize(file.size)
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)

      let dimensions: ImageDimensions

      // Step 1: Validate
      try {
        setStage('validating')
        dimensions = await validateXrayFile(file)
      } catch (err) {
        setStage('error')
        setError(err instanceof Error ? err.message : 'Validation failed.')
        return
      }

      // Step 2: Generate thumbnail
      let thumbnail: Blob
      try {
        setStage('generating-thumbnail')
        thumbnail = await generateThumbnail(file)
      } catch (err) {
        setStage('error')
        setError(err instanceof Error ? err.message : 'Thumbnail generation failed.')
        return
      }


      // Step 3: Upload straight to storage (see uploadXray), then confirm.
      try {
        setStage('uploading')
        setProgress(0)
        const { xrayId } = await uploadXray({
          file,
          thumbnail,
          width: dimensions.width,
          height: dimensions.height,
          patientId,
          bodyRegion: bodyRegion || null,
          viewType: viewType || null,
          onProgress: setProgress,
        })
        setStage('done')
        setProgress(100)
        setUploadedId(xrayId)
        onUploadComplete?.(xrayId)
      } catch (err) {
        setStage('error')
        setError(err instanceof Error ? err.message : 'Upload failed.')
      }
    },
    [patientId, onUploadComplete, bodyRegion, viewType]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const isUploading = stage === 'uploading'

  const stageLabel: Record<UploadStage, string> = {
    idle: '',
    validating: 'Validating file...',
    'generating-thumbnail': 'Generating thumbnail...',
    uploading: 'Uploading X-ray...',
    done: 'Upload complete!',
    error: 'Upload failed',
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="w-full max-w-130">
      {/* Optional details, saved with the X-ray (the title defaults to the file name) */}
      {stage === 'idle' && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="text-[14px] text-fg-secondary">
            Body region
            <select
              value={bodyRegion}
              onChange={(e) => setBodyRegion(e.target.value as BodyRegion | '')}
              className="mt-1 block h-9 w-full rounded-control border border-border bg-surface-muted px-2 text-[15px] text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Not set</option>
              {BODY_REGION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="text-[14px] text-fg-secondary">
            View
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType | '')}
              className="mt-1 block h-9 w-full rounded-control border border-border bg-surface-muted px-2 text-[15px] text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Not set</option>
              {VIEW_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Drop zone */}
      {stage === 'idle' && (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="flex cursor-pointer flex-col items-center justify-center rounded-panel border-2 border-dashed border-border bg-surface-muted px-6 py-10 transition-colors hover:border-border-strong hover:bg-surface-muted"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle">
            <Upload className="h-5 w-5 text-brand" strokeWidth={1.5} />
          </div>
          <p className="text-[16px] font-medium text-foreground">
            Drop an X-ray image here
          </p>
          <p className="mt-1 text-[15px] text-fg-secondary">
            or click to browse — JPEG, PNG up to 300 MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      )}

      {/* Upload progress */}
      {stage !== 'idle' && (
        <div className="rounded-panel border border-border bg-white p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-start gap-3">
            {/* Preview */}
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
              {preview ? (
                <img
                  src={preview}
                  alt="X-ray preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-fg-secondary" strokeWidth={1.5} />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-[15px] font-medium text-foreground">
                  {fileName}
                </p>
                {(stage === 'done' || stage === 'error') && (
                  <button
                    onClick={reset}
                    className="ml-2 flex-shrink-0 rounded-md p-1 text-fg-secondary transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[14px] text-fg-secondary">
                {formatFileSize(fileSize)}
              </p>

              {/* Progress bar */}
              {isUploading && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stage label */}
              <div className="mt-2 flex items-center gap-1.5">
                {(isUploading || stage === 'validating' || stage === 'generating-thumbnail') && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" strokeWidth={2} />
                )}
                {stage === 'done' && (
                  <CheckCircle className="h-3.5 w-3.5 text-success" strokeWidth={2} />
                )}
                {stage === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 text-danger" strokeWidth={2} />
                )}
                <span
                  className={`text-[14px] ${
                    stage === 'done'
                      ? 'text-success'
                      : stage === 'error'
                        ? 'text-danger'
                        : 'text-fg-secondary'
                  }`}
                >
                  {stageLabel[stage]}
                </span>
              </div>

              {stage === 'done' && uploadedId && (
                <Link
                  href={`/dashboard/xrays/${patientId}/${uploadedId}/annotate`}
                  target="_blank"
                  className="mt-2 inline-block text-[14px] font-medium text-brand hover:underline"
                >
                  Annotate now →
                </Link>
              )}

              {/* Error message + retry */}
              {stage === 'error' && error && (
                <div className="mt-2">
                  <p className="text-[14px] text-danger">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={reset}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

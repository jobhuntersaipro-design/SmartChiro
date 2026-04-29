'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, X, CheckCircle, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  validateXrayFile,
  generateThumbnail,
  type ImageDimensions,
} from '@/lib/xray-validation'

type UploadStage =
  | 'idle'
  | 'validating'
  | 'generating-thumbnail'
  | 'uploading'
  | 'done'
  | 'error'

interface XrayUploadProps {
  patientId: string
  uploadedById: string
  onUploadComplete?: (xrayId: string) => void
}

export function XrayUpload({ patientId, uploadedById, onUploadComplete }: XrayUploadProps) {
  const [stage, setStage] = useState<UploadStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStage('idle')
    setError(null)
    setProgress(0)
    setFileName(null)
    setFileSize(0)
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
      setPreview(URL.createObjectURL(file))

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

      // Step 3: Upload via server-side proxy (avoids R2 CORS issues)
      try {
        setStage('uploading')
        setProgress(0)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('thumbnail', new File([thumbnail], 'thumbnail.jpg', { type: 'image/jpeg' }))
        formData.append('patientId', patientId)
        formData.append('uploadedById', uploadedById)
        formData.append('width', String(dimensions.width))
        formData.append('height', String(dimensions.height))

        const xhr = new XMLHttpRequest()

        const uploadResult = await new Promise<{ xrayId: string }>((resolve, reject) => {
          xhr.open('POST', '/api/xrays/upload')

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100))
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText)
                resolve(data)
              } catch {
                reject(new Error('Invalid server response.'))
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText)
                reject(new Error(data.error || 'Upload failed.'))
              } catch {
                reject(new Error(`Upload failed with status ${xhr.status}.`))
              }
            }
          }

          xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'))
          xhr.send(formData)
        })

        setStage('done')
        setProgress(100)
        onUploadComplete?.(uploadResult.xrayId)
      } catch (err) {
        setStage('error')
        setError(err instanceof Error ? err.message : 'Upload failed.')
      }
    },
    [patientId, uploadedById, onUploadComplete]
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
    <div className="w-full max-w-[520px]">
      {/* Drop zone */}
      {stage === 'idle' && (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="flex cursor-pointer flex-col items-center justify-center rounded-[6px] border-2 border-dashed border-[#e5edf5] bg-[#f6f9fc] px-6 py-10 transition-colors hover:border-[#C1C9D2] hover:bg-[#f6f9fc]"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#ededfc]">
            <Upload className="h-5 w-5 text-[#533afd]" strokeWidth={1.5} />
          </div>
          <p className="text-[16px] font-medium text-[#061b31]">
            Drop an X-ray image here
          </p>
          <p className="mt-1 text-[15px] text-[#64748d]">
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
        <div className="rounded-[6px] border border-[#e5edf5] bg-white p-4" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)' }}>
          <div className="flex items-start gap-3">
            {/* Preview */}
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-[#f6f9fc]">
              {preview ? (
                <img
                  src={preview}
                  alt="X-ray preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-[#64748d]" strokeWidth={1.5} />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-[15px] font-medium text-[#061b31]">
                  {fileName}
                </p>
                {(stage === 'done' || stage === 'error') && (
                  <button
                    onClick={reset}
                    className="ml-2 flex-shrink-0 rounded-[4px] p-1 text-[#64748d] transition-colors hover:bg-[#f6f9fc] hover:text-[#061b31]"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-[14px] text-[#64748d]">
                {formatFileSize(fileSize)}
              </p>

              {/* Progress bar */}
              {isUploading && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e5edf5]">
                    <div
                      className="h-full rounded-full bg-[#533afd] transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stage label */}
              <div className="mt-2 flex items-center gap-1.5">
                {(isUploading || stage === 'validating' || stage === 'generating-thumbnail') && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#533afd]" strokeWidth={2} />
                )}
                {stage === 'done' && (
                  <CheckCircle className="h-3.5 w-3.5 text-[#30B130]" strokeWidth={2} />
                )}
                {stage === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 text-[#DF1B41]" strokeWidth={2} />
                )}
                <span
                  className={`text-[14px] ${
                    stage === 'done'
                      ? 'text-[#30B130]'
                      : stage === 'error'
                        ? 'text-[#DF1B41]'
                        : 'text-[#64748d]'
                  }`}
                >
                  {stageLabel[stage]}
                </span>
              </div>

              {/* Error message + retry */}
              {stage === 'error' && error && (
                <div className="mt-2">
                  <p className="text-[14px] text-[#DF1B41]">{error}</p>
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

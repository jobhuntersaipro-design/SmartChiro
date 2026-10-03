'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Upload, X, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { validateXrayFile, generateThumbnail } from '@/lib/xray-validation'
import { uploadXray } from '@/lib/xray-upload-client'

type UploadStage = 'queued' | 'validating' | 'generating-thumbnail' | 'uploading' | 'done' | 'error'

interface UploadItem {
  id: string
  file: File
  preview: string
  stage: UploadStage
  progress: number
  error: string | null
  xrayId: string | null
}

interface XrayUploadProps {
  patientId: string
  onUploadComplete?: (xrayId: string) => void
  /** Accept several files at once (default). The viewer's slot picker takes one. */
  multiple?: boolean
}

const STAGE_LABEL: Record<UploadStage, string> = {
  queued: 'Waiting…',
  validating: 'Checking file…',
  'generating-thumbnail': 'Preparing preview…',
  uploading: 'Uploading…',
  done: 'Uploaded',
  error: 'Upload failed',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Drop or pick X-ray images (several at once) for a patient. Files upload one
 * after another, each with its own progress; the title defaults to the file name.
 */
export function XrayUpload({ patientId, onUploadComplete, multiple = true }: XrayUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queueRef = useRef<UploadItem[]>([])
  const runningRef = useRef(false)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })
  // Free the object-URL previews when the uploader goes away.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), [])

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      try {
        update(item.id, { stage: 'validating', error: null, progress: 0 })
        const dimensions = await validateXrayFile(item.file)
        update(item.id, { stage: 'generating-thumbnail' })
        const thumbnail = await generateThumbnail(item.file)
        update(item.id, { stage: 'uploading' })
        const { xrayId } = await uploadXray({
          file: item.file,
          thumbnail,
          width: dimensions.width,
          height: dimensions.height,
          patientId,
          onProgress: (progress) => update(item.id, { progress }),
        })
        update(item.id, { stage: 'done', progress: 100, xrayId })
        onUploadComplete?.(xrayId)
      } catch (err) {
        update(item.id, { stage: 'error', error: err instanceof Error ? err.message : 'Upload failed.' })
      }
    },
    [patientId, onUploadComplete, update]
  )

  // One upload at a time, in the order files were added.
  const pump = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      for (let next = queueRef.current.shift(); next; next = queueRef.current.shift()) {
        await uploadOne(next)
      }
    } finally {
      runningRef.current = false
    }
  }, [uploadOne])

  const addFiles = useCallback(
    (files: FileList | null) => {
      const picked = Array.from(files ?? []).slice(0, multiple ? undefined : 1)
      if (picked.length === 0) return
      const added: UploadItem[] = picked.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        stage: 'queued',
        progress: 0,
        error: null,
        xrayId: null,
      }))
      setItems((prev) => [...prev, ...added])
      queueRef.current.push(...added)
      if (fileInputRef.current) fileInputRef.current.value = ''
      void pump()
    },
    [multiple, pump]
  )

  const remove = useCallback((item: UploadItem) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== item.id)
    URL.revokeObjectURL(item.preview)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
  }, [])

  const retry = useCallback(
    (item: UploadItem) => {
      update(item.id, { stage: 'queued', error: null, progress: 0 })
      queueRef.current.push(item)
      void pump()
    },
    [update, pump]
  )

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      prev.filter((i) => i.stage === 'done').forEach((i) => URL.revokeObjectURL(i.preview))
      return prev.filter((i) => i.stage !== 'done')
    })
  }, [])

  const doneCount = items.filter((i) => i.stage === 'done').length
  const failedCount = items.filter((i) => i.stage === 'error').length
  const activeCount = items.length - doneCount - failedCount
  // Single mode (slot picker): the drop zone gives way to the one upload.
  const showDropZone = multiple || items.length === 0

  return (
    <div className="w-full">
      {showDropZone && (
        <label
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            addFiles(e.dataTransfer.files)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          className={`flex cursor-pointer items-center gap-3 rounded-panel border-2 border-dashed px-4 py-3 transition-colors hover:border-border-strong ${
            dragOver ? 'border-brand bg-brand-subtle' : 'border-border bg-surface-muted'
          }`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle">
            <Upload className="size-4.5 text-brand" strokeWidth={1.5} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-foreground">
              {multiple ? 'Drop X-ray images here, or click to choose' : 'Drop an X-ray image here, or click to choose'}
            </span>
            <span className="block text-[13px] text-fg-secondary">
              JPEG or PNG, up to 300 MB{multiple ? ' each. Select several at once.' : '.'}
            </span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={(e) => addFiles(e.target.files)}
            className="sr-only"
            aria-label={multiple ? 'Choose X-ray images' : 'Choose an X-ray image'}
          />
        </label>
      )}

      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.length > 1 && (
            <div className="flex items-center justify-between text-[13px] text-fg-secondary">
              <span aria-live="polite">
                {activeCount > 0
                  ? `Uploading ${doneCount + failedCount + 1} of ${items.length}…`
                  : `${doneCount} of ${items.length} uploaded${failedCount ? `, ${failedCount} failed` : ''}`}
              </span>
              {doneCount > 0 && activeCount === 0 && (
                <button type="button" onClick={clearFinished} className="text-brand hover:underline">
                  Clear uploaded
                </button>
              )}
            </div>
          )}
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} patientId={patientId} onRemove={remove} onRetry={retry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function UploadRow({
  item,
  patientId,
  onRemove,
  onRetry,
}: {
  item: UploadItem
  patientId: string
  onRemove: (item: UploadItem) => void
  onRetry: (item: UploadItem) => void
}) {
  const busy = item.stage === 'validating' || item.stage === 'generating-thumbnail' || item.stage === 'uploading'
  return (
    <li className="flex items-start gap-3 rounded-panel border border-border bg-surface p-3 shadow-(--shadow-card)">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted">
        {item.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview
          <img src={item.preview} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-fg-secondary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[14px] font-medium text-foreground" title={item.file.name}>
            {item.file.name}
          </p>
          {!busy && (
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item.file.name}`}
              className="shrink-0 rounded-md p-1 text-fg-secondary transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
        <p className="text-[12px] text-fg-muted">{formatFileSize(item.file.size)}</p>

        {item.stage === 'uploading' && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${item.progress}%` }} />
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span
            className={`flex items-center gap-1.5 ${
              item.stage === 'done' ? 'text-success' : item.stage === 'error' ? 'text-danger' : 'text-fg-secondary'
            }`}
          >
            {busy && <Loader2 className="size-3.5 animate-spin text-brand" strokeWidth={2} />}
            {item.stage === 'done' && <CheckCircle className="size-3.5" strokeWidth={2} />}
            {item.stage === 'error' && <AlertCircle className="size-3.5" strokeWidth={2} />}
            {STAGE_LABEL[item.stage]}
          </span>
          {item.stage === 'done' && item.xrayId && (
            <Link
              href={`/dashboard/xrays/${patientId}/${item.xrayId}/annotate`}
              target="_blank"
              className="font-medium text-brand hover:underline"
            >
              Annotate now →
            </Link>
          )}
          {item.stage === 'error' && (
            <button type="button" onClick={() => onRetry(item)} className="flex items-center gap-1 font-medium text-brand hover:underline">
              <RotateCcw className="size-3.5" /> Try again
            </button>
          )}
        </div>
        {item.stage === 'error' && item.error && <p className="mt-1 text-[13px] text-danger">{item.error}</p>}
      </div>
    </li>
  )
}

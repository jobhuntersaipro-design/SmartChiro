'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Calendar, ScanLine, MoreVertical, Pencil, Trash2, FileText, Archive, RotateCcw } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export interface XrayCardData {
  id: string
  title: string | null
  bodyRegion: string | null
  viewType?: string | null
  status: 'UPLOADING' | 'READY' | 'ARCHIVED'
  thumbnailUrl?: string | null
  annotationCount?: number
  hasNotes?: boolean
  notePreview?: string | null
  createdAt: string
}

interface XrayCardProps {
  patientId: string
  xray: XrayCardData
  selected: boolean
  batchMode: boolean
  onToggleSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onOpenNotes: (id: string) => void
  onDelete: (id: string) => void
  onRestore?: (id: string) => void
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function XrayCard({
  patientId, xray, selected, batchMode, onToggleSelect, onRename, onOpenNotes, onDelete, onRestore,
}: XrayCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(xray.title ?? '')
  // Optimistic title — show the user's new name immediately while the PATCH
  // is in flight + parent refetch round-trips. Cleared back to server truth
  // the moment the parent passes a fresh `xray.title` prop in.
  //
  // Uses React's "previous prop value as state" pattern from
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  // — comparing the incoming prop against state-stored prev-prop is the
  // recommended way to reset derived state on prop change without a
  // useEffect cascade or render-time ref access.
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null)
  const [lastServerTitle, setLastServerTitle] = useState(xray.title)
  if (lastServerTitle !== xray.title) {
    setLastServerTitle(xray.title)
    setOptimisticTitle(null)
  }
  const displayTitle = optimisticTitle ?? xray.title
  const archived = xray.status === 'ARCHIVED'

  async function commitRename() {
    const trimmed = draft.trim()
    setEditing(false)
    if (trimmed === (xray.title ?? '')) return
    setOptimisticTitle(trimmed || null)
    await onRename(xray.id, trimmed)
  }

  function handleClick(e: React.MouseEvent) {
    if (batchMode) {
      e.preventDefault()
      onToggleSelect(xray.id)
    }
  }

  return (
    <div
      className="group relative rounded-panel border bg-white overflow-hidden transition-colors"
      style={{ borderColor: selected ? '#7747ff' : '#e9e9e9' }}
    >
      {batchMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(xray.id)}
          className="absolute top-2 left-2 z-10 h-4 w-4 rounded-[3px] accent-brand"
          aria-label={`Select ${xray.title ?? 'X-ray'}`}
        />
      )}
      <a
        href={`/dashboard/xrays/${patientId}/${xray.id}/annotate`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block"
      >
        <div className="h-40 bg-canvas flex items-center justify-center overflow-hidden relative">
          {xray.thumbnailUrl ? (
            <Image
              src={xray.thumbnailUrl}
              alt={xray.title ?? 'X-ray'}
              width={320}
              height={160}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full h-full object-contain"
            />
          ) : (
            <ScanLine className="w-10 h-10 text-fg-secondary opacity-40" />
          )}
          {archived && (
            <span className="absolute top-2 left-2 rounded-md bg-fg-muted px-2 py-0.5 text-[10px] text-white">
              Archived
            </span>
          )}
          {xray.status === 'UPLOADING' && (
            <span className="absolute top-2 left-2 rounded-md bg-info px-2 py-0.5 text-[10px] text-white">
              Uploading…
            </span>
          )}
          {(xray.annotationCount ?? 0) > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">
              {xray.annotationCount} annot.
            </span>
          )}
        </div>
      </a>

      <div className="px-3 py-2.5">
        {editing ? (
          <input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(xray.title ?? ''); setEditing(false) } }}
            className="w-full rounded-md border border-brand px-2 py-1 text-[14px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-[14px] font-medium text-foreground truncate w-full hover:underline"
          >
            {displayTitle || 'Untitled'}
          </button>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {xray.bodyRegion && (
            <span className="rounded-full px-2 py-0.5 text-[11px] bg-surface-muted text-fg-secondary">
              {xray.bodyRegion.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-fg-muted">
            <Calendar className="w-3 h-3" />
            {formatDate(xray.createdAt)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenNotes(xray.id)}
          className="mt-1.5 block w-full text-left text-[12px] text-fg-secondary truncate hover:text-brand"
        >
          {xray.notePreview ? xray.notePreview : <span className="text-fg-disabled">Add notes…</span>}
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="absolute top-2 right-2 z-10 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-control bg-white/90 hover:bg-white text-fg-secondary"
          aria-label="More actions"
        >
          <MoreVertical className="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenNotes(xray.id)}>
            <FileText className="mr-2 h-3.5 w-3.5" /> Edit notes
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onSelect={() => onRestore?.(xray.id)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onDelete(xray.id)} className="text-danger">
              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              <Trash2 className="ml-1 h-3 w-3 opacity-0" />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

'use client'

import { useState } from 'react'
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
  const archived = xray.status === 'ARCHIVED'

  async function commitRename() {
    setEditing(false)
    if (draft.trim() === (xray.title ?? '')) return
    await onRename(xray.id, draft.trim())
  }

  function handleClick(e: React.MouseEvent) {
    if (batchMode) {
      e.preventDefault()
      onToggleSelect(xray.id)
    }
  }

  return (
    <div
      className="group relative rounded-[6px] border bg-white overflow-hidden transition-colors"
      style={{ borderColor: selected ? '#533afd' : '#e5edf5' }}
    >
      {batchMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(xray.id)}
          className="absolute top-2 left-2 z-10 h-4 w-4 rounded-[3px] accent-[#533afd]"
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
        <div className="h-[160px] bg-[#1A1F36] flex items-center justify-center overflow-hidden relative">
          {xray.thumbnailUrl ? (
            <img src={xray.thumbnailUrl} alt={xray.title ?? 'X-ray'} className="w-full h-full object-contain" />
          ) : (
            <ScanLine className="w-10 h-10 text-[#4a5568] opacity-40" />
          )}
          {archived && (
            <span className="absolute top-2 left-2 rounded-[4px] bg-[#697386] px-2 py-0.5 text-[10px] text-white">
              Archived
            </span>
          )}
          {xray.status === 'UPLOADING' && (
            <span className="absolute top-2 left-2 rounded-[4px] bg-[#0570DE] px-2 py-0.5 text-[10px] text-white">
              Uploading…
            </span>
          )}
          {(xray.annotationCount ?? 0) > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-[#533afd] px-2 py-0.5 text-[10px] text-white">
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
            className="w-full rounded-[4px] border border-[#533afd] px-2 py-1 text-[14px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-[14px] font-medium text-[#061b31] truncate w-full hover:underline"
          >
            {xray.title || 'Untitled'}
          </button>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {xray.bodyRegion && (
            <span className="rounded-full px-2 py-0.5 text-[11px] bg-[#f6f9fc] text-[#64748d]">
              {xray.bodyRegion.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-[#97a3b6]">
            <Calendar className="w-3 h-3" />
            {formatDate(xray.createdAt)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenNotes(xray.id)}
          className="mt-1.5 block w-full text-left text-[12px] text-[#64748d] truncate hover:text-[#533afd]"
        >
          {xray.notePreview ? xray.notePreview : <span className="text-[#A3ACB9]">Add notes…</span>}
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="absolute top-2 right-2 z-10 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-[4px] bg-white/90 hover:bg-white text-[#425466]"
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
            <DropdownMenuItem onSelect={() => onDelete(xray.id)} className="text-[#DF1B41]">
              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              <Trash2 className="ml-1 h-3 w-3 opacity-0" />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { XrayUpload } from '@/components/xray/XrayUpload'
import { XrayCard, type XrayCardData } from '@/components/xray/XrayCard'
import { XrayFilterBar, type FilterState } from '@/components/xray/XrayFilterBar'
import { XrayBatchToolbar } from '@/components/xray/XrayBatchToolbar'
import { DeleteXrayDialog } from '@/components/xray/DeleteXrayDialog'
import { NotesDrawer } from '@/components/annotation/NotesDrawer'

interface PatientXraysTabProps {
  patientId: string
  xrays: XrayCardData[]
  onRefresh: () => void
}

const DEFAULT_FILTERS: FilterState = {
  bodyRegions: [], viewTypes: [], date: 'all', sort: 'newest', showArchived: false, batchMode: false,
}

export function PatientXraysTab({ patientId, xrays, onRefresh }: PatientXraysTabProps) {
  const [showUpload, setShowUpload] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notesXrayId, setNotesXrayId] = useState<string | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])

  function handleFiltersChange(next: FilterState) {
    if (!next.batchMode && filters.batchMode) setSelected(new Set())
    setFilters(next)
  }

  const filtered = useMemo(() => {
    const cutoffMs = filters.date !== 'all'
      ? new Date().setHours(0, 0, 0, 0) - (filters.date === '7d' ? 7 : 30) * 86400 * 1000
      : null
    const list = xrays.filter((x) => {
      if (!filters.showArchived && x.status === 'ARCHIVED') return false
      if (filters.bodyRegions.length && (!x.bodyRegion || !filters.bodyRegions.includes(x.bodyRegion as never))) return false
      if (filters.viewTypes.length && (!x.viewType || !filters.viewTypes.includes(x.viewType as never))) return false
      if (cutoffMs !== null && new Date(x.createdAt).getTime() < cutoffMs) return false
      return true
    })
    const sorted = [...list]
    if (filters.sort === 'newest') sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (filters.sort === 'oldest') sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (filters.sort === 'title') sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return sorted
  }, [xrays, filters])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleRename(id: string, title: string) {
    await fetch(`/api/xrays/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    onRefresh()
  }

  async function handleRestore(id: string) {
    await fetch(`/api/xrays/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    })
    onRefresh()
  }

  function handleNotesOpen(id: string) {
    setNotesXrayId(id)
  }

  function handleDelete(id: string) {
    setDeleteIds([id])
  }

  function handleBatchDelete() {
    setDeleteIds(Array.from(selected))
  }

  const titleMap = Object.fromEntries(xrays.map((x) => [x.id, x.title ?? 'Untitled']))
  const notesXray = notesXrayId ? xrays.find((x) => x.id === notesXrayId) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <XrayFilterBar state={filters} onChange={handleFiltersChange} count={filtered.length} />
        <Button
          onClick={() => setShowUpload((v) => !v)}
          className="ml-3 h-8 rounded-[4px] bg-[#533afd] text-white text-[13px] font-medium hover:bg-[#4434d4] px-3"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Upload X-Ray
        </Button>
      </div>

      {showUpload && (
        <div className="mb-4 rounded-[6px] border border-[#e5edf5] bg-white p-4">
          <XrayUpload patientId={patientId} onUploadComplete={() => { setShowUpload(false); onRefresh() }} />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[14px] text-[#64748d]">No X-rays match these filters.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((x) => (
            <XrayCard
              key={x.id}
              patientId={patientId}
              xray={x}
              selected={selected.has(x.id)}
              batchMode={filters.batchMode}
              onToggleSelect={toggleSelect}
              onRename={handleRename}
              onOpenNotes={handleNotesOpen}
              onDelete={handleDelete}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}

      {filters.batchMode && (
        <XrayBatchToolbar
          selectedCount={selected.size}
          onDelete={handleBatchDelete}
          onCancel={() => handleFiltersChange({ ...filters, batchMode: false })}
        />
      )}

      <DeleteXrayDialog
        open={deleteIds.length > 0}
        onOpenChange={(o) => { if (!o) setDeleteIds([]) }}
        xrayIds={deleteIds}
        xrayTitles={deleteIds.map((id) => titleMap[id] ?? 'Untitled')}
        onConfirmed={() => { setDeleteIds([]); setSelected(new Set()); onRefresh() }}
      />

      <NotesDrawer
        xrayId={notesXrayId}
        xrayTitle={notesXray?.title ?? null}
        open={notesXrayId !== null}
        onOpenChange={(o) => { if (!o) setNotesXrayId(null) }}
      />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft } from 'lucide-react'

export interface SeriesXray {
  id: string
  title: string | null
  bodyRegion: string | null
  thumbnailUrl: string | null
  createdAt: string
}

interface SeriesStripProps {
  patientId: string
  currentXrayId: string
  xrays: SeriesXray[]
  onBeforeNavigate?: () => void   // e.g. flush autosave
  scrollDirection?: 1 | -1 | null // when set non-null, advances 1 step in that direction (then resets in parent)
  onNavigate?: (xrayId: string) => void
}

export function SeriesStrip({ patientId, currentXrayId, xrays, onBeforeNavigate, scrollDirection, onNavigate }: SeriesStripProps) {
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()

  // Imperatively advance when scrollDirection ticks.
  useEffect(() => {
    if (scrollDirection == null) return
    const idx = xrays.findIndex((x) => x.id === currentXrayId)
    if (idx === -1) return
    const next = xrays[idx + scrollDirection]
    if (!next) return
    onBeforeNavigate?.()
    onNavigate?.(next.id)
    router.push(`/dashboard/xrays/${patientId}/${next.id}/annotate`)
  }, [scrollDirection, xrays, currentXrayId, patientId, onBeforeNavigate, onNavigate, router])

  const width = collapsed ? 18 : 64

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-10 flex flex-col"
      style={{ width, backgroundColor: '#0a1220', borderLeft: '1px solid #1c2738', transition: 'width 150ms ease' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="h-7 flex items-center justify-center text-[#cdd5e2] hover:bg-white/5"
        aria-label={collapsed ? 'Expand series' : 'Collapse series'}
      >
        {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {!collapsed && (
        <ul className="flex-1 overflow-y-auto py-2 space-y-2">
          {xrays.map((x) => {
            const active = x.id === currentXrayId
            return (
              <li key={x.id} className="px-1 relative">
                {active && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-[#533afd]" />}
                <Link
                  href={`/dashboard/xrays/${patientId}/${x.id}/annotate`}
                  onClick={() => onBeforeNavigate?.()}
                  className="block rounded-[4px] overflow-hidden border"
                  style={{ borderColor: active ? '#533afd' : 'transparent' }}
                  title={x.title ?? 'X-ray'}
                >
                  <div className="w-[56px] h-[56px] bg-[#1A1F36]">
                    {x.thumbnailUrl ? (
                      <img src={x.thumbnailUrl} alt={x.title ?? ''} className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <p className="text-[10px] text-[#cdd5e2] mt-0.5 truncate w-[56px]">
                    {x.bodyRegion ? x.bodyRegion.split('_')[0].slice(0, 4) : '—'} ·
                    {' '}{new Date(x.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

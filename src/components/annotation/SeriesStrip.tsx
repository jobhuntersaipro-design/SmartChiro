'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react'

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
  onBeforeNavigate?: () => void
  scrollDirection?: 1 | -1 | null
  onNavigate?: (xrayId: string) => void
}

export function SeriesStrip({
  patientId, currentXrayId, xrays, onBeforeNavigate, scrollDirection, onNavigate,
}: SeriesStripProps) {
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()

  const idx = xrays.findIndex((x) => x.id === currentXrayId)
  const prev = idx > 0 ? xrays[idx - 1] : null
  const next = idx >= 0 && idx < xrays.length - 1 ? xrays[idx + 1] : null

  function navigateTo(xrayId: string) {
    onBeforeNavigate?.()
    onNavigate?.(xrayId)
    router.push(`/dashboard/xrays/${patientId}/${xrayId}/annotate`)
  }

  useEffect(() => {
    if (scrollDirection == null) return
    const target = scrollDirection > 0 ? next : prev
    if (!target) return
    navigateTo(target.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollDirection])

  const width = collapsed ? 22 : 96
  const onlyOne = xrays.length <= 1

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-10 flex flex-col"
      style={{
        width,
        backgroundColor: '#0a1220',
        borderLeft: '1px solid #1c2738',
        transition: 'width 150ms ease',
      }}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="h-8 flex items-center justify-center text-[#cdd5e2] hover:bg-white/5"
        aria-label={collapsed ? 'Expand series' : 'Collapse series'}
      >
        {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {!collapsed && (
        <>
          {/* Counter + prev/next */}
          <div className="flex flex-col items-center gap-1 border-b border-[#1c2738] py-2">
            <span className="text-[10px] uppercase tracking-wide text-[#697386]">
              {idx >= 0 ? `${idx + 1} of ${xrays.length}` : `${xrays.length}`}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => prev && navigateTo(prev.id)}
                disabled={!prev}
                className="rounded-[4px] p-1 text-[#cdd5e2] enabled:hover:bg-white/5 disabled:opacity-30"
                title="Previous X-ray (scroll up)"
                aria-label="Previous X-ray"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => next && navigateTo(next.id)}
                disabled={!next}
                className="rounded-[4px] p-1 text-[#cdd5e2] enabled:hover:bg-white/5 disabled:opacity-30"
                title="Next X-ray (scroll down)"
                aria-label="Next X-ray"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          {onlyOne ? (
            <div className="flex-1 flex items-center justify-center px-2 text-center">
              <p className="text-[10px] leading-tight text-[#697386]">
                No other X-rays for this patient yet
              </p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto py-2 space-y-2">
              {xrays.map((x) => {
                const active = x.id === currentXrayId
                return (
                  <li key={x.id} className="px-2 relative">
                    {active && (
                      <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-[#533afd]" />
                    )}
                    <Link
                      href={`/dashboard/xrays/${patientId}/${x.id}/annotate`}
                      onClick={() => onBeforeNavigate?.()}
                      className="block rounded-[4px] overflow-hidden border"
                      style={{ borderColor: active ? '#533afd' : 'transparent' }}
                      title={x.title ?? 'X-ray'}
                    >
                      <div className="w-[80px] h-[80px] bg-[#1A1F36]">
                        {x.thumbnailUrl ? (
                          <img
                            src={x.thumbnailUrl}
                            alt={x.title ?? ''}
                            className="w-full h-full object-contain"
                          />
                        ) : null}
                      </div>
                      <p className="text-[10px] text-[#cdd5e2] mt-0.5 truncate w-[80px] px-0.5">
                        {x.bodyRegion ? x.bodyRegion.split('_')[0].slice(0, 6) : '—'} ·{' '}
                        {new Date(x.createdAt).toLocaleDateString('en-MY', {
                          day: '2-digit', month: 'short',
                        })}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </aside>
  )
}

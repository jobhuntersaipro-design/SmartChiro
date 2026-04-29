'use client'

import type { BodyRegion, ViewType } from '@prisma/client'

export type DateFilter = 'all' | '7d' | '30d'
export type SortBy = 'newest' | 'oldest' | 'title'

export interface FilterState {
  bodyRegions: BodyRegion[]
  viewTypes: ViewType[]
  date: DateFilter
  sort: SortBy
  showArchived: boolean
  batchMode: boolean
}

interface XrayFilterBarProps {
  state: FilterState
  onChange: (next: FilterState) => void
  count: number
}

const BODY_REGIONS: BodyRegion[] = ['CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER']
const VIEW_TYPES: ViewType[] = ['AP', 'LATERAL', 'OBLIQUE', 'PA', 'OTHER']

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[12px] transition-colors"
      style={{
        borderColor: active ? '#533afd' : '#e5edf5',
        backgroundColor: active ? '#ededfc' : '#FFFFFF',
        color: active ? '#533afd' : '#425466',
      }}
    >
      {children}
    </button>
  )
}

export function XrayFilterBar({ state, onChange, count }: XrayFilterBarProps) {
  function toggleRegion(r: BodyRegion) {
    const has = state.bodyRegions.includes(r)
    onChange({ ...state, bodyRegions: has ? state.bodyRegions.filter((x) => x !== r) : [...state.bodyRegions, r] })
  }
  function toggleView(v: ViewType) {
    const has = state.viewTypes.includes(v)
    onChange({ ...state, viewTypes: has ? state.viewTypes.filter((x) => x !== v) : [...state.viewTypes, v] })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-[#061b31]">X-Rays ({count})</span>
      <div className="flex flex-wrap gap-1.5 ml-2">
        {BODY_REGIONS.map((r) => (
          <Chip key={r} active={state.bodyRegions.includes(r)} onClick={() => toggleRegion(r)}>
            {r.replace('_', ' ').toLowerCase()}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VIEW_TYPES.map((v) => (
          <Chip key={v} active={state.viewTypes.includes(v)} onClick={() => toggleView(v)}>{v.toLowerCase()}</Chip>
        ))}
      </div>
      <Chip active={state.date === '7d'} onClick={() => onChange({ ...state, date: state.date === '7d' ? 'all' : '7d' })}>last 7d</Chip>
      <Chip active={state.date === '30d'} onClick={() => onChange({ ...state, date: state.date === '30d' ? 'all' : '30d' })}>last 30d</Chip>
      <Chip active={state.showArchived} onClick={() => onChange({ ...state, showArchived: !state.showArchived })}>archived</Chip>
      <div className="ml-auto flex items-center gap-2">
        <select
          value={state.sort}
          onChange={(e) => onChange({ ...state, sort: e.target.value as SortBy })}
          className="rounded-[4px] border border-[#e5edf5] bg-white px-2 py-1 text-[12px] text-[#425466]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A-Z</option>
        </select>
        <Chip active={state.batchMode} onClick={() => onChange({ ...state, batchMode: !state.batchMode })}>
          {state.batchMode ? 'Cancel select' : 'Select'}
        </Chip>
      </div>
    </div>
  )
}

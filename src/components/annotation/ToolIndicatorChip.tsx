'use client'

import { Hand, MousePointer2, Dot, Minus, Spline, Type, TriangleRight, Scaling, ArrowRight, Ruler, Settings2 } from 'lucide-react'
import type { ToolId } from '@/types/annotation'

const TOOL_META: Record<ToolId, { label: string; icon: React.ReactNode }> = {
  hand:       { label: 'Pan',        icon: <Hand size={14} strokeWidth={1.5} /> },
  select:     { label: 'Select',     icon: <MousePointer2 size={14} strokeWidth={1.5} /> },
  point:      { label: 'Point',      icon: <Dot size={20} strokeWidth={2.5} /> },
  line:       { label: 'Line',       icon: <Minus size={14} strokeWidth={1.5} /> },
  polyline:   { label: 'Polyline',   icon: <Spline size={14} strokeWidth={1.5} /> },
  ruler:      { label: 'Ruler',      icon: <Ruler size={14} strokeWidth={1.5} /> },
  angle:      { label: 'Angle',      icon: <TriangleRight size={14} strokeWidth={1.5} /> },
  cobb_angle: { label: 'Cobb angle', icon: <Scaling size={14} strokeWidth={1.5} /> },
  arrow:      { label: 'Arrow',      icon: <ArrowRight size={14} strokeWidth={1.5} /> },
  text:       { label: 'Text',       icon: <Type size={14} strokeWidth={1.5} /> },
  calibrate:  { label: 'Calibrate',  icon: <Settings2 size={14} strokeWidth={1.5} /> },
}

interface ToolIndicatorChipProps {
  activeTool: ToolId
}

export function ToolIndicatorChip({ activeTool }: ToolIndicatorChipProps) {
  const meta = TOOL_META[activeTool]
  if (!meta) return null
  return (
    <div
      className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        backgroundColor: 'rgba(83, 58, 253, 0.92)',
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 500,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}
    >
      {meta.icon}
      <span>{meta.label}</span>
    </div>
  )
}

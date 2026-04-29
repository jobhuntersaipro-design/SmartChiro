'use client'

import {
  Hand, Minus, Pencil, Type, Ruler, TriangleRight, Eraser, Scaling,
} from 'lucide-react'
import type { ToolId } from '@/types/annotation'

const TOOL_META: Record<ToolId, { label: string; icon: React.ReactNode }> = {
  hand:       { label: 'Pan',        icon: <Hand size={14} strokeWidth={1.5} /> },
  freehand:   { label: 'Freehand',   icon: <Pencil size={14} strokeWidth={1.5} /> },
  line:       { label: 'Line',       icon: <Minus size={14} strokeWidth={1.5} /> },
  text:       { label: 'Text',       icon: <Type size={14} strokeWidth={1.5} /> },
  eraser:     { label: 'Eraser',     icon: <Eraser size={14} strokeWidth={1.5} /> },
  ruler:      { label: 'Ruler',      icon: <Ruler size={14} strokeWidth={1.5} /> },
  angle:      { label: 'Angle',      icon: <TriangleRight size={14} strokeWidth={1.5} /> },
  cobb_angle: { label: 'Cobb Angle', icon: <Scaling size={14} strokeWidth={1.5} /> },
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

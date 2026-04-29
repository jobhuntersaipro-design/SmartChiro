'use client'

import { Button } from '@/components/ui/button'

interface XrayBatchToolbarProps {
  selectedCount: number
  onDelete: () => void
  onCancel: () => void
}

export function XrayBatchToolbar({ selectedCount, onDelete, onCancel }: XrayBatchToolbarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="sticky bottom-0 z-20 mt-4 rounded-[6px] border border-[#e5edf5] bg-white p-3 flex items-center gap-3 shadow-[0_4px_12px_rgba(18,42,66,.06)]">
      <span className="text-[13px] font-medium text-[#061b31]">{selectedCount} selected</span>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onDelete} className="bg-[#DF1B41] hover:bg-[#c4153a] text-white rounded-[4px]">
          Archive
        </Button>
      </div>
    </div>
  )
}

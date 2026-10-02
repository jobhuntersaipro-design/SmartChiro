'use client'

import { Button } from '@/components/ui/button'

interface XrayBatchToolbarProps {
  selectedCount: number
  onDelete: () => void
  onCancel: () => void
  /** Opens the two selected films side by side; enabled at exactly two. */
  onCompare?: () => void
}

export function XrayBatchToolbar({ selectedCount, onDelete, onCancel, onCompare }: XrayBatchToolbarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="sticky bottom-0 z-20 mt-4 rounded-panel border border-border bg-white p-3 flex items-center gap-3 shadow-(--shadow-md)">
      <span className="text-[13px] font-medium text-foreground">{selectedCount} selected</span>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {onCompare && (
          <Button
            variant="outline"
            onClick={onCompare}
            disabled={selectedCount !== 2}
            title={selectedCount === 2 ? 'Compare side by side' : 'Select exactly two X-rays to compare'}
            className="rounded-md"
          >
            Compare
          </Button>
        )}
        <Button onClick={onDelete} className="bg-danger hover:bg-danger/90 text-white rounded-md">
          Archive
        </Button>
      </div>
    </div>
  )
}

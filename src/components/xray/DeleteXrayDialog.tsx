'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteXrayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  xrayIds: string[]
  xrayTitles: string[]   // parallel to xrayIds
  onConfirmed: () => void
}

export function DeleteXrayDialog({ open, onOpenChange, xrayIds, xrayTitles, onConfirmed }: DeleteXrayDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true); setError(null)
    try {
      const results = await Promise.all(
        xrayIds.map((id) => fetch(`/api/xrays/${id}`, { method: 'DELETE' })),
      )
      if (results.some((r) => !r.ok)) throw new Error('One or more deletes failed.')
      onConfirmed()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium text-[#061b31]">
            Archive {xrayIds.length === 1 ? 'this X-ray' : `${xrayIds.length} X-rays`}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-[14px] text-[#425466]">
          Annotations will be preserved but the X-ray will be hidden from the patient&apos;s gallery.
          You can restore archived X-rays later from the &quot;Show archived&quot; toggle.
        </p>
        {xrayTitles.length > 0 && (
          <ul className="mt-2 max-h-[160px] overflow-y-auto rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] p-3 text-[13px] text-[#425466]">
            {xrayTitles.map((t, i) => <li key={i}>• {t || 'Untitled'}</li>)}
          </ul>
        )}
        {error && <p className="mt-2 text-[12px] text-[#DF1B41]">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className="bg-[#DF1B41] hover:bg-[#c4153a] text-white rounded-[4px]"
          >
            {busy ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

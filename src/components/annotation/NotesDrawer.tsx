'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useXrayNotes } from '@/hooks/useXrayNotes'

interface NotesDrawerProps {
  xrayId: string | null
  xrayTitle?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotesDrawer({ xrayId, xrayTitle, open, onOpenChange }: NotesDrawerProps) {
  const { current, history, loading, error, saveNote } = useXrayNotes(open ? xrayId : null)
  const [draft, setDraft] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    setDraft(current?.bodyMd ?? '')
  }, [current?.id])

  const dirty = draft !== (current?.bodyMd ?? '')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-[#e5edf5]">
          <SheetTitle className="text-[15px] font-medium text-[#061b31]">
            Notes — {xrayTitle ?? 'X-ray'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes about this X-ray…"
            maxLength={10_000}
            className="w-full h-[240px] resize-none rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] p-3 text-[14px] text-[#0a2540] outline-none focus:border-[#533afd]"
          />
          {draft.length > 9_000 && (
            <p className="mt-1 text-[11px] text-[#697386]">{draft.length} / 10000</p>
          )}
          {error && <p className="mt-2 text-[12px] text-[#DF1B41]">{error}</p>}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-[13px] font-medium text-[#533afd]"
            >
              {showHistory ? 'Hide history' : `Show history (${history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-[4px] border border-[#e5edf5] bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wide text-[#697386]">
                      {h.author.name ?? h.author.email} · {new Date(h.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[13px] whitespace-pre-wrap text-[#425466]">
                      {h.bodyMd || <em className="text-[#A3ACB9]">(cleared)</em>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-[#e5edf5] px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={!dirty || loading}
            onClick={() => saveNote(draft)}
            className="bg-[#533afd] text-white hover:bg-[#4434d4] rounded-[4px]"
          >
            {loading ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

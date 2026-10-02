'use client'

import { useRef, useState } from 'react'
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

  // Reset the draft to the canonical body whenever the loaded note changes
  // (different x-ray, or a new revision). Done during render with a ref to
  // detect the id change — React 19's recommended pattern for "adjust state
  // when a prop changes", instead of an effect that would cascade renders.
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const lastNoteIdRef = useRef<string | null | undefined>(current?.id)
  if (current?.id !== lastNoteIdRef.current) {
    lastNoteIdRef.current = current?.id
    setDraft(current?.bodyMd ?? '')
  }

  const dirty = draft !== (current?.bodyMd ?? '')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-105 flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="text-[15px] font-medium text-foreground">
            Notes — {xrayTitle ?? 'X-ray'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes about this X-ray…"
            maxLength={10_000}
            className="w-full h-60 resize-none rounded-md border border-border bg-surface-muted p-3 text-[14px] text-foreground outline-none focus:border-brand"
          />
          {draft.length > 9_000 && (
            <p className="mt-1 text-[11px] text-fg-muted">{draft.length} / 10000</p>
          )}
          {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-[13px] font-medium text-brand"
            >
              {showHistory ? 'Hide history' : `Show history (${history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-md border border-border bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wide text-fg-muted">
                      {h.author.name ?? h.author.email} · {new Date(h.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[13px] whitespace-pre-wrap text-fg-secondary">
                      {h.bodyMd || <em className="text-fg-disabled">(cleared)</em>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={!dirty || loading}
            onClick={() => saveNote(draft)}
            className="bg-primary text-white hover:bg-primary/90 rounded-md"
          >
            {loading ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

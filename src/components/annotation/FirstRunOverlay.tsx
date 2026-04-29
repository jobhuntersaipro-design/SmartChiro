'use client'

import { useEffect, useState } from 'react'
import { MousePointer2, Move, Sun, ScrollText, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

const KEY = 'smartchiro:viewer-firstrun-v1'

export function FirstRunOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(KEY)) return
    setOpen(true)
  }, [])

  function dismiss() {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, '1')
    setOpen(false)
  }

  if (!open) return null

  const tiles = [
    { icon: <Move className="w-5 h-5" />,        title: 'Pan',           desc: 'Hold middle-click and drag.' },
    { icon: <Sun className="w-5 h-5" />,         title: 'Brightness',    desc: 'Hold right-click and drag.' },
    { icon: <ScrollText className="w-5 h-5" />,  title: 'Switch X-ray',  desc: 'Scroll the wheel — no modifier.' },
    { icon: <ZoomIn className="w-5 h-5" />,      title: 'Zoom',          desc: 'Ctrl/⌘ + scroll wheel.' },
  ]

  // Stop pointer events from reaching the canvas underneath, which would
  // otherwise capture the pointer for drawing and swallow the button's click.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onClick={stop}
      onWheel={stop}
    >
      <div className="bg-white rounded-[6px] p-6 max-w-[480px] w-[92%] shadow-[0_8px_24px_rgba(18,42,66,.18)]">
        <div className="flex items-center gap-2 mb-1">
          <MousePointer2 className="w-4 h-4 text-[#533afd]" />
          <h3 className="text-[15px] font-medium text-[#061b31]">New mouse conventions</h3>
        </div>
        <p className="text-[13px] text-[#64748d] mb-4">SmartChiro now uses MedDream-style controls. Quick refresher:</p>
        <ul className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <li key={t.title} className="rounded-[4px] border border-[#e5edf5] p-3">
              <div className="text-[#533afd] mb-1">{t.icon}</div>
              <p className="text-[13px] font-medium text-[#061b31]">{t.title}</p>
              <p className="text-[12px] text-[#697386]">{t.desc}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-5">
          <Button
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            className="bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px]"
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}

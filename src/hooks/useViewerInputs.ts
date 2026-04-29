'use client'

import { useEffect } from 'react'

export type WheelIntent =
  | { kind: 'zoom'; deltaY: number }
  | { kind: 'window-level'; deltaY: number }
  | { kind: 'scroll-series'; direction: 1 | -1 }

export type PointerIntent =
  | { kind: 'tool' }
  | { kind: 'pan' }
  | { kind: 'window-level' }

export function interpretWheelEvent(e: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'deltaY'>): WheelIntent {
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', deltaY: e.deltaY }
  if (e.shiftKey) return { kind: 'window-level', deltaY: e.deltaY }
  return { kind: 'scroll-series', direction: e.deltaY > 0 ? 1 : -1 }
}

export function interpretPointerDown(e: Pick<PointerEvent, 'button'>): PointerIntent {
  if (e.button === 1) return { kind: 'pan' }
  if (e.button === 2) return { kind: 'window-level' }
  return { kind: 'tool' }
}

export interface UseViewerInputsOptions {
  canvasRef: React.RefObject<HTMLElement | null>
  onPan: (dx: number, dy: number) => void
  onZoom: (deltaY: number, point: { x: number; y: number }) => void
  onWindowLevel: (dx: number, dy: number) => void
  onScrollSeries: (direction: 1 | -1) => void
}

/**
 * Wires native pointer/wheel events on the canvas root:
 *  - middle-drag -> onPan
 *  - right-drag  -> onWindowLevel (suppresses native context menu)
 *  - wheel       -> onZoom (Ctrl/Meta), onWindowLevel fine-tune (Shift), onScrollSeries (none)
 */
export function useViewerInputs({ canvasRef, onPan, onZoom, onWindowLevel, onScrollSeries }: UseViewerInputsOptions) {
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    let activeIntent: PointerIntent | null = null
    let last: { x: number; y: number } | null = null

    function onPointerDown(e: PointerEvent) {
      const intent = interpretPointerDown(e)
      if (intent.kind === 'tool') return
      e.preventDefault()
      activeIntent = intent
      last = { x: e.clientX, y: e.clientY }
      el!.setPointerCapture(e.pointerId)
    }
    function onPointerMove(e: PointerEvent) {
      if (!activeIntent || !last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      if (activeIntent.kind === 'pan') onPan(dx, dy)
      else if (activeIntent.kind === 'window-level') onWindowLevel(dx, dy)
    }
    function onPointerUp(e: PointerEvent) {
      if (!activeIntent) return
      activeIntent = null; last = null
      try { el!.releasePointerCapture(e.pointerId) } catch {}
    }
    function onContextMenu(e: MouseEvent) { e.preventDefault() }
    function onWheel(e: WheelEvent) {
      const intent = interpretWheelEvent(e)
      if (intent.kind === 'scroll-series') {
        e.preventDefault()
        onScrollSeries(intent.direction)
      } else if (intent.kind === 'zoom') {
        e.preventDefault()
        const rect = el!.getBoundingClientRect()
        onZoom(intent.deltaY, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      } else if (intent.kind === 'window-level') {
        e.preventDefault()
        onWindowLevel(0, intent.deltaY)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel as EventListener)
    }
  }, [canvasRef, onPan, onZoom, onWindowLevel, onScrollSeries])
}

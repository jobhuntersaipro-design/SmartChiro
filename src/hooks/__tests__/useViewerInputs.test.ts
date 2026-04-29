import { describe, it, expect } from 'vitest'
import { interpretWheelEvent, interpretPointerDown } from '@/hooks/useViewerInputs'

describe('useViewerInputs interpreters', () => {
  it('wheel without modifier -> scroll-series', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: false, shiftKey: false, deltaY: 100 } as WheelEvent))
      .toEqual({ kind: 'scroll-series', direction: 1 })
  })

  it('wheel with ctrl -> zoom', () => {
    expect(interpretWheelEvent({ ctrlKey: true, metaKey: false, shiftKey: false, deltaY: -50 } as WheelEvent))
      .toEqual({ kind: 'zoom', deltaY: -50 })
  })

  it('wheel with meta -> zoom (mac)', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: true, shiftKey: false, deltaY: -50 } as WheelEvent))
      .toEqual({ kind: 'zoom', deltaY: -50 })
  })

  it('wheel with shift -> window-level fine-tune', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: false, shiftKey: true, deltaY: 10 } as WheelEvent))
      .toEqual({ kind: 'window-level', deltaY: 10 })
  })

  it('pointer down middle -> pan', () => {
    expect(interpretPointerDown({ button: 1 } as PointerEvent)).toEqual({ kind: 'pan' })
  })

  it('pointer down right -> window-level', () => {
    expect(interpretPointerDown({ button: 2 } as PointerEvent)).toEqual({ kind: 'window-level' })
  })

  it('pointer down left -> tool', () => {
    expect(interpretPointerDown({ button: 0 } as PointerEvent)).toEqual({ kind: 'tool' })
  })
})

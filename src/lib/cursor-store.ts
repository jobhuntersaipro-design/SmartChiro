import type { Point } from "@/types/annotation";

/**
 * Pointer position in image space, kept outside React state: it changes on
 * every mouse move, and as state it re-rendered the whole annotation canvas
 * (every shape) just to update the X/Y readout. Only the readout subscribes.
 */
export interface CursorStore {
  get: () => Point | null;
  set: (point: Point | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createCursorStore(): CursorStore {
  let current: Point | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (point) => {
      current = point;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";

type Handler = (...args: never[]) => unknown;

/**
 * Event handlers with a fixed identity that always call the latest version.
 * Lets memoised children (PropertiesPanel, SeriesStrip) skip re-rendering
 * when the canvas re-renders for unrelated reasons, e.g. every pointer move
 * while a shape is being drawn. Only for handlers called from events — not
 * during render.
 */
export function useStableCallbacks<T extends Record<string, Handler>>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  const [stable] = useState(() => {
    const out: Record<string, Handler> = {};
    for (const key of Object.keys(handlers)) {
      out[key] = (...args: never[]) => latest.current[key](...args);
    }
    return out as T;
  });
  return stable;
}

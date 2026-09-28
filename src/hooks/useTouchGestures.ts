"use client";

import { useCallback, useRef } from "react";
import type { Point } from "@/types/annotation";

/** A pen used within this window turns fingers into pan-only (palm rejection). */
const PEN_SESSION_MS = 5 * 60 * 1000;

interface Options {
  zoomBy: (factor: number, anchorX: number, anchorY: number) => void;
  pan: (dx: number, dy: number) => void;
  /** A two-finger gesture took over — abandon whatever the first finger started. */
  onGestureStart: () => void;
}

interface Pinch {
  distance: number;
  mid: Point;
}

function pinchOf(a: Point, b: Point): Pinch {
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/**
 * Tablet input for the X-ray canvas, run before the drawing/selection handlers:
 * - two fingers pinch-zoom and pan (the first finger's stroke is abandoned);
 * - once a stylus has been used, fingers only pan, so a resting palm or
 *   finger never draws;
 * - one finger with no stylus behaves like the mouse (draw, select, pan).
 * Each handler returns true when it consumed the event.
 */
export function useTouchGestures({ zoomBy, pan, onGestureStart }: Options) {
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);
  const fingerPanId = useRef<number | null>(null);
  const gestureActive = useRef(false);
  const penUsedAt = useRef(0);

  const local = (e: React.PointerEvent, rect: DOMRect): Point => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });

  const onPointerDown = useCallback(
    (e: React.PointerEvent, rect: DOMRect): boolean => {
      if (e.pointerType === "pen") {
        penUsedAt.current = Date.now();
        return false;
      }
      if (e.pointerType !== "touch") return false;
      touches.current.set(e.pointerId, local(e, rect));

      if (touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        pinch.current = pinchOf(a, b);
        fingerPanId.current = null;
        if (!gestureActive.current) onGestureStart();
        gestureActive.current = true;
        return true;
      }
      if (Date.now() - penUsedAt.current < PEN_SESSION_MS) {
        fingerPanId.current = e.pointerId;
        gestureActive.current = true;
        return true;
      }
      return false;
    },
    [onGestureStart],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent, rect: DOMRect): boolean => {
      if (e.pointerType !== "touch" || !touches.current.has(e.pointerId)) return false;
      const prev = touches.current.get(e.pointerId)!;
      const next = local(e, rect);
      touches.current.set(e.pointerId, next);

      if (pinch.current && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const now = pinchOf(a, b);
        pan(now.mid.x - pinch.current.mid.x, now.mid.y - pinch.current.mid.y);
        if (pinch.current.distance > 0 && now.distance > 0) {
          zoomBy(now.distance / pinch.current.distance, now.mid.x, now.mid.y);
        }
        pinch.current = now;
        return true;
      }
      if (fingerPanId.current === e.pointerId) {
        pan(next.x - prev.x, next.y - prev.y);
        return true;
      }
      return gestureActive.current;
    },
    [pan, zoomBy],
  );

  /** pointerup / pointercancel. */
  const onPointerEnd = useCallback((e: React.PointerEvent): boolean => {
    if (e.pointerType !== "touch") return false;
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    if (fingerPanId.current === e.pointerId) fingerPanId.current = null;
    if (!gestureActive.current) return false;
    // Stay in gesture mode until every finger is up, so a leftover finger
    // doesn't suddenly start drawing.
    if (touches.current.size === 0) gestureActive.current = false;
    return true;
  }, []);

  return { onPointerDown, onPointerMove, onPointerEnd };
}

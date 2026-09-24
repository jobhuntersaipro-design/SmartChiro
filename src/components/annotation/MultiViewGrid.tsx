"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseShape, ViewMode, ViewportSlot } from "@/types/annotation";
import { ShapeRenderer } from "./ShapeRenderer";

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface MultiViewGridProps {
  viewMode: ViewMode;
  slots: ViewportSlot[];
  activeSlotIndex: number;
  onSlotClick: (index: number) => void;
  cssFilter?: string;
  imageTransform?: string;
  viewStates: ViewportState[];
  onViewStateChange: (index: number, state: ViewportState) => void;
}

export function ViewportCell({
  slot,
  isActive,
  onClick,
  cssFilter,
  imageTransform,
  viewState,
  onViewStateChange,
  shapes,
}: {
  slot: ViewportSlot;
  isActive: boolean;
  onClick: () => void;
  cssFilter?: string;
  imageTransform?: string;
  viewState: ViewportState;
  onViewStateChange: (state: ViewportState) => void;
  /** Read-only shapes to render as annotation overlay */
  shapes?: BaseShape[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref + post-render check on the <img> below. When the browser serves
  // the image from cache (e.g., the same X-ray was rendered in the
  // active-cell role moments ago), the `load` event can fire BEFORE
  // React attaches our onLoad handler — leaving `imageLoaded` stuck
  // false. Reconciling against `img.complete` after every render catches
  // that race.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  // Snapshot of viewState at pointerdown + accumulated pan delta. Used by
  // the pan handler instead of reading `viewState` from closure — multiple
  // pointermove events fire faster than React re-renders, and the closure
  // copy of viewState is stale between them, so doing `viewState.panX + dx`
  // each frame would lose intermediate deltas and produce visible jitter
  // ("the image keeps moving around"). Computing against a stable
  // snapshot + accumulator is what makes pan track the mouse 1:1.
  const panStartViewState = useRef<ViewportState | null>(null);
  const panAccumulated = useRef({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fit image to viewport. Keep this padding in sync with
  // useCanvasViewport.ts so the active and non-active cells render the
  // X-ray at the *same* size — otherwise the same image in two slots
  // appears at two different scales, which clinicians read as a bug.
  // No upscale cap: small natural-res X-rays should still fill the cell.
  const fitToViewport = useCallback(() => {
    if (!containerRef.current || !slot.imageUrl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const PAD = 4;
    const scaleX = (rect.width - PAD * 2) / slot.imageWidth;
    const scaleY = (rect.height - PAD * 2) / slot.imageHeight;
    const zoom = Math.min(scaleX, scaleY);
    const panX = (rect.width - slot.imageWidth * zoom) / 2;
    const panY = (rect.height - slot.imageHeight * zoom) / 2;
    onViewStateChangeRef.current({ zoom, panX, panY });
  }, [slot.imageWidth, slot.imageHeight, slot.imageUrl]);

  // Fit to viewport on first image load. We fit unconditionally here:
  // the parent's `viewState` was computed for whatever container the slot
  // was previously in (often the active drawing canvas, which has slightly
  // different effective dimensions due to a 2px vs 1px border), so reusing
  // it can leave the image off-frame in the non-active cell. Fitting from
  // the cell's own bounding rect guarantees the X-ray is centered + scaled
  // to this cell every time it first mounts here. User's pan/zoom inside
  // the non-active cell is preserved across re-renders (imageLoaded only
  // toggles once per mount), so this only re-fits on activation
  // transitions, not on every drag.
  useEffect(() => {
    if (!imageLoaded) return;
    fitToViewport();
  }, [imageLoaded, fitToViewport]);

  // Mirror imageLoaded into a ref for the ResizeObserver below (avoids
  // resubscribing on every load).
  const imageLoadedRef = useRef(imageLoaded);
  useEffect(() => {
    imageLoadedRef.current = imageLoaded;
  }, [imageLoaded]);

  // Re-fit when the cell's own bounding rect changes (viewMode swap from
  // side-by-side → 2×2 halves the cell height, window resizes, etc).
  // Without this a cell that loaded its image while it was a different
  // size stays at the old zoom and renders off-center.
  //
  // Subtle: we DO refit on the first observation too. ResizeObserver fires
  // initially with the post-layout rect — that's the rect we actually want
  // to fit to, not skip. The previous "firstFire skip" implementation hid
  // cases where the imageLoaded effect ran fit with a transient rect (e.g.
  // 121px tall during a viewMode transition) and never got corrected.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      if (imageLoadedRef.current) fitToViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToViewport]);

  // When the X-ray loaded in this slot changes (e.g. user picks a different
  // thumbnail for the right pane in comparison mode), reset both the
  // image-loaded flag AND the cached viewport state. Without the viewport
  // reset the new image would render at the previous image's pan/zoom — a
  // jarring "stale state on swap" bug — instead of fitting to the cell.
  const prevXrayIdRef = useRef(slot.xrayId);
  useEffect(() => {
    if (prevXrayIdRef.current !== slot.xrayId) {
      setImageLoaded(false);
      onViewStateChangeRef.current({ zoom: 0, panX: 0, panY: 0 });
      prevXrayIdRef.current = slot.xrayId;
    }
  }, [slot.xrayId]);

  // Cached-image fallback: when imageUrl changes, the browser may serve
  // the image from cache and fire load before React attaches our onLoad
  // handler — leaving imageLoaded stuck false and the fit-on-load effect
  // never running. Reading `img.complete` post-render catches that.
  useEffect(() => {
    if (!slot.imageUrl) return;
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [slot.imageUrl]);

  // Auto-hide hint after 3 seconds
  useEffect(() => {
    if (showHint && slot.imageUrl) {
      hintTimerRef.current = setTimeout(() => setShowHint(false), 3000);
      return () => {
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      };
    }
  }, [showHint, slot.imageUrl]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
  }, []);

  // Use refs for wheel handler to avoid stale closures with native listener.
  // Assign in an effect (React 19 lint disallows direct ref mutation during
  // render — though it's harmless here, the effect form is the canonical
  // pattern for "latest value" mirrors).
  const viewStateRef = useRef(viewState);
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    viewStateRef.current = viewState;
    onViewStateChangeRef.current = onViewStateChange;
  });

  // Native wheel listener with { passive: false } so preventDefault() works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setShowHint(false);
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const vs = viewStateRef.current;
      const newZoom = Math.max(0.05, Math.min(32, vs.zoom * factor));
      const panX = mouseX - (mouseX - vs.panX) * (newZoom / vs.zoom);
      const panY = mouseY - (mouseY - vs.panY) * (newZoom / vs.zoom);
      onViewStateChangeRef.current({ zoom: newZoom, panX, panY });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dismissHint();
    isPanning.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    // Snapshot the current viewState so every pointermove computes its
    // new pan as (snapshot + accumulated delta) rather than (closure
    // viewState + this-frame delta). The closure approach is racy under
    // fast pointer movement — multiple events fire per frame and only
    // the last one's setState wins, dropping the intermediate deltas.
    panStartViewState.current = viewStateRef.current;
    panAccumulated.current = { x: 0, y: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dismissHint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    panAccumulated.current.x += dx;
    panAccumulated.current.y += dy;
    const base = panStartViewState.current;
    if (!base) return;
    onViewStateChangeRef.current({
      ...base,
      panX: base.panX + panAccumulated.current.x,
      panY: base.panY + panAccumulated.current.y,
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
    panStartViewState.current = null;
    panAccumulated.current = { x: 0, y: 0 };
  }, []);

  if (!slot.imageUrl) {
    return (
      <div
        onClick={onClick}
        className="flex h-full w-full cursor-pointer items-center justify-center"
        style={{
          backgroundColor: "#1A1F36",
          border: isActive
            ? "2px solid #533afd"
            : "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center"
            style={{
              borderRadius: 9999,
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Drop X-ray here
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: "#1A1F36",
        border: isActive
          ? "2px solid #533afd"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4,
        cursor: isPanning.current ? "grabbing" : "grab",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Image */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`,
          willChange: "transform",
        }}
      >
        {/* Raw <img>: same parent-transform + pixelated-rendering pipeline
            as AnnotationCanvas; Next/Image fights it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={slot.imageUrl}
          alt={slot.title}
          width={slot.imageWidth}
          height={slot.imageHeight}
          style={{
            display: "block",
            imageRendering: viewState.zoom > 2 ? "pixelated" : "auto",
            filter: cssFilter || undefined,
            transform: imageTransform,
          }}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />
      </div>

      {/* Annotation Shapes Overlay (read-only) */}
      {shapes && shapes.length > 0 && (
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`,
            willChange: "transform",
            pointerEvents: "none",
          }}
        >
          <svg
            width={slot.imageWidth}
            height={slot.imageHeight}
            className="absolute inset-0"
            style={{ overflow: "visible" }}
          >
            {shapes
              .filter((s) => s.visible)
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((shape) => (
                <ShapeRenderer
                  key={shape.id}
                  shape={shape}
                  zoom={viewState.zoom}
                />
              ))}
          </svg>
        </div>
      )}

      {/* Zoom Hint */}
      {showHint && (
        <div
          className="absolute"
          style={{
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 4,
            padding: "4px 10px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          Ctrl + Scroll to zoom &nbsp;|&nbsp; Drag to pan
        </div>
      )}

      {/* Title Label */}
      <div
        className="absolute bottom-1 left-1"
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(255,255,255,0.7)",
          backgroundColor: "rgba(0,0,0,0.5)",
          borderRadius: 3,
          padding: "1px 6px",
          maxWidth: "80%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {slot.title}
      </div>
    </div>
  );
}

export function MultiViewGrid({
  viewMode,
  slots,
  activeSlotIndex,
  onSlotClick,
  cssFilter,
  imageTransform,
  viewStates,
  onViewStateChange,
}: MultiViewGridProps) {
  const gridCols = 2;
  const gridRows = viewMode === "side-by-side" ? 1 : 2;
  const totalSlots = gridCols * gridRows;

  return (
    <div
      className="grid h-full w-full gap-1 p-1"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        backgroundColor: "#1A1F36",
      }}
    >
      {Array.from({ length: totalSlots }).map((_, i) => {
        const slot = slots[i] ?? {
          xrayId: null,
          imageUrl: null,
          imageWidth: 1024,
          imageHeight: 768,
          title: "",
        };
        return (
          <ViewportCell
            key={i}
            slot={slot}
            isActive={i === activeSlotIndex}
            onClick={() => onSlotClick(i)}
            cssFilter={cssFilter}
            imageTransform={imageTransform}
            viewState={viewStates[i] ?? { zoom: 1, panX: 0, panY: 0 }}
            onViewStateChange={(state) => onViewStateChange(i, state)}
          />
        );
      })}
    </div>
  );
}

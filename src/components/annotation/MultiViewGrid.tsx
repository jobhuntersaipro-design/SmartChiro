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
  flipped?: boolean;
  viewStates: ViewportState[];
  onViewStateChange: (index: number, state: ViewportState) => void;
}

export function ViewportCell({
  slot,
  isActive,
  onClick,
  cssFilter,
  flipped,
  viewState,
  onViewStateChange,
  shapes,
}: {
  slot: ViewportSlot;
  isActive: boolean;
  onClick: () => void;
  cssFilter?: string;
  flipped?: boolean;
  viewState: ViewportState;
  onViewStateChange: (state: ViewportState) => void;
  /** Read-only shapes to render as annotation overlay */
  shapes?: BaseShape[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [showHint, setShowHint] = useState(true);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fit image to viewport when loaded or container resizes
  const fitToViewport = useCallback(() => {
    if (!containerRef.current || !slot.imageUrl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 8;
    const scaleX = (rect.width - padding * 2) / slot.imageWidth;
    const scaleY = (rect.height - padding * 2) / slot.imageHeight;
    const zoom = Math.min(scaleX, scaleY, 1);
    const panX = (rect.width - slot.imageWidth * zoom) / 2;
    const panY = (rect.height - slot.imageHeight * zoom) / 2;
    onViewStateChangeRef.current({ zoom, panX, panY });
  }, [slot.imageWidth, slot.imageHeight, slot.imageUrl]);

  // Fit to viewport on first load, but skip if parent already has cached viewport state
  useEffect(() => {
    if (!imageLoaded) return;
    const vs = viewStateRef.current;
    const hasExistingState = vs.zoom !== 1 || vs.panX !== 0 || vs.panY !== 0;
    if (!hasExistingState) {
      fitToViewport();
    }
  }, [imageLoaded, fitToViewport]);

  // When slot changes, reset image loaded state but DON'T reset viewport —
  // the parent manages cached viewport state per xray via gridViewStates
  const prevXrayIdRef = useRef(slot.xrayId);
  useEffect(() => {
    if (prevXrayIdRef.current !== slot.xrayId) {
      setImageLoaded(false);
      prevXrayIdRef.current = slot.xrayId;
    }
  }, [slot.xrayId]);

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

  // Use refs for wheel handler to avoid stale closures with native listener
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;

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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dismissHint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    onViewStateChange({
      ...viewState,
      panX: viewState.panX + dx,
      panY: viewState.panY + dy,
    });
  }, [viewState, onViewStateChange]);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  if (!slot.imageUrl) {
    return (
      <div
        onClick={onClick}
        className="flex cursor-pointer items-center justify-center"
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
      className="relative overflow-hidden"
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
        <img
          src={slot.imageUrl}
          alt={slot.title}
          width={slot.imageWidth}
          height={slot.imageHeight}
          style={{
            display: "block",
            imageRendering: viewState.zoom > 2 ? "pixelated" : "auto",
            filter: cssFilter || undefined,
            transform: flipped ? "scaleX(-1)" : undefined,
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
  flipped,
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
            flipped={flipped}
            viewState={viewStates[i] ?? { zoom: 1, panX: 0, panY: 0 }}
            onViewStateChange={(state) => onViewStateChange(i, state)}
          />
        );
      })}
    </div>
  );
}

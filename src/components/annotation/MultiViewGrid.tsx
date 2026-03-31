"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewMode, ViewportSlot } from "@/types/annotation";

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface MultiViewGridProps {
  viewMode: ViewMode;
  slots: ViewportSlot[];
  activeSlotIndex: number;
  onSlotClick: (index: number) => void;
}

function ViewportCell({
  slot,
  isActive,
  onClick,
}: {
  slot: ViewportSlot;
  isActive: boolean;
  onClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [imageLoaded, setImageLoaded] = useState(false);
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

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
    setViewState({ zoom, panX, panY });
  }, [slot.imageWidth, slot.imageHeight, slot.imageUrl]);

  useEffect(() => {
    if (imageLoaded) fitToViewport();
  }, [imageLoaded, fitToViewport]);

  // Reset when slot changes
  useEffect(() => {
    setImageLoaded(false);
    setViewState({ zoom: 1, panX: 0, panY: 0 });
  }, [slot.xrayId]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setViewState((prev) => {
        const newZoom = Math.max(0.05, Math.min(32, prev.zoom * factor));
        const panX = mouseX - (mouseX - prev.panX) * (newZoom / prev.zoom);
        const panY = mouseY - (mouseY - prev.panY) * (newZoom / prev.zoom);
        return { zoom: newZoom, panX, panY };
      });
    },
    []
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isPanning.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setViewState((prev) => ({
      ...prev,
      panX: prev.panX + dx,
      panY: prev.panY + dy,
    }));
  }, []);

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
            ? "2px solid #635BFF"
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
          ? "2px solid #635BFF"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4,
        cursor: isPanning.current ? "grabbing" : "grab",
      }}
      onWheel={handleWheel}
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
          }}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />
      </div>

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
}: MultiViewGridProps) {
  const gridCols = viewMode === "1x1" ? 2 : 2;
  const gridRows = viewMode === "1x1" ? 1 : 2;
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
          />
        );
      })}
    </div>
  );
}

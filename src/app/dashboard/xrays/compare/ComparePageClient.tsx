"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Link2Off, ZoomIn, ZoomOut } from "lucide-react";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SCROLL_STEP } from "@/types/annotation";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface XrayInfo {
  id: string;
  title: string;
  fileUrl: string;
  width: number;
  height: number;
  createdAt: string;
}

interface ComparePageClientProps {
  leftXray: XrayInfo;
  rightXray: XrayInfo;
  patientName: string;
}

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export function ComparePageClient({
  leftXray,
  rightXray,
  patientName,
}: ComparePageClientProps) {
  const router = useRouter();
  const [linked, setLinked] = useState(true);
  const [leftView, setLeftView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [rightView, setRightView] = useState<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const [dividerPos, setDividerPos] = useState(50); // percentage
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; side: "left" | "right" } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Divider Drag ───
  const handleDividerPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDividerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingDivider || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
      setDividerPos(pct);
    },
    [isDraggingDivider]
  );

  const handleDividerPointerUp = useCallback(() => {
    setIsDraggingDivider(false);
  }, []);

  // ─── Zoom ───
  const handleWheel = useCallback(
    (e: WheelEvent, side: "left" | "right") => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_SCROLL_STEP : 1 / ZOOM_SCROLL_STEP;

      const updateZoom = (prev: ViewState): ViewState => {
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * delta));
        const ratio = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          panX: e.offsetX - (e.offsetX - prev.panX) * ratio,
          panY: e.offsetY - (e.offsetY - prev.panY) * ratio,
        };
      };

      if (linked) {
        setLeftView(updateZoom);
        setRightView(updateZoom);
      } else if (side === "left") {
        setLeftView(updateZoom);
      } else {
        setRightView(updateZoom);
      }
    },
    [linked]
  );

  // ─── Pan ───
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, side: "left" | "right") => {
      if (e.button !== 0) return;
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, side });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning || !panStart) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanStart({ x: e.clientX, y: e.clientY, side: panStart.side });

      const updatePan = (prev: ViewState): ViewState => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      });

      if (linked) {
        setLeftView(updatePan);
        setRightView(updatePan);
      } else if (panStart.side === "left") {
        setLeftView(updatePan);
      } else {
        setRightView(updatePan);
      }
    },
    [isPanning, panStart, linked]
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  // ─── Wheel event listeners ───
  const leftCanvasRef = useRef<HTMLDivElement>(null);
  const rightCanvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const leftEl = leftCanvasRef.current;
    const rightEl = rightCanvasRef.current;
    const leftHandler = (e: WheelEvent) => handleWheel(e, "left");
    const rightHandler = (e: WheelEvent) => handleWheel(e, "right");

    leftEl?.addEventListener("wheel", leftHandler, { passive: false });
    rightEl?.addEventListener("wheel", rightHandler, { passive: false });

    return () => {
      leftEl?.removeEventListener("wheel", leftHandler);
      rightEl?.removeEventListener("wheel", rightHandler);
    };
  }, [handleWheel]);

  // ─── Fit images on mount ───
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const halfWidth = rect.width / 2 - 8; // account for divider
    const height = rect.height - 52; // account for header

    const fitZoom = (imgW: number, imgH: number) => {
      const zx = (halfWidth - 48) / imgW;
      const zy = (height - 48) / imgH;
      return Math.min(zx, zy, 1);
    };

    const lz = fitZoom(leftXray.width, leftXray.height);
    const rz = fitZoom(rightXray.width, rightXray.height);

    setLeftView({
      zoom: lz,
      panX: (halfWidth - leftXray.width * lz) / 2,
      panY: (height - leftXray.height * lz) / 2,
    });
    setRightView({
      zoom: rz,
      panX: (halfWidth - rightXray.width * rz) / 2,
      panY: (height - rightXray.height * rz) / 2,
    });
  }, [leftXray, rightXray]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const zoomBoth = (factor: number) => {
    const update = (prev: ViewState): ViewState => ({
      ...prev,
      zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor)),
    });
    setLeftView(update);
    setRightView(update);
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* Header */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-canvas-raised bg-canvas px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-canvas-raised hover:text-white"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <span className="text-[15px] font-medium text-white">Compare X-Rays</span>
          <span className="text-[14px] text-fg-muted">{patientName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => zoomBoth(1 / 1.25)}
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-canvas-raised hover:text-white"
          >
            <ZoomOut size={16} strokeWidth={1.5} />
          </button>
          <span className="min-w-11 text-center text-[13px] text-fg-muted">
            {Math.round(leftView.zoom * 100)}%
          </span>
          <button
            onClick={() => zoomBoth(1.25)}
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-canvas-raised hover:text-white"
          >
            <ZoomIn size={16} strokeWidth={1.5} />
          </button>

          <div className="mx-2 h-5 w-px bg-canvas-raised" />

          <button
            onClick={() => setLinked(!linked)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
              linked
                ? "bg-primary/20 text-brand"
                : "text-fg-muted hover:bg-canvas-raised hover:text-white"
            }`}
          >
            {linked ? <Link2 size={14} strokeWidth={1.5} /> : <Link2Off size={14} strokeWidth={1.5} />}
            {linked ? "Linked" : "Independent"}
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex flex-1 overflow-hidden"
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
      >
        {/* Left panel */}
        <div
          className="relative overflow-hidden"
          style={{ width: `${dividerPos}%` }}
        >
          {/* Left label */}
          <div className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2.5 py-1">
            <span className="text-[13px] font-medium text-white">{leftXray.title}</span>
            <span className="ml-2 text-[12px] text-fg-muted">{formatDate(leftXray.createdAt)}</span>
          </div>
          <div
            ref={leftCanvasRef}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => handlePointerDown(e, "left")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              style={{
                transform: `translate(${leftView.panX}px, ${leftView.panY}px) scale(${leftView.zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={leftXray.fileUrl}
                alt={leftXray.title}
                width={leftXray.width}
                height={leftXray.height}
                draggable={false}
                style={{ maxWidth: "none" }}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="z-20 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-canvas-raised transition-colors hover:bg-brand"
          onPointerDown={handleDividerPointerDown}
        >
          <div className="h-8 w-0.5 rounded-full bg-fg-muted" />
        </div>

        {/* Right panel */}
        <div
          className="relative overflow-hidden"
          style={{ width: `${100 - dividerPos}%` }}
        >
          {/* Right label */}
          <div className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2.5 py-1">
            <span className="text-[13px] font-medium text-white">{rightXray.title}</span>
            <span className="ml-2 text-[12px] text-fg-muted">{formatDate(rightXray.createdAt)}</span>
          </div>
          <div
            ref={rightCanvasRef}
            className="h-full w-full cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => handlePointerDown(e, "right")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              style={{
                transform: `translate(${rightView.panX}px, ${rightView.panY}px) scale(${rightView.zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rightXray.fileUrl}
                alt={rightXray.title}
                width={rightXray.width}
                height={rightXray.height}
                draggable={false}
                style={{ maxWidth: "none" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

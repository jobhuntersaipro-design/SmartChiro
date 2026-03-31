"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Link2Off, ZoomIn, ZoomOut } from "lucide-react";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SCROLL_STEP } from "@/types/annotation";

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
    new Date(iso).toLocaleDateString("en-US", {
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
    <div className="flex h-screen flex-col bg-[#1A1F36]">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#2D3348] bg-[#1A1F36] px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-[4px] p-1.5 text-[#8B93A7] transition-colors hover:bg-[#2D3348] hover:text-white"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <span className="text-[15px] font-medium text-white">Compare X-Rays</span>
          <span className="text-[14px] text-[#8B93A7]">{patientName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => zoomBoth(1 / 1.25)}
            className="rounded-[4px] p-1.5 text-[#8B93A7] transition-colors hover:bg-[#2D3348] hover:text-white"
          >
            <ZoomOut size={16} strokeWidth={1.5} />
          </button>
          <span className="min-w-[44px] text-center text-[13px] text-[#8B93A7]">
            {Math.round(leftView.zoom * 100)}%
          </span>
          <button
            onClick={() => zoomBoth(1.25)}
            className="rounded-[4px] p-1.5 text-[#8B93A7] transition-colors hover:bg-[#2D3348] hover:text-white"
          >
            <ZoomIn size={16} strokeWidth={1.5} />
          </button>

          <div className="mx-2 h-5 w-px bg-[#2D3348]" />

          <button
            onClick={() => setLinked(!linked)}
            className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[13px] transition-colors ${
              linked
                ? "bg-[#635BFF]/20 text-[#635BFF]"
                : "text-[#8B93A7] hover:bg-[#2D3348] hover:text-white"
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
          <div className="absolute left-3 top-3 z-10 rounded-[4px] bg-black/60 px-2.5 py-1">
            <span className="text-[13px] font-medium text-white">{leftXray.title}</span>
            <span className="ml-2 text-[12px] text-[#8B93A7]">{formatDate(leftXray.createdAt)}</span>
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
          className="z-20 flex w-[6px] shrink-0 cursor-col-resize items-center justify-center bg-[#2D3348] transition-colors hover:bg-[#635BFF]"
          onPointerDown={handleDividerPointerDown}
        >
          <div className="h-8 w-[2px] rounded-full bg-[#8B93A7]" />
        </div>

        {/* Right panel */}
        <div
          className="relative overflow-hidden"
          style={{ width: `${100 - dividerPos}%` }}
        >
          {/* Right label */}
          <div className="absolute left-3 top-3 z-10 rounded-[4px] bg-black/60 px-2.5 py-1">
            <span className="text-[13px] font-medium text-white">{rightXray.title}</span>
            <span className="ml-2 text-[12px] text-[#8B93A7]">{formatDate(rightXray.createdAt)}</span>
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

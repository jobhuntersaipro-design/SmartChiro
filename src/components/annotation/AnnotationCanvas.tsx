"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BaseShape,
  AnnotationCanvasState,
  ImageAdjustments,
} from "@/types/annotation";
import {
  createEmptyCanvasState,
  DEFAULT_IMAGE_ADJUSTMENTS,
} from "@/types/annotation";
import { useCanvasViewport } from "@/hooks/useCanvasViewport";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useImageAdjustments } from "@/hooks/useImageAdjustments";
import { AnnotationHeader } from "./AnnotationHeader";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { ZoomBar } from "./ZoomBar";
import { StatusBar } from "./StatusBar";
import { SelectionOverlay } from "./SelectionOverlay";

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  xrayTitle: string;
  patientName: string;
  annotationId: string | null;
  initialCanvasState?: AnnotationCanvasState;
  initialAdjustments?: ImageAdjustments;
  onClose: () => void;
}

export function AnnotationCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  xrayTitle,
  patientName,
  annotationId,
  initialCanvasState,
  initialAdjustments,
  onClose,
}: AnnotationCanvasProps) {
  // ─── State ───
  const [shapes, setShapes] = useState<BaseShape[]>(
    initialCanvasState?.shapes ?? []
  );
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  // ─── Hooks ───
  const viewport = useCanvasViewport({ imageWidth, imageHeight });
  const undoRedo = useUndoRedo();
  const imageAdj = useImageAdjustments(
    initialAdjustments ?? { ...DEFAULT_IMAGE_ADJUSTMENTS }
  );
  const autoSave = useAutoSave({ annotationId });

  const interaction = useCanvasInteraction({
    transform: viewport.transform,
    pan: viewport.pan,
    shapes,
    containerRef: viewport.containerRef,
  });

  // ─── Canvas State Helpers ───
  const buildCanvasState = useCallback((): AnnotationCanvasState => {
    return {
      version: 1,
      shapes,
      viewport: {
        zoom: viewport.transform.zoom,
        panX: viewport.transform.panX,
        panY: viewport.transform.panY,
      },
      metadata: {
        shapeCount: shapes.length,
        measurementCount: shapes.filter(
          (s) => s.type === "ruler" || s.type === "angle" || s.type === "cobb_angle"
        ).length,
        lastModifiedShapeId: shapes.length > 0 ? shapes[shapes.length - 1].id : null,
      },
    };
  }, [shapes, viewport.transform]);

  // ─── Shape Operations ───
  const toggleShapeVisibility = useCallback((id: string) => {
    setShapes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
    autoSave.markDirty();
  }, [autoSave]);

  const toggleShapeLock = useCallback((id: string) => {
    setShapes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s))
    );
    autoSave.markDirty();
  }, [autoSave]);

  // ─── Event Listeners ───
  useEffect(() => {
    const handleDeleteShapes = (e: Event) => {
      const { shapeIds } = (e as CustomEvent).detail;
      setShapes((prev) => {
        const deleted = prev.filter((s) => shapeIds.includes(s.id));
        for (const shape of deleted) {
          undoRedo.pushCommand("DELETE_SHAPE", shape.id, shape, null);
        }
        return prev.filter((s) => !shapeIds.includes(s.id));
      });
      autoSave.markDirty();
    };

    const handleReorderShape = (e: Event) => {
      const { shapeId, direction } = (e as CustomEvent).detail;
      setShapes((prev) => {
        const shape = prev.find((s) => s.id === shapeId);
        if (!shape) return prev;
        const before = { ...shape };
        const newShapes = prev.map((s) => {
          if (s.id === shapeId) {
            return {
              ...s,
              zIndex: direction === "forward" ? s.zIndex + 1 : Math.max(0, s.zIndex - 1),
            };
          }
          return s;
        });
        undoRedo.pushCommand(
          "REORDER_SHAPE",
          shapeId,
          before,
          newShapes.find((s) => s.id === shapeId) ?? null
        );
        return newShapes;
      });
      autoSave.markDirty();
    };

    const handleDuplicateShapes = (e: Event) => {
      const { shapeIds } = (e as CustomEvent).detail;
      setShapes((prev) => {
        const duplicated = prev
          .filter((s) => shapeIds.includes(s.id))
          .map((s) => ({
            ...s,
            id: crypto.randomUUID(),
            x: s.x + 20,
            y: s.y + 20,
            label: s.label ? `${s.label} copy` : null,
            zIndex: Math.max(...prev.map((p) => p.zIndex), 0) + 1,
          }));
        for (const shape of duplicated) {
          undoRedo.pushCommand("ADD_SHAPE", shape.id, null, shape);
        }
        return [...prev, ...duplicated];
      });
      autoSave.markDirty();
    };

    window.addEventListener("canvas:delete-shapes", handleDeleteShapes);
    window.addEventListener("canvas:reorder-shape", handleReorderShape);
    window.addEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
    return () => {
      window.removeEventListener("canvas:delete-shapes", handleDeleteShapes);
      window.removeEventListener("canvas:reorder-shape", handleReorderShape);
      window.removeEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
    };
  }, [undoRedo, autoSave]);

  // ─── Keyboard Shortcuts (Zoom, Undo/Redo, Save, Panel Toggle) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Undo
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRedo.undo();
        return;
      }
      // Redo
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRedo.redo();
        return;
      }
      // Save
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autoSave.saveNow(buildCanvasState(), imageAdj.adjustments);
        return;
      }
      // Fit to viewport
      if (mod && e.key === "0") {
        e.preventDefault();
        viewport.fitToViewport();
        return;
      }
      // Zoom to 100%
      if (mod && e.key === "1") {
        e.preventDefault();
        viewport.zoomToActual();
        return;
      }
      // Zoom in
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        viewport.zoomIn();
        return;
      }
      // Zoom out
      if (mod && e.key === "-") {
        e.preventDefault();
        viewport.zoomOut();
        return;
      }
      // Toggle properties panel
      if (e.key === "\\") {
        setPropertiesPanelOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoRedo, autoSave, buildCanvasState, imageAdj.adjustments, viewport]);

  // Fit to viewport once image loads
  useEffect(() => {
    if (imageLoaded) {
      viewport.fitToViewport();
    }
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cursor ───
  const getCursor = () => {
    if (interaction.isPanning) return "grabbing";
    if (interaction.activeTool === "hand") return "grab";
    if (interaction.activeTool === "select") return "default";
    return "crosshair";
  };

  return (
    <div className="flex h-screen w-screen flex-col" style={{ backgroundColor: "#1A1F36" }}>
      {/* Header */}
      <AnnotationHeader
        xrayTitle={xrayTitle}
        patientName={patientName}
        isDirty={autoSave.isDirty}
        isSaving={autoSave.isSaving}
        onSave={() => autoSave.saveNow(buildCanvasState(), imageAdj.adjustments)}
        onClose={onClose}
        adjustments={imageAdj.adjustments}
        onBrightnessChange={imageAdj.setBrightness}
        onContrastChange={imageAdj.setContrast}
        onInvertChange={imageAdj.setInvert}
        onWindowCenterChange={imageAdj.setWindowCenter}
        onWindowWidthChange={imageAdj.setWindowWidth}
        onResetAdjustments={imageAdj.reset}
        isAdjustmentsModified={imageAdj.isModified}
      />

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <AnnotationToolbar
          activeTool={interaction.activeTool}
          onToolChange={interaction.setActiveTool}
        />

        {/* Canvas Area */}
        <div className="relative flex flex-1 flex-col">
          <div
            ref={viewport.containerRef}
            className="relative flex-1 overflow-hidden"
            style={{
              backgroundColor: "#1A1F36",
              cursor: getCursor(),
            }}
            onWheel={viewport.handleWheel}
            onPointerDown={interaction.handlePointerDown}
            onPointerMove={interaction.handlePointerMove}
            onPointerUp={interaction.handlePointerUp}
          >
            {/* Image Layer */}
            <div
              className="absolute origin-top-left"
              style={{
                transform: `translate(${viewport.transform.panX}px, ${viewport.transform.panY}px) scale(${viewport.transform.zoom})`,
                willChange: "transform",
              }}
            >
              <img
                src={imageUrl}
                alt={xrayTitle}
                width={imageWidth}
                height={imageHeight}
                style={{
                  filter: imageAdj.cssFilter,
                  imageRendering: viewport.transform.zoom > 2 ? "pixelated" : "auto",
                  display: "block",
                }}
                onLoad={() => setImageLoaded(true)}
                draggable={false}
              />
            </div>

            {/* Annotation Shapes Layer */}
            <div
              className="absolute origin-top-left"
              style={{
                transform: `translate(${viewport.transform.panX}px, ${viewport.transform.panY}px) scale(${viewport.transform.zoom})`,
                willChange: "transform",
                pointerEvents: "none",
              }}
            >
              <svg
                width={imageWidth}
                height={imageHeight}
                className="absolute inset-0"
                style={{ overflow: "visible" }}
              >
                {shapes
                  .filter((s) => s.visible)
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((shape) => (
                    <g key={shape.id} opacity={shape.style.strokeOpacity}>
                      {shape.type === "rectangle" && (
                        <rect
                          x={shape.x}
                          y={shape.y}
                          width={shape.width}
                          height={shape.height}
                          fill={shape.style.fillColor ?? "none"}
                          fillOpacity={shape.style.fillOpacity}
                          stroke={shape.style.strokeColor}
                          strokeWidth={shape.style.strokeWidth / viewport.transform.zoom}
                          strokeDasharray={
                            shape.style.lineDash.length > 0
                              ? shape.style.lineDash
                                  .map((d) => d / viewport.transform.zoom)
                                  .join(" ")
                              : undefined
                          }
                          transform={
                            shape.rotation
                              ? `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`
                              : undefined
                          }
                        />
                      )}
                      {shape.type === "ellipse" && (
                        <ellipse
                          cx={shape.x + shape.width / 2}
                          cy={shape.y + shape.height / 2}
                          rx={shape.width / 2}
                          ry={shape.height / 2}
                          fill={shape.style.fillColor ?? "none"}
                          fillOpacity={shape.style.fillOpacity}
                          stroke={shape.style.strokeColor}
                          strokeWidth={shape.style.strokeWidth / viewport.transform.zoom}
                        />
                      )}
                      {(shape.type === "line" || shape.type === "arrow" || shape.type === "ruler") &&
                        shape.points.length >= 2 && (
                          <>
                            <line
                              x1={shape.points[0].x}
                              y1={shape.points[0].y}
                              x2={shape.points[1].x}
                              y2={shape.points[1].y}
                              stroke={shape.style.strokeColor}
                              strokeWidth={shape.style.strokeWidth / viewport.transform.zoom}
                              strokeDasharray={
                                shape.style.lineDash.length > 0
                                  ? shape.style.lineDash
                                      .map((d) => d / viewport.transform.zoom)
                                      .join(" ")
                                  : undefined
                              }
                            />
                            {shape.type === "arrow" && (
                              <polygon
                                points={getArrowheadPoints(
                                  shape.points[0],
                                  shape.points[1],
                                  8 / viewport.transform.zoom
                                )}
                                fill={shape.style.strokeColor}
                              />
                            )}
                            {shape.measurement && (
                              <text
                                x={(shape.points[0].x + shape.points[1].x) / 2}
                                y={(shape.points[0].y + shape.points[1].y) / 2 - 8 / viewport.transform.zoom}
                                fill={shape.style.strokeColor}
                                fontSize={12 / viewport.transform.zoom}
                                textAnchor="middle"
                                fontFamily="system-ui, sans-serif"
                              >
                                {shape.measurement.label}
                              </text>
                            )}
                          </>
                        )}
                      {(shape.type === "freehand" || shape.type === "polyline") &&
                        shape.points.length >= 2 && (
                          <polyline
                            points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                            fill="none"
                            stroke={shape.style.strokeColor}
                            strokeWidth={shape.style.strokeWidth / viewport.transform.zoom}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      {shape.type === "text" && shape.text && (
                        <text
                          x={shape.x}
                          y={shape.y + (shape.fontSize ?? 16)}
                          fill={shape.style.strokeColor}
                          fontSize={(shape.fontSize ?? 16) / viewport.transform.zoom}
                          fontFamily="system-ui, sans-serif"
                        >
                          {shape.text}
                        </text>
                      )}
                      {shape.type === "angle" &&
                        shape.points.length >= 3 && (
                          <>
                            <polyline
                              points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                              fill="none"
                              stroke={shape.style.strokeColor}
                              strokeWidth={shape.style.strokeWidth / viewport.transform.zoom}
                            />
                            {shape.measurement && (
                              <text
                                x={shape.points[1].x + 12 / viewport.transform.zoom}
                                y={shape.points[1].y - 8 / viewport.transform.zoom}
                                fill={shape.style.strokeColor}
                                fontSize={12 / viewport.transform.zoom}
                                fontFamily="system-ui, sans-serif"
                              >
                                {shape.measurement.label}
                              </text>
                            )}
                          </>
                        )}
                    </g>
                  ))}
              </svg>
            </div>

            {/* Selection Overlay (screen space) */}
            <SelectionOverlay
              shapes={shapes}
              selectedShapeIds={interaction.selectedShapeIds}
              transform={viewport.transform}
            />
          </div>

          {/* Zoom Bar */}
          <ZoomBar
            zoomPercent={viewport.zoomPercent}
            onFit={viewport.fitToViewport}
            onActual={viewport.zoomToActual}
            onZoomIn={viewport.zoomIn}
            onZoomOut={viewport.zoomOut}
            onCustomZoom={(z) => viewport.zoomAtCenter(z)}
          />
        </div>

        {/* Right Properties Panel */}
        <PropertiesPanel
          shapes={shapes}
          selectedShapeIds={interaction.selectedShapeIds}
          onSelectShape={(id) => interaction.setSelectedShapeIds([id])}
          onToggleVisibility={toggleShapeVisibility}
          onToggleLock={toggleShapeLock}
          isOpen={propertiesPanelOpen}
          onTogglePanel={() => setPropertiesPanelOpen((prev) => !prev)}
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        cursorPosition={interaction.cursorPosition}
        selectedCount={interaction.selectedShapeIds.length}
        isDirty={autoSave.isDirty}
        activeTool={interaction.activeTool}
        shapeCount={shapes.length}
      />
    </div>
  );
}

// Helper: compute arrowhead triangle points
function getArrowheadPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number
): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const p1x = to.x - size * Math.cos(angle - Math.PI / 6);
  const p1y = to.y - size * Math.sin(angle - Math.PI / 6);
  const p2x = to.x - size * Math.cos(angle + Math.PI / 6);
  const p2y = to.y - size * Math.sin(angle + Math.PI / 6);
  return `${to.x},${to.y} ${p1x},${p1y} ${p2x},${p2y}`;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BaseShape,
  AnnotationCanvasState,
  CalibrationData,
  ImageAdjustments,
  ShapeStyle,
} from "@/types/annotation";
import {
  createEmptyCanvasState,
  DEFAULT_IMAGE_ADJUSTMENTS,
  DEFAULT_SHAPE_STYLE,
} from "@/types/annotation";
import { useCanvasViewport } from "@/hooks/useCanvasViewport";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useImageAdjustments } from "@/hooks/useImageAdjustments";
import { useDrawingTools } from "@/hooks/useDrawingTools";
import { AnnotationHeader } from "./AnnotationHeader";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { ZoomBar } from "./ZoomBar";
import { StatusBar } from "./StatusBar";
import { SelectionOverlay } from "./SelectionOverlay";
import { ShapeRenderer } from "./ShapeRenderer";
import { TextInput } from "./TextInput";
import { CalibrationDialog } from "./CalibrationDialog";

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  xrayTitle: string;
  patientName: string;
  annotationId: string | null;
  initialCanvasState?: AnnotationCanvasState;
  initialAdjustments?: ImageAdjustments;
  xrayId: string;
  initialCalibration: CalibrationData;
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
  xrayId,
  initialCalibration,
  onClose,
}: AnnotationCanvasProps) {
  // ─── State ───
  const [shapes, setShapes] = useState<BaseShape[]>(
    initialCanvasState?.shapes ?? []
  );
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<ShapeStyle>({
    ...DEFAULT_SHAPE_STYLE,
  });

  // Calibration
  const [calibration, setCalibration] = useState<CalibrationData>(initialCalibration);
  const [calibrationDialogShape, setCalibrationDialogShape] = useState<BaseShape | null>(null);

  // Force re-render counter for drawing preview
  const [, setRenderTick] = useState(0);

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

  const handleAddShape = useCallback(
    (shape: BaseShape) => {
      setShapes((prev) => [...prev, shape]);
      undoRedo.pushCommand("ADD_SHAPE", shape.id, null, shape);
      autoSave.markDirty();
      interaction.setSelectedShapeIds([shape.id]);
    },
    [undoRedo, autoSave, interaction]
  );

  const handleDeleteShapes = useCallback(
    (ids: string[]) => {
      setShapes((prev) => {
        const deleted = prev.filter((s) => ids.includes(s.id));
        for (const shape of deleted) {
          undoRedo.pushCommand("DELETE_SHAPE", shape.id, shape, null);
        }
        return prev.filter((s) => !ids.includes(s.id));
      });
      autoSave.markDirty();
    },
    [undoRedo, autoSave]
  );

  const handleCalibrationRequest = useCallback((shape: BaseShape) => {
    setCalibrationDialogShape(shape);
  }, []);

  const drawing = useDrawingTools({
    activeTool: interaction.activeTool,
    transform: viewport.transform,
    shapes,
    currentStyle,
    calibration,
    onAddShape: handleAddShape,
    onDeleteShapes: handleDeleteShapes,
    onCalibrationRequest: handleCalibrationRequest,
  });

  // Apply calibration from dialog
  const handleApplyCalibration = useCallback(
    async (knownDistanceMm: number) => {
      if (!calibrationDialogShape) return;
      const pixDist = calibrationDialogShape.pixelDistance;
      if (!pixDist || pixDist <= 0) return;
      const spacing = knownDistanceMm / pixDist;

      // Remove any existing calibration reference shapes
      setShapes((prev) => {
        const existingCalRefs = prev.filter(
          (s) => s.type === "calibration_reference" && s.id !== calibrationDialogShape.id
        );
        for (const old of existingCalRefs) {
          undoRedo.pushCommand("DELETE_SHAPE", old.id, old, null);
        }
        return prev
          .filter((s) => !(s.type === "calibration_reference" && s.id !== calibrationDialogShape.id))
          .map((s) => {
            if (s.id === calibrationDialogShape.id) {
              return {
                ...s,
                knownDistance: knownDistanceMm,
                computedPixelSpacing: spacing,
                measurement: {
                  value: pixDist,
                  unit: "mm" as const,
                  calibrated: true,
                  label: `${knownDistanceMm.toFixed(1)} mm`,
                },
              };
            }
            // Recalculate all ruler measurements
            if (s.type === "ruler" && s.points.length >= 2) {
              const rulerPixelLen = Math.hypot(
                s.points[1].x - s.points[0].x,
                s.points[1].y - s.points[0].y
              );
              const mmVal = rulerPixelLen * spacing;
              return {
                ...s,
                measurement: {
                  value: rulerPixelLen,
                  unit: "mm" as const,
                  calibrated: true,
                  label: `${mmVal.toFixed(1)} mm`,
                },
              };
            }
            return s;
          });
      });

      // Update calibration state
      const newCalibration: CalibrationData = { isCalibrated: true, pixelSpacing: spacing };
      setCalibration(newCalibration);
      autoSave.markDirty();

      // Persist to backend
      try {
        await fetch(`/api/xrays/${xrayId}/calibrate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pixelSpacing: spacing,
            calibrationMethod: "REFERENCE_MARKER",
          }),
        });
      } catch {
        // Calibration applied locally even if API fails
      }

      setCalibrationDialogShape(null);
    },
    [calibrationDialogShape, undoRedo, autoSave, xrayId]
  );

  // ─── Shape Update (from properties panel) ───
  const handleUpdateShape = useCallback(
    (id: string, updates: Partial<BaseShape>) => {
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const before = { ...s };
          const after = { ...s, ...updates };
          undoRedo.pushCommand("MODIFY_SHAPE", id, before, after);
          return after;
        })
      );
      autoSave.markDirty();
    },
    [undoRedo, autoSave]
  );

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
          (s) => s.type === "ruler" || s.type === "angle" || s.type === "cobb_angle" || s.type === "calibration_reference"
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
    const handleDeleteShapesEvent = (e: Event) => {
      const { shapeIds } = (e as CustomEvent).detail;
      handleDeleteShapes(shapeIds);
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

    window.addEventListener("canvas:delete-shapes", handleDeleteShapesEvent);
    window.addEventListener("canvas:reorder-shape", handleReorderShape);
    window.addEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
    return () => {
      window.removeEventListener("canvas:delete-shapes", handleDeleteShapesEvent);
      window.removeEventListener("canvas:reorder-shape", handleReorderShape);
      window.removeEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
    };
  }, [undoRedo, autoSave, handleDeleteShapes]);

  // ─── Keyboard Shortcuts (Zoom, Undo/Redo, Save, Panel Toggle) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Let drawing tools handle keys first
      if (drawing.handleKeyDown(e)) return;

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
  }, [undoRedo, autoSave, buildCanvasState, imageAdj.adjustments, viewport, drawing]);

  // Fit to viewport once image loads
  useEffect(() => {
    if (imageLoaded) {
      viewport.fitToViewport();
    }
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Pointer Handlers (drawing tools + interaction) ───
  const containerRectRef = useRef<DOMRect | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      containerRectRef.current = rect;

      // Drawing tools get first chance
      if (drawing.handlePointerDown(e, rect)) {
        setRenderTick((n) => n + 1);
        return;
      }

      // Fall through to interaction (select, pan)
      interaction.handlePointerDown(e);
    },
    [drawing, interaction]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRectRef.current ?? (e.currentTarget as HTMLElement).getBoundingClientRect();

      drawing.handlePointerMove(e, rect);
      interaction.handlePointerMove(e);
      setRenderTick((n) => n + 1);
    },
    [drawing, interaction]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      drawing.handlePointerUp(e);
      interaction.handlePointerUp(e);
      setRenderTick((n) => n + 1);
    },
    [drawing, interaction]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      drawing.handleDoubleClick(e, rect);
    },
    [drawing]
  );

  // ─── Cursor ───
  const getCursor = () => {
    if (interaction.isPanning) return "grabbing";
    if (interaction.activeTool === "hand") return "grab";
    if (interaction.activeTool === "select") return "default";
    if (interaction.activeTool === "eraser") return "crosshair";
    if (interaction.activeTool === "text") return "text";
    return "crosshair";
  };

  // Collect all shapes to render (committed + drawing preview)
  const allShapesToRender = [...shapes];
  if (drawing.drawingShape) {
    allShapesToRender.push(drawing.drawingShape);
  }

  // Text input screen position
  const textScreenPos = drawing.textInputState.active && drawing.textInputState.position
    ? {
        x: drawing.textInputState.position.x * viewport.transform.zoom + viewport.transform.panX,
        y: drawing.textInputState.position.y * viewport.transform.zoom + viewport.transform.panY,
      }
    : null;

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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
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
                {allShapesToRender
                  .filter((s) => s.visible)
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((shape) => (
                    <ShapeRenderer
                      key={shape.id}
                      shape={shape}
                      zoom={viewport.transform.zoom}
                    />
                  ))}
              </svg>
            </div>

            {/* Selection Overlay (screen space) */}
            <SelectionOverlay
              shapes={shapes}
              selectedShapeIds={interaction.selectedShapeIds}
              transform={viewport.transform}
            />

            {/* Inline Text Input */}
            {textScreenPos && (
              <TextInput
                x={textScreenPos.x}
                y={textScreenPos.y}
                zoom={viewport.transform.zoom}
                onCommit={(text) => {
                  drawing.commitText(text);
                  setRenderTick((n) => n + 1);
                }}
                onCancel={() => {
                  drawing.cancelDrawing();
                  setRenderTick((n) => n + 1);
                }}
              />
            )}

            {/* Calibration Dialog */}
            {calibrationDialogShape && calibrationDialogShape.pixelDistance && (
              <CalibrationDialog
                pixelDistance={calibrationDialogShape.pixelDistance}
                onApply={handleApplyCalibration}
                onCancel={() => setCalibrationDialogShape(null)}
              />
            )}
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
          onUpdateShape={handleUpdateShape}
          currentStyle={currentStyle}
          onStyleChange={setCurrentStyle}
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

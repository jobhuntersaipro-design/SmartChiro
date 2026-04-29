"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BaseShape,
  AnnotationCanvasState,
  ImageAdjustments,
  ShapeStyle,
  ToolId,
  ViewMode,
  ViewportSlot,
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
import { ViewModeSwitcher } from "./ViewModeSwitcher";
import { PatientImageSidebar } from "./PatientImageSidebar";
import { MultiViewGrid, ViewportCell, type ViewportState } from "./MultiViewGrid";
import { KeyboardShortcutsPanel } from "./KeyboardShortcutsPanel";
import { DrawingConfirmation } from "./DrawingConfirmation";
import { EmptyCanvasHint } from "./EmptyCanvasHint";
import { CalibrationDialog } from "./CalibrationDialog";
import { recalibrateMeasurement } from "@/lib/measurements";

interface AnnotationCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  xrayTitle: string;
  patientName: string;
  patientId: string;
  userId: string;
  annotationId: string | null;
  initialCanvasState?: AnnotationCanvasState;
  initialAdjustments?: ImageAdjustments;
  xrayId: string;
  onClose: () => void;
  initialCalibration?: {
    isCalibrated: boolean;
    pixelsPerMm: number | null;
    calibrationNote: string | null;
  };
}

export function AnnotationCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  xrayTitle,
  patientName,
  patientId,
  userId,
  annotationId,
  initialCanvasState,
  initialAdjustments,
  xrayId,
  onClose,
  initialCalibration,
}: AnnotationCanvasProps) {
  // ─── State ───
  const [shapes, setShapes] = useState<BaseShape[]>(
    initialCanvasState?.shapes ?? []
  );
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  // Prevents flash of full-size image before fitToViewport runs
  const [viewportReady, setViewportReady] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<ShapeStyle>({
    ...DEFAULT_SHAPE_STYLE,
  });

  // Flip (horizontal mirror)
  const [flipped, setFlipped] = useState(false);

  // Calibration state
  const [isCalibrated, setIsCalibrated] = useState(initialCalibration?.isCalibrated ?? false);
  const [pixelsPerMm, setPixelsPerMm] = useState<number | null>(initialCalibration?.pixelsPerMm ?? null);
  const [calibrationNote, setCalibrationNote] = useState<string | null>(initialCalibration?.calibrationNote ?? null);
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [calibrationPixelDistance, setCalibrationPixelDistance] = useState(0);

  // Keyboard shortcuts panel
  const [shortcutsPanelOpen, setShortcutsPanelOpen] = useState(false);

  // View mode & multi-view
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [imageSidebarOpen, setImageSidebarOpen] = useState(false);
  const [gridSlots, setGridSlots] = useState<ViewportSlot[]>([
    { xrayId: xrayId, imageUrl: imageUrl, imageWidth, imageHeight, title: xrayTitle },
  ]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const defaultViewState: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  const [gridViewStates, setGridViewStates] = useState<ViewportState[]>([
    defaultViewState, defaultViewState, defaultViewState, defaultViewState,
  ]);

  const handleGridViewStateChange = useCallback((index: number, state: ViewportState) => {
    setGridViewStates((prev) => {
      const next = [...prev];
      next[index] = state;
      return next;
    });
  }, []);

  // Per-xray cache: shapes, annotationId, and viewport state for multi-view isolation
  interface XrayCache {
    shapes: BaseShape[];
    annotationId: string | null;
    viewportState?: { zoom: number; panX: number; panY: number };
  }
  const shapesPerXrayRef = useRef<Map<string, XrayCache>>(
    new Map([[xrayId, { shapes: initialCanvasState?.shapes ?? [], annotationId }]])
  );

  // Track the xray ID that the current shapes belong to
  const activeXrayIdRef = useRef<string>(xrayId);

  // Force re-render counter for drawing preview and annotation fetches
  const [, setRenderTick] = useState(0);

  // Clipboard for copy/paste
  const clipboardRef = useRef<BaseShape[]>([]);

  // ─── Hooks ───
  const viewport = useCanvasViewport({ imageWidth, imageHeight });
  const imageAdj = useImageAdjustments(
    initialAdjustments ?? { ...DEFAULT_IMAGE_ADJUSTMENTS }
  );
  const autoSave = useAutoSave({ annotationId, xrayId, userId });
  const undoRedo = useUndoRedo({
    shapes,
    setShapes,
    onDirty: () => autoSave.markDirty(),
  });

  // Track shape snapshots before drag for undo
  const dragSnapshotsRef = useRef<Map<string, BaseShape>>(new Map());

  const handleMoveShapes = useCallback(
    (shapeIds: string[], dx: number, dy: number) => {
      setShapes((prev) =>
        prev.map((s) => {
          if (!shapeIds.includes(s.id)) return s;
          // Capture snapshot before first move
          if (!dragSnapshotsRef.current.has(s.id)) {
            dragSnapshotsRef.current.set(s.id, { ...s, points: [...s.points] });
          }
          return {
            ...s,
            x: s.x + dx,
            y: s.y + dy,
            points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          };
        })
      );
    },
    []
  );

  const interaction = useCanvasInteraction({
    transform: viewport.transform,
    pan: viewport.pan,
    shapes,
    containerRef: viewport.containerRef,
    onMoveShapes: handleMoveShapes,
  });

  const handleAddShape = useCallback(
    (shape: BaseShape) => {
      // Recalibrate measurement label if calibrated
      const calibratedShape = shape.measurement && pixelsPerMm
        ? { ...shape, measurement: recalibrateMeasurement(shape.measurement, pixelsPerMm) }
        : shape;
      setShapes((prev) => [...prev, calibratedShape]);
      undoRedo.pushCommand("ADD_SHAPE", calibratedShape.id, null, calibratedShape);
      autoSave.markDirty();
      interaction.setSelectedShapeIds([calibratedShape.id]);
    },
    [undoRedo, autoSave, interaction, pixelsPerMm]
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

  const handleCalibrationDraw = useCallback((pixelDist: number) => {
    setCalibrationPixelDistance(pixelDist);
    setCalibrationDialogOpen(true);
  }, []);

  const handleCalibrate = useCallback(async (newPixelsPerMm: number, note: string) => {
    setCalibrationDialogOpen(false);
    setIsCalibrated(true);
    setPixelsPerMm(newPixelsPerMm);
    setCalibrationNote(note || null);

    // Recalibrate all existing measurement labels
    setShapes((prev) =>
      prev.map((s) => {
        if (s.measurement) {
          return { ...s, measurement: recalibrateMeasurement(s.measurement, newPixelsPerMm) };
        }
        return s;
      })
    );
    autoSave.markDirty();

    // Persist to DB
    try {
      await fetch(`/api/xrays/${xrayId}/calibrate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelsPerMm: newPixelsPerMm, calibrationNote: note || undefined }),
      });
    } catch (err) {
      console.error("Failed to save calibration:", err);
    }
  }, [xrayId, autoSave]);

  const drawing = useDrawingTools({
    activeTool: interaction.activeTool,
    transform: viewport.transform,
    shapes,
    currentStyle,
    onAddShape: handleAddShape,
    onDeleteShapes: handleDeleteShapes,
    onCalibrationDraw: handleCalibrationDraw,
    pixelsPerMm,
  });

  // ─── Multi-View: Switch active slot → swap shapes per xray ───
  const prevActiveSlotRef = useRef(activeSlotIndex);
  useEffect(() => {
    if (viewMode === "single") return;
    const prevIndex = prevActiveSlotRef.current;
    const prevSlot = gridSlots[prevIndex];
    const newSlot = gridSlots[activeSlotIndex];
    const prevXrayId = prevSlot?.xrayId ?? null;
    const newXrayId = newSlot?.xrayId ?? null;

    prevActiveSlotRef.current = activeSlotIndex;

    // Same xray or no xray in new slot — nothing to do
    if (!newXrayId || prevXrayId === newXrayId) return;

    // Save current shapes + viewport state for the previous xray
    if (prevXrayId) {
      shapesPerXrayRef.current.set(prevXrayId, {
        shapes: [...shapes],
        annotationId: autoSave.currentAnnotationId,
        viewportState: { ...viewport.transform },
      });
    }

    // Sync the active cell's viewport.transform → gridViewStates for the
    // previous slot so it renders at the correct zoom/pan as a non-active cell
    setGridViewStates((prev) => {
      const next = [...prev];
      next[prevIndex] = { ...viewport.transform };
      return next;
    });

    // Load shapes for the new xray
    const cached = shapesPerXrayRef.current.get(newXrayId);
    if (cached) {
      setShapes(cached.shapes);
      autoSave.switchTarget(newXrayId, cached.annotationId);
      activeXrayIdRef.current = newXrayId;
      // Restore viewport state if previously saved
      if (cached.viewportState) {
        viewport.setTransform(cached.viewportState);
        setViewportReady(true);
      } else {
        // No cached viewport — fit after container ref is attached
        requestAnimationFrame(() => {
          viewport.fitToViewport();
          setViewportReady(true);
        });
      }
    } else {
      // Not yet loaded — start with empty and fetch from API
      setShapes([]);
      autoSave.switchTarget(newXrayId, null);
      activeXrayIdRef.current = newXrayId;
      requestAnimationFrame(() => {
        viewport.fitToViewport();
        setViewportReady(true);
      });
      fetchAnnotationForXray(newXrayId);
    }
    // Clear undo history when switching xrays
    undoRedo.clear();
    interaction.setSelectedShapeIds([]);
  }, [activeSlotIndex, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch annotation for an xray that hasn't been loaded yet
  const fetchAnnotationForXray = useCallback(async (targetXrayId: string) => {
    try {
      const res = await fetch(`/api/xrays/${targetXrayId}/annotations`);
      if (!res.ok) return;
      const data = await res.json();
      const annotations = data.annotations as { id: string }[];
      if (annotations.length === 0) {
        shapesPerXrayRef.current.set(targetXrayId, { shapes: [], annotationId: null });
        return;
      }
      // Fetch the latest annotation's full canvas state
      const latestId = annotations[0].id;
      const fullRes = await fetch(`/api/xrays/${targetXrayId}/annotations/${latestId}`);
      if (!fullRes.ok) return;
      const fullData = await fullRes.json();
      const loadedShapes: BaseShape[] = fullData.canvasState?.shapes ?? [];
      shapesPerXrayRef.current.set(targetXrayId, { shapes: loadedShapes, annotationId: latestId });

      // If this xray is still the active one, update shapes state
      if (activeXrayIdRef.current === targetXrayId) {
        setShapes(loadedShapes);
        autoSave.switchTarget(targetXrayId, latestId);
      } else {
        // Non-active cell — trigger re-render so read-only overlay updates
        setRenderTick((n) => n + 1);
      }
    } catch (err) {
      console.error("Failed to fetch annotation for xray:", targetXrayId, err);
    }
  }, [autoSave]);

  // ─── Pre-fetch annotations for all grid slots (non-active cells) ───
  useEffect(() => {
    if (viewMode === "single") return;
    for (const slot of gridSlots) {
      if (slot.xrayId && !shapesPerXrayRef.current.has(slot.xrayId)) {
        fetchAnnotationForXray(slot.xrayId);
      }
    }
  }, [gridSlots, viewMode, fetchAnnotationForXray]);

  // ─── Multi-View: Select X-ray from sidebar ───
  const handleSelectXrayForSlot = useCallback(
    (xray: { id: string; fileUrl: string; width: number | null; height: number | null; title: string | null }) => {
      if (viewMode === "single") {
        // In single mode, navigate to that X-ray's annotation page
        window.location.href = `/dashboard/xrays/${patientId}/${xray.id}/annotate`;
        return;
      }
      // Save current shapes + viewport state before switching
      const currentSlot = gridSlots[activeSlotIndex];
      if (currentSlot?.xrayId) {
        shapesPerXrayRef.current.set(currentSlot.xrayId, {
          shapes: [...shapes],
          annotationId: autoSave.currentAnnotationId,
          viewportState: { ...viewport.transform },
        });
      }

      // In grid mode, place into the active slot
      setGridSlots((prev) => {
        const newSlots = [...prev];
        const slot: ViewportSlot = {
          xrayId: xray.id,
          imageUrl: xray.fileUrl,
          imageWidth: xray.width ?? 1024,
          imageHeight: xray.height ?? 768,
          title: xray.title ?? "Untitled",
        };
        // Expand array if needed
        while (newSlots.length <= activeSlotIndex) {
          newSlots.push({ xrayId: null, imageUrl: null, imageWidth: 1024, imageHeight: 768, title: "" });
        }
        newSlots[activeSlotIndex] = slot;
        return newSlots;
      });

      // Load the new xray's shapes + viewport state
      const cached = shapesPerXrayRef.current.get(xray.id);
      if (cached) {
        setShapes(cached.shapes);
        autoSave.switchTarget(xray.id, cached.annotationId);
        activeXrayIdRef.current = xray.id;
        if (cached.viewportState) {
          viewport.setTransform(cached.viewportState);
          // Cached viewport — no flash, stay visible
        } else {
          // No cached viewport — hide until image loads and fitToViewport runs
          setViewportReady(false);
          setImageLoaded(false);
        }
      } else {
        setShapes([]);
        autoSave.switchTarget(xray.id, null);
        activeXrayIdRef.current = xray.id;
        // Hide until image loads and fitToViewport runs
        setViewportReady(false);
        setImageLoaded(false);
        fetchAnnotationForXray(xray.id);
      }
      undoRedo.clear();
      interaction.setSelectedShapeIds([]);
    },
    [viewMode, activeSlotIndex, gridSlots, shapes, autoSave, undoRedo, interaction, fetchAnnotationForXray, viewport]
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
          (s) => s.type === "ruler" || s.type === "angle" || s.type === "cobb_angle"
        ).length,
        lastModifiedShapeId: shapes.length > 0 ? shapes[shapes.length - 1].id : null,
      },
    };
  }, [shapes, viewport.transform]);

  // Keep auto-save refs current so debounced/interval saves have latest data
  useEffect(() => {
    autoSave.updateState(buildCanvasState(), imageAdj.adjustments);
    // Keep per-xray shapes cache in sync (viewport synced separately below)
    const currentXray = activeXrayIdRef.current;
    if (currentXray) {
      const existing = shapesPerXrayRef.current.get(currentXray);
      shapesPerXrayRef.current.set(currentXray, {
        shapes,
        annotationId: autoSave.currentAnnotationId,
        viewportState: existing?.viewportState,
      });
    }
  }, [shapes, imageAdj.adjustments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep per-xray viewport state in cache — only when zoom > min (fitToViewport has run)
  useEffect(() => {
    if (viewport.transform.zoom <= 0.01) return; // skip initial 0.001 state
    const currentXray = activeXrayIdRef.current;
    if (currentXray) {
      const existing = shapesPerXrayRef.current.get(currentXray);
      if (existing) {
        existing.viewportState = { ...viewport.transform };
      }
    }
  }, [viewport.transform]);

  // Auto-open Properties panel on first selection per session.
  // Once the user manually closes it, don't reopen automatically.
  const userClosedPanelRef = useRef(false);
  const prevSelectionCountRef = useRef(0);
  useEffect(() => {
    const count = interaction.selectedShapeIds.length;
    if (count > 0 && prevSelectionCountRef.current === 0 && !userClosedPanelRef.current) {
      setPropertiesPanelOpen(true);
    }
    prevSelectionCountRef.current = count;
  }, [interaction.selectedShapeIds]);

  const handleTogglePropertiesPanel = useCallback(() => {
    setPropertiesPanelOpen((prev) => {
      if (prev) userClosedPanelRef.current = true;
      else userClosedPanelRef.current = false;
      return !prev;
    });
  }, []);

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

    const handleDragEnd = (e: Event) => {
      const { shapeIds } = (e as CustomEvent).detail;
      // Push undo commands for each dragged shape
      for (const id of shapeIds) {
        const before = dragSnapshotsRef.current.get(id);
        if (before) {
          const after = shapes.find((s) => s.id === id);
          if (after) {
            undoRedo.pushCommand("MODIFY_SHAPE", id, before, after);
          }
        }
      }
      dragSnapshotsRef.current.clear();
      autoSave.markDirty();
    };

    window.addEventListener("canvas:delete-shapes", handleDeleteShapesEvent);
    window.addEventListener("canvas:reorder-shape", handleReorderShape);
    window.addEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
    window.addEventListener("canvas:drag-end", handleDragEnd);
    return () => {
      window.removeEventListener("canvas:delete-shapes", handleDeleteShapesEvent);
      window.removeEventListener("canvas:reorder-shape", handleReorderShape);
      window.removeEventListener("canvas:duplicate-shapes", handleDuplicateShapes);
      window.removeEventListener("canvas:drag-end", handleDragEnd);
    };
  }, [undoRedo, autoSave, handleDeleteShapes, shapes]);

  // ─── Keyboard Shortcuts (Zoom, Undo/Redo, Save, Panel Toggle) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Handle pending shape confirmation
      if (drawing.pendingShape) {
        if (e.key === "Enter" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          drawing.acceptPending();
          return;
        }
        if (e.key === "Escape" || e.key.toLowerCase() === "n") {
          e.preventDefault();
          drawing.rejectPending();
          return;
        }
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
        handleTogglePropertiesPanel();
        return;
      }

      // Toggle keyboard shortcuts panel
      if (e.key === "?") {
        setShortcutsPanelOpen((prev) => !prev);
        return;
      }

      // Copy (Cmd+C)
      if (mod && e.key.toLowerCase() === "c" && interaction.selectedShapeIds.length > 0) {
        e.preventDefault();
        clipboardRef.current = shapes.filter((s) =>
          interaction.selectedShapeIds.includes(s.id)
        );
        return;
      }

      // Paste (Cmd+V)
      if (mod && e.key.toLowerCase() === "v" && clipboardRef.current.length > 0) {
        e.preventDefault();
        const pasted: BaseShape[] = clipboardRef.current.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
          x: s.x + 20,
          y: s.y + 20,
          points: s.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
          label: s.label ? `${s.label} copy` : null,
          zIndex: Math.max(...shapes.map((p) => p.zIndex), 0) + 1,
        }));
        setShapes((prev) => [...prev, ...pasted]);
        for (const shape of pasted) {
          undoRedo.pushCommand("ADD_SHAPE", shape.id, null, shape);
        }
        autoSave.markDirty();
        interaction.setSelectedShapeIds(pasted.map((s) => s.id));
        // Update clipboard offset for successive pastes
        clipboardRef.current = clipboardRef.current.map((s) => ({
          ...s,
          x: s.x + 20,
          y: s.y + 20,
          points: s.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
        }));
        return;
      }

      // Arrow key nudging (1px, or 10px with Shift)
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        interaction.selectedShapeIds.length > 0 &&
        !mod
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        setShapes((prev) =>
          prev.map((s) => {
            if (!interaction.selectedShapeIds.includes(s.id)) return s;
            const before = { ...s };
            const after = {
              ...s,
              x: s.x + dx,
              y: s.y + dy,
              points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            };
            undoRedo.pushCommand("MODIFY_SHAPE", s.id, before, after);
            return after;
          })
        );
        autoSave.markDirty();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoRedo, autoSave, buildCanvasState, imageAdj.adjustments, viewport, drawing, interaction.selectedShapeIds, shapes, interaction, handleTogglePropertiesPanel]);

  // Fit to viewport once image loads
  useEffect(() => {
    if (imageLoaded) {
      viewport.fitToViewport();
      setViewportReady(true);
    }
  }, [imageLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when viewMode changes (container size changes)
  useEffect(() => {
    // Brief opacity hide to prevent flash during layout change
    setViewportReady(false);
    // Small delay to let the grid CSS layout settle before measuring container
    const timer = setTimeout(() => {
      viewport.fitToViewport();
      setViewportReady(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (interaction.isDragging) return "move";
    if (interaction.activeTool === "hand") return "grab";
    if (interaction.activeTool === "eraser") return "crosshair";
    if (interaction.activeTool === "text") return "text";
    return "crosshair";
  };

  // Collect all shapes to render (committed + drawing preview + pending)
  const allShapesToRender = [...shapes];
  if (drawing.drawingShape) {
    allShapesToRender.push(drawing.drawingShape);
  }
  if (drawing.pendingShape) {
    allShapesToRender.push(drawing.pendingShape.shape);
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
        patientId={patientId}
        xrayId={xrayId}
        isDirty={autoSave.isDirty}
        isSaving={autoSave.isSaving}
        onSave={() => autoSave.saveNow(buildCanvasState(), imageAdj.adjustments)}
        onClose={onClose}
        adjustments={imageAdj.adjustments}
        onBrightnessChange={imageAdj.setBrightness}
        onContrastChange={imageAdj.setContrast}
        onWindowCenterChange={imageAdj.setWindowCenter}
        onResetAdjustments={imageAdj.reset}
        isAdjustmentsModified={imageAdj.isModified}
        flipped={flipped}
        onFlipChange={setFlipped}
      />

      {/* Horizontal Toolbar */}
      <div
        className="flex items-center"
        style={{
          height: 44,
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #e5edf5",
        }}
      >
        <ViewModeSwitcher
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
        <div style={{ width: 1, height: 28, backgroundColor: "#e5edf5", marginLeft: 4, marginRight: 4 }} />
        <AnnotationToolbar
          activeTool={interaction.activeTool}
          onToolChange={(tool) => {
            if (drawing.pendingShape) drawing.acceptPending();
            interaction.setActiveTool(tool);
          }}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          onUndo={undoRedo.undo}
          onRedo={undoRedo.redo}
          onToggleShortcuts={() => setShortcutsPanelOpen((prev) => !prev)}
        />
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Patient Image Sidebar (left side) */}
        <PatientImageSidebar
          patientId={patientId}
          userId={userId}
          currentXrayId={xrayId}
          loadedXrayIds={viewMode !== "single" ? gridSlots.filter(s => s.xrayId).map(s => s.xrayId!) : undefined}
          activeGridXrayId={viewMode !== "single" ? (gridSlots[activeSlotIndex]?.xrayId ?? null) : undefined}
          onSelectXray={handleSelectXrayForSlot}
          isOpen={imageSidebarOpen}
          onToggle={() => setImageSidebarOpen((prev) => !prev)}
        />

        {/* Canvas Area */}
        <div className="relative flex flex-1 flex-col">
          {viewMode === "single" ? (
            <>
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
                    opacity: viewportReady ? 1 : 0,
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
                      transform: flipped ? "scaleX(-1)" : undefined,
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
                    opacity: viewportReady ? 1 : 0,
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

                {/* Drawing Confirmation (accept/reject) */}
                {drawing.pendingShape && (
                  <DrawingConfirmation
                    screenX={drawing.pendingShape.screenX}
                    screenY={drawing.pendingShape.screenY}
                    onAccept={drawing.acceptPending}
                    onReject={drawing.rejectPending}
                  />
                )}

                {/* Empty-canvas hint */}
                {shapes.length === 0 && !drawing.drawingShape && !drawing.pendingShape && (
                  <EmptyCanvasHint />
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
            </>
          ) : (
            /* Multi-View Grid — active cell is a full canvas */
            <>
              <div
                className="grid h-full w-full gap-1 p-1"
                style={{
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gridTemplateRows: `repeat(${viewMode === "side-by-side" ? 1 : 2}, 1fr)`,
                  backgroundColor: "#1A1F36",
                }}
              >
                {Array.from({ length: viewMode === "side-by-side" ? 2 : 4 }).map((_, i) => {
                  const slot = gridSlots[i] ?? { xrayId: null, imageUrl: null, imageWidth: 1024, imageHeight: 768, title: "" };

                  if (i === activeSlotIndex && slot.imageUrl) {
                    // ─── Active cell: full canvas with drawing ───
                    return (
                      <div
                        key={i}
                        ref={viewport.containerRef}
                        className="relative overflow-hidden"
                        style={{
                          backgroundColor: "#1A1F36",
                          border: "2px solid #533afd",
                          borderRadius: 4,
                          cursor: getCursor(),
                        }}
                        onWheel={viewport.handleWheel}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onDoubleClick={handleDoubleClick}
                      >
                        <div
                          className="absolute origin-top-left"
                          style={{
                            transform: `translate(${viewport.transform.panX}px, ${viewport.transform.panY}px) scale(${viewport.transform.zoom})`,
                            willChange: "transform",
                            opacity: viewportReady ? 1 : 0,
                          }}
                        >
                          <img
                            src={slot.imageUrl}
                            alt={slot.title}
                            width={slot.imageWidth}
                            height={slot.imageHeight}
                            style={{
                              filter: imageAdj.cssFilter,
                              imageRendering: viewport.transform.zoom > 2 ? "pixelated" : "auto",
                              display: "block",
                              transform: flipped ? "scaleX(-1)" : undefined,
                            }}
                            onLoad={() => setImageLoaded(true)}
                            draggable={false}
                          />
                        </div>
                        <div
                          className="absolute origin-top-left"
                          style={{
                            transform: `translate(${viewport.transform.panX}px, ${viewport.transform.panY}px) scale(${viewport.transform.zoom})`,
                            willChange: "transform",
                            pointerEvents: "none",
                            opacity: viewportReady ? 1 : 0,
                          }}
                        >
                          <svg
                            width={slot.imageWidth}
                            height={slot.imageHeight}
                            className="absolute inset-0"
                            style={{ overflow: "visible" }}
                          >
                            {allShapesToRender
                              .filter((s) => s.visible)
                              .sort((a, b) => a.zIndex - b.zIndex)
                              .map((shape) => (
                                <ShapeRenderer key={shape.id} shape={shape} zoom={viewport.transform.zoom} />
                              ))}
                          </svg>
                        </div>
                        <SelectionOverlay shapes={shapes} selectedShapeIds={interaction.selectedShapeIds} transform={viewport.transform} />
                        {textScreenPos && (
                          <TextInput
                            x={textScreenPos.x}
                            y={textScreenPos.y}
                            zoom={viewport.transform.zoom}
                            onCommit={(text) => { drawing.commitText(text); setRenderTick((n) => n + 1); }}
                            onCancel={() => { drawing.cancelDrawing(); setRenderTick((n) => n + 1); }}
                          />
                        )}
                        {drawing.pendingShape && (
                          <DrawingConfirmation
                            screenX={drawing.pendingShape.screenX}
                            screenY={drawing.pendingShape.screenY}
                            onAccept={drawing.acceptPending}
                            onReject={drawing.rejectPending}
                          />
                        )}
                        <div
                          className="absolute bottom-1 left-1"
                          style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.7)", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 3, padding: "1px 6px" }}
                        >
                          {slot.title}
                        </div>
                      </div>
                    );
                  }

                  if (!slot.imageUrl) {
                    // ─── Empty cell ───
                    return (
                      <div
                        key={i}
                        onClick={() => setActiveSlotIndex(i)}
                        className="flex cursor-pointer items-center justify-center"
                        style={{
                          backgroundColor: "#1A1F36",
                          border: i === activeSlotIndex ? "2px solid #533afd" : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 4,
                        }}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center" style={{ borderRadius: 9999, backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>
                          </div>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Drop X-ray here</span>
                        </div>
                      </div>
                    );
                  }

                  // ─── Non-active cell: simple viewer with read-only annotations ───
                  const cachedShapes = slot.xrayId ? shapesPerXrayRef.current.get(slot.xrayId)?.shapes : undefined;
                  return (
                    <ViewportCell
                      key={i}
                      slot={slot}
                      isActive={false}
                      onClick={() => setActiveSlotIndex(i)}
                      cssFilter={imageAdj.cssFilter}
                      flipped={flipped}
                      viewState={gridViewStates[i] ?? { zoom: 1, panX: 0, panY: 0 }}
                      onViewStateChange={(state) => handleGridViewStateChange(i, state)}
                      shapes={cachedShapes}
                    />
                  );
                })}
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
            </>
          )}
        </div>

        {/* Right Properties Panel */}
        <PropertiesPanel
          shapes={shapes}
          selectedShapeIds={interaction.selectedShapeIds}
          onSelectShape={(id) => interaction.setSelectedShapeIds([id])}
          onToggleVisibility={toggleShapeVisibility}
          onToggleLock={toggleShapeLock}
          onDeleteShape={(id) => handleDeleteShapes([id])}
          onUpdateShape={handleUpdateShape}
          currentStyle={currentStyle}
          onStyleChange={setCurrentStyle}
          isOpen={propertiesPanelOpen}
          onTogglePanel={handleTogglePropertiesPanel}
          pixelsPerMm={pixelsPerMm}
        />
      </div>

      {/* Calibration Dialog */}
      {calibrationDialogOpen && (
        <CalibrationDialog
          pixelDistance={calibrationPixelDistance}
          onCalibrate={handleCalibrate}
          onCancel={() => setCalibrationDialogOpen(false)}
        />
      )}

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel
        isOpen={shortcutsPanelOpen}
        onClose={() => setShortcutsPanelOpen(false)}
      />

      {/* Status Bar */}
      <StatusBar
        cursorPosition={interaction.cursorPosition}
        selectedCount={interaction.selectedShapeIds.length}
        isDirty={autoSave.isDirty}
        activeTool={interaction.activeTool}
        shapeCount={shapes.length}
        saveStatus={autoSave.saveStatus}
        saveError={autoSave.saveError}
        sizeWarning={autoSave.sizeWarning}
        onRetrySave={autoSave.retrySave}
        isCalibrated={isCalibrated}
        pixelsPerMm={pixelsPerMm}
        calibrationNote={calibrationNote}
        viewMode={viewMode}
      />
    </div>
  );
}

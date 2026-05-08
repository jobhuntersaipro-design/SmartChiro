"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  nextMeasurementId,
  computeGlobalPointLabels,
  resolveShapeRefs,
  recomputeShapeDerived,
  findDependentsOfShape,
  buildDependentCounts,
} from "@/lib/measurements";
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
import { RecentCommitUndo } from "./RecentCommitUndo";
import { CalibrationDialog } from "./CalibrationDialog";
import { CascadeDeleteDialog } from "./CascadeDeleteDialog";
import { EmptyCanvasHint } from "./EmptyCanvasHint";
import { useViewerInputs } from "@/hooks/useViewerInputs";
import { SeriesStrip, type SeriesXray } from "./SeriesStrip";
import { ToolIndicatorChip } from "./ToolIndicatorChip";
import { FirstRunOverlay } from "./FirstRunOverlay";
import { NotesDrawer } from "./NotesDrawer";
import { useXrayNotes } from "@/hooks/useXrayNotes";
import { Toaster } from "@/components/ui/sonner";

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
  patientSeries?: SeriesXray[];
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
  patientSeries = [],
}: AnnotationCanvasProps) {
  // ─── State ───
  const [shapes, setShapes] = useState<BaseShape[]>(
    initialCanvasState?.shapes ?? []
  );
  // Properties panel: open by default, but persist user preference across sessions.
  const [propertiesPanelOpen, setPropertiesPanelOpenState] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("smartchiro:propertiesPanelOpen");
    if (stored === "false") setPropertiesPanelOpenState(false);
  }, []);
  const setPropertiesPanelOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setPropertiesPanelOpenState((prev) => {
        const value = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
        if (typeof window !== "undefined") {
          window.localStorage.setItem("smartchiro:propertiesPanelOpen", String(value));
        }
        return value;
      });
    },
    [],
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  // Prevents flash of full-size image before fitToViewport runs
  const [viewportReady, setViewportReady] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<ShapeStyle>({
    ...DEFAULT_SHAPE_STYLE,
  });

  // Image orientation transforms (independent of brightness/contrast/invert)
  const [flipped, setFlipped] = useState(false);
  const [flippedV, setFlippedV] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

  const imageTransform = useMemo(() => {
    const parts: string[] = [];
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
    if (flipped || flippedV) {
      parts.push(`scale(${flipped ? -1 : 1}, ${flippedV ? -1 : 1})`);
    }
    return parts.length > 0 ? parts.join(" ") : undefined;
  }, [flipped, flippedV, rotation]);

  const resetOrientation = useCallback(() => {
    setFlipped(false);
    setFlippedV(false);
    setRotation(0);
  }, []);

  const rotate90 = useCallback(() => {
    setRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
  }, []);

  // Keyboard shortcuts panel
  const [shortcutsPanelOpen, setShortcutsPanelOpen] = useState(false);

  // Image cycling between X-rays in this patient is exposed via J/K (and
  // arrow up/down) in PatientImageSidebar. The wheel is reserved for
  // pan/zoom inside the active image.

  // Notes drawer
  const [notesOpen, setNotesOpen] = useState(false);
  const notesData = useXrayNotes(xrayId);
  const notesCount = notesData.history.length + (notesData.current ? 1 : 0);

  // Canvas root ref for useViewerInputs
  const canvasRootRef = useRef<HTMLDivElement>(null);

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

  // Wire MedDream-style mouse conventions on the canvas root
  useViewerInputs({
    canvasRef: canvasRootRef,
    onPan: (dx, dy) => {
      viewport.pan(dx, dy);
    },
    onZoom: (deltaY, point) => {
      // Multiplicative zoom around the cursor. Using zoomBy (factor) instead
      // of zoomAtPoint(absoluteZoom) so rapid wheel events compose against
      // the freshest committed zoom inside setTransform — avoids the stale
      // closure read that caused sticky / drifting zoom on trackpad pinch.
      const factor = deltaY < 0 ? 1.1 : 0.9;
      viewport.zoomBy(factor, point.x, point.y);
    },
    onWindowLevel: (dx, dy) => {
      imageAdj.setBrightness(Math.max(-100, Math.min(100, imageAdj.adjustments.brightness + Math.round(dx / 4))));
      imageAdj.setContrast(Math.max(-100, Math.min(100, imageAdj.adjustments.contrast - Math.round(dy / 4))));
    },
  });

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

  // Per-vertex drag: nudge a single point of a single shape. Used when the
  // user grabs a vertex handle (within VERTEX_HIT_PIXELS of the dot). The
  // measurement-following logic in resolveShapeRefs lets dependent
  // measurements track this vertex live as it moves.
  const handleMoveVertex = useCallback(
    (shapeId: string, vertexIndex: number, dx: number, dy: number) => {
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id !== shapeId) return s;
          if (!dragSnapshotsRef.current.has(s.id)) {
            dragSnapshotsRef.current.set(s.id, { ...s, points: [...s.points] });
          }
          const nextPoints = s.points.map((p, i) =>
            i === vertexIndex ? { x: p.x + dx, y: p.y + dy } : p,
          );
          // Recompute bbox + measurement-derived fields (angle reading,
          // cobb perpendiculars, etc.) for the source shape itself. Dependent
          // shapes that snapped to this vertex are updated separately at
          // render time via resolveShapeRefs. Dirty marking + undo command
          // happens in the canvas:drag-end handler, matching whole-shape drag.
          return recomputeShapeDerived({ ...s, points: nextPoints });
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
    onMoveVertex: handleMoveVertex,
  });

  const handleAddShape = useCallback(
    (shape: BaseShape) => {
      setShapes((prev) => {
        const measurementId = nextMeasurementId(shape.type, prev);
        const stamped = measurementId ? { ...shape, measurementId } : shape;
        // Re-push the command with the stamped shape so undo restores the ID
        // label. Stamp the active tool too so tool-scoped Cmd+Z can identify
        // which tool authored each undo entry.
        undoRedo.pushCommand("ADD_SHAPE", stamped.id, null, stamped, interaction.activeTool);
        return [...prev, stamped];
      });
      autoSave.markDirty();
      interaction.setSelectedShapeIds([shape.id]);
    },
    [undoRedo, autoSave, interaction]
  );

  const handleDeleteShapes = useCallback(
    (ids: string[]) => {
      let deletedCalibration = false;
      setShapes((prev) => {
        const deleted = prev.filter((s) => ids.includes(s.id));
        if (deleted.some((s) => s.type === "calibration")) {
          deletedCalibration = true;
        }
        if (deleted.length === 1) {
          // Single delete → individual command, undoes one shape with one Cmd+Z.
          undoRedo.pushCommand("DELETE_SHAPE", deleted[0].id, deleted[0], null);
        } else if (deleted.length > 1) {
          // Multi-delete → one BATCH command so a single Cmd+Z restores all.
          undoRedo.pushBatch(
            deleted.map((shape) => ({
              type: "DELETE_SHAPE" as const,
              shapeBefore: shape,
              shapeAfter: null,
              shapeId: shape.id,
            }))
          );
        }
        return prev.filter((s) => !ids.includes(s.id));
      });
      // Deleting the calibration line decalibrates the image — measurements
      // revert to px until the user calibrates again. (Note: undo restores
      // the shape but not the pixelsPerMm; calibrating again is the way back.)
      if (deletedCalibration) {
        imageAdj.setPixelsPerMm(undefined);
      }
      autoSave.markDirty();
    },
    [undoRedo, autoSave, imageAdj]
  );

  // ─── Cascade-delete dialog state ───
  // When the user tries to delete a shape that other measurements have
  // snap-followed, we show a modal asking whether to keep dependents (they
  // fall back to last-known coords) or delete them all in one batch.
  const [cascadeState, setCascadeState] = useState<{
    targetIds: string[];
    targetNames: string[];
    dependents: { shape: BaseShape; vertexIndices: number[] }[];
  } | null>(null);

  // Calibration edit dialog state. `shapeId` is set when editing an existing
  // calibration line; null when editing the stale (line-less) ratio.
  const [calibrationEdit, setCalibrationEdit] = useState<{
    shapeId: string | null;
    pixelLength: number;
    defaultMm: number;
  } | null>(null);
  const closeCalibrationEdit = useCallback(() => setCalibrationEdit(null), []);
  const requestEditCalibration = useCallback(
    (shapeId: string | null) => {
      const ppm = imageAdj.adjustments.pixelsPerMm;
      if (shapeId) {
        const shape = shapes.find((s) => s.id === shapeId);
        if (!shape || shape.type !== "calibration" || shape.points.length < 2) return;
        const px = Math.hypot(
          shape.points[1].x - shape.points[0].x,
          shape.points[1].y - shape.points[0].y,
        );
        const currentMm = ppm && ppm > 0 ? px / ppm : 0;
        setCalibrationEdit({ shapeId, pixelLength: px, defaultMm: currentMm });
      } else {
        // Stale ratio edit — no shape to anchor on. Use 100 px as a reference
        // so the user enters "if 100 px = X mm, set ratio".
        const refPx = 100;
        const currentMm = ppm && ppm > 0 ? refPx / ppm : 0;
        setCalibrationEdit({ shapeId: null, pixelLength: refPx, defaultMm: currentMm });
      }
    },
    [shapes, imageAdj.adjustments.pixelsPerMm]
  );

  const applyCalibrationEdit = useCallback(
    (newPpm: number) => {
      if (!calibrationEdit) return;
      imageAdj.setPixelsPerMm(newPpm);
      // If editing an existing calibration shape, also refresh its measurement
      // label so the Measurements tab shows the new mm value.
      if (calibrationEdit.shapeId) {
        const px = calibrationEdit.pixelLength;
        const mm = px / newPpm;
        const mmLabel = mm >= 10 ? `${(mm / 10).toFixed(1)} cm` : `${mm.toFixed(1)} mm`;
        setShapes((prev) =>
          prev.map((s) =>
            s.id === calibrationEdit.shapeId && s.measurement
              ? {
                  ...s,
                  measurement: {
                    ...s.measurement,
                    label: `${Math.round(px)} px = ${mmLabel}`,
                  },
                }
              : s
          )
        );
        autoSave.markDirty();
      }
      setCalibrationEdit(null);
    },
    [calibrationEdit, imageAdj, autoSave]
  );

  const closeCascade = useCallback(() => setCascadeState(null), []);

  const cascadeKeepDependents = useCallback(() => {
    if (!cascadeState) return;
    handleDeleteShapes(cascadeState.targetIds);
    setCascadeState(null);
  }, [cascadeState, handleDeleteShapes]);

  const cascadeDeleteAll = useCallback(() => {
    if (!cascadeState) return;
    const allIds = [
      ...cascadeState.targetIds,
      ...cascadeState.dependents.map((d) => d.shape.id),
    ];
    handleDeleteShapes(allIds);
    setCascadeState(null);
  }, [cascadeState, handleDeleteShapes]);

  // Single entry-point for delete requests from the panel / keyboard. If any
  // of the target shapes have dependents (other shapes whose pointRefs ref
  // them), open the cascade dialog so the user can choose. Otherwise the
  // PropertiesPanel's existing toast confirm handles approval and calls
  // through directly.
  const requestDeleteShapes = useCallback(
    (ids: string[]): { hasDependents: boolean } => {
      // Collect all unique dependents across the targets, excluding any
      // dependents that are themselves in the delete set (no point asking
      // about a shape that's already going).
      const targetSet = new Set(ids);
      const dependentMap = new Map<string, { shape: BaseShape; vertexIndices: number[] }>();
      for (const id of ids) {
        const deps = findDependentsOfShape(id, shapes);
        for (const d of deps) {
          if (targetSet.has(d.shape.id)) continue;
          dependentMap.set(d.shape.id, d);
        }
      }
      if (dependentMap.size === 0) {
        return { hasDependents: false };
      }
      // Build human-readable target labels via the global P# numbering.
      const labels = computeGlobalPointLabels(shapes);
      const targetNames = ids.map((id) => {
        const ps = labels.get(id);
        if (ps && ps.length > 0) return ps[0];
        const shape = shapes.find((s) => s.id === id);
        return shape?.label || shape?.measurementId || shape?.type || id;
      });
      setCascadeState({
        targetIds: ids,
        targetNames,
        dependents: Array.from(dependentMap.values()),
      });
      return { hasDependents: true };
    },
    [shapes]
  );

  const drawing = useDrawingTools({
    activeTool: interaction.activeTool,
    transform: viewport.transform,
    shapes,
    currentStyle,
    imageWidth,
    imageHeight,
    onAddShape: handleAddShape,
    onDeleteShapes: handleDeleteShapes,
  });

  // Fetch annotation for an xray that hasn't been loaded yet. Defined ahead
  // of the useEffect below since the effect calls it for newly-activated grid
  // slots that don't have shapes cached yet.
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
      // Route through the cascade-check first so keyboard Delete/Backspace
      // gets the same dialog flow as the trash icon. If no dependents,
      // requestDeleteShapes returns false and we delete immediately (no
      // toast — keyboard delete is already explicit).
      const { hasDependents } = requestDeleteShapes(shapeIds);
      if (!hasDependents) handleDeleteShapes(shapeIds);
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
  }, [undoRedo, autoSave, handleDeleteShapes, requestDeleteShapes, shapes]);

  // Keep a ref to the latest drawing handler so the window-level keydown
  // listener (mounted once below) always invokes the freshest closure. Without
  // this, every render rebinds the listener via the dep array — and there's a
  // narrow window during cleanup→add where a key press can fall through.
  const drawingHandleKeyDownRef = useRef(drawing.handleKeyDown);
  useEffect(() => {
    drawingHandleKeyDownRef.current = drawing.handleKeyDown;
  });

  // ─── Keyboard Shortcuts (Zoom, Undo/Redo, Save, Panel Toggle) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Drawing tools own all in-progress + pending key handling. They read
      // from refs so they don't miss state set in the same tick. Bump the
      // render tick to flush the SVG layer when they handled the key.
      if (drawingHandleKeyDownRef.current(e)) {
        setRenderTick((n) => n + 1);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Undo — Cmd+Z. Cascading priority so the user always undoes "the last
      // action they took", regardless of which tool they're holding:
      //   1. If a click-tool is mid-draw → pop the last click (vertex / measurement click).
      //   2. Else if a shape is pending confirmation → reject it (treat the
      //      click that produced the pending as the action being undone).
      //   3. Else if line/polyline is active → tool-scoped undo (only their own actions).
      //   4. Else → global undo.
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (drawing.hasInProgressDraw) {
          if (drawing.popLastDrawClick()) {
            setRenderTick((n) => n + 1);
            return;
          }
        }
        if (drawing.pendingShape) {
          drawing.rejectPending();
          setRenderTick((n) => n + 1);
          return;
        }
        if (interaction.activeTool === "line" || interaction.activeTool === "polyline") {
          undoRedo.undoForTools([interaction.activeTool]);
          return;
        }
        undoRedo.undo();
        return;
      }
      // Redo
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRedo.redo();
        return;
      }
      // Save — route through the SaveButton's manual-save path so the
      // "Saved" green flash fires identically to a button click.
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("annotation:trigger-manual-save"));
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
          measurementId: undefined, // re-stamp below so each paste gets a fresh stable ID
        }));
        setShapes((prev) => {
          const stamped: BaseShape[] = [];
          let pool = prev;
          for (const s of pasted) {
            const id = nextMeasurementId(s.type, pool);
            const next = id ? { ...s, measurementId: id } : s;
            stamped.push(next);
            pool = [...pool, next];
            undoRedo.pushCommand("ADD_SHAPE", next.id, null, next);
          }
          return [...prev, ...stamped];
        });
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
    if (interaction.activeTool === "text") return "text";
    return "crosshair";
  };

  // Collect all shapes to render (committed + drawing preview + pending).
  // Dedupe by id — during the commit-pending → onAddShape transition, the same shape
  // can briefly exist in both `shapes` and `pendingShape`. Preview/pending wins.
  const shapeById = new Map<string, BaseShape>();
  for (const s of shapes) shapeById.set(s.id, s);
  if (drawing.drawingShape) shapeById.set(drawing.drawingShape.id, drawing.drawingShape);
  if (drawing.pendingShape) shapeById.set(drawing.pendingShape.shape.id, drawing.pendingShape.shape);
  // Resolve any pointRefs against the live shape map so measurements that
  // snapped to a vertex follow that vertex when it moves. Pure function —
  // returns the original shape (referential equality preserved) when no refs
  // resolved or no points changed.
  const allShapesToRender = Array.from(shapeById.values()).map((s) =>
    resolveShapeRefs(s, shapeById)
  );

  // Globally-unique P# labels for every dot on every point/line/polyline shape.
  // Recomputed each render so adding/removing/reordering shapes keeps labels stable.
  const vertexLabelsByShape = computeGlobalPointLabels(allShapesToRender);

  // Text input screen position
  const textScreenPos = drawing.textInputState.active && drawing.textInputState.position
    ? {
        x: drawing.textInputState.position.x * viewport.transform.zoom + viewport.transform.panX,
        y: drawing.textInputState.position.y * viewport.transform.zoom + viewport.transform.panY,
      }
    : null;

  return (
    <div className="flex h-screen w-screen flex-col" style={{ backgroundColor: "#1A1F36" }}>
      {/* Notes Drawer (portal-style sheet, rendered outside canvas) */}
      <NotesDrawer
        xrayId={xrayId}
        xrayTitle={xrayTitle}
        open={notesOpen}
        onOpenChange={setNotesOpen}
      />

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
        onResetAdjustments={() => { imageAdj.reset(); resetOrientation(); }}
        isAdjustmentsModified={imageAdj.isModified}
        flipped={flipped}
        onFlipChange={setFlipped}
        flippedV={flippedV}
        onFlipVChange={setFlippedV}
        rotation={rotation}
        onRotate90={rotate90}
        inverted={imageAdj.adjustments.invert}
        onInvertChange={imageAdj.setInvert}
        notesCount={notesCount}
        onOpenNotes={() => setNotesOpen(true)}
        onShowShortcuts={() => setShortcutsPanelOpen((prev) => !prev)}
      />

      {/* Main Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Vertical Left Rail Toolbar */}
        <aside
          style={{ width: 44, backgroundColor: "#0a1220", borderRight: "1px solid #1c2738", flexShrink: 0 }}
          className="flex flex-col"
        >
          <AnnotationToolbar
            activeTool={interaction.activeTool}
            onToolChange={(tool) => {
              // Switching tools mid-draw: discard any in-progress click-tool
              // sequence so we don't leave a degenerate stub (e.g. a line
              // committed from click 1 to a stale ghost). Pending shapes
              // still auto-accept since they're already a valid commit.
              if (drawing.pendingShape) drawing.acceptPending();
              if (drawing.isDrawing) {
                drawing.cancelDrawing();
                setRenderTick((n) => n + 1);
              }
              interaction.setActiveTool(tool);
            }}
          />
          <div style={{ flex: 1 }} />
          <div className="pb-2 flex flex-col items-center">
            <ViewModeSwitcher
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </aside>

        {/* Patient Image Sidebar (left of canvas area, after toolbar) */}
        <PatientImageSidebar
          patientId={patientId}
          currentXrayId={xrayId}
          loadedXrayIds={viewMode !== "single" ? gridSlots.filter(s => s.xrayId).map(s => s.xrayId!) : undefined}
          activeGridXrayId={viewMode !== "single" ? (gridSlots[activeSlotIndex]?.xrayId ?? null) : undefined}
          onSelectXray={handleSelectXrayForSlot}
          isOpen={imageSidebarOpen}
          onToggle={() => setImageSidebarOpen((prev) => !prev)}
          enableKeyboardCycling={viewMode === "single"}
        />

        {/* Canvas Area */}
        <div className="relative flex flex-1 flex-col">
          {viewMode === "single" ? (
            <div ref={canvasRootRef} className="relative flex flex-1 flex-col">
              <div
                ref={viewport.containerRef}
                className="relative flex-1 overflow-hidden"
                style={{
                  backgroundColor: "#1A1F36",
                  cursor: getCursor(),
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onDoubleClick={handleDoubleClick}
              >
                <ToolIndicatorChip activeTool={interaction.activeTool} />
                {/* Image Layer */}
                <div
                  className="absolute origin-top-left"
                  style={{
                    transform: `translate(${viewport.transform.panX}px, ${viewport.transform.panY}px) scale(${viewport.transform.zoom})`,
                    willChange: "transform",
                    opacity: viewportReady ? 1 : 0,
                  }}
                >
                  {/* X-ray uses raw <img>: parent-driven CSS transform pipeline
                      (pan/zoom + rotate/flip) plus imageRendering: pixelated at
                      high zoom; Next/Image's responsive optimization wrapper
                      fights this. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={xrayTitle}
                    width={imageWidth}
                    height={imageHeight}
                    style={{
                      filter: imageAdj.cssFilter,
                      imageRendering: viewport.transform.zoom > 2 ? "pixelated" : "auto",
                      display: "block",
                      transform: imageTransform,
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
                          vertexLabels={vertexLabelsByShape.get(shape.id)}
                          selected={interaction.selectedShapeIds.includes(shape.id)}
                          pixelsPerMm={imageAdj.adjustments.pixelsPerMm}
                        />
                      ))}
                    {/* Rubber-band selection rectangle (image-space). Stroke
                        width is divided by zoom so it stays 1px on screen. */}
                    {interaction.marqueeRect && (
                      <rect
                        x={interaction.marqueeRect.x}
                        y={interaction.marqueeRect.y}
                        width={interaction.marqueeRect.width}
                        height={interaction.marqueeRect.height}
                        fill="rgba(83, 58, 253, 0.10)"
                        stroke="#533afd"
                        strokeWidth={1 / viewport.transform.zoom}
                        strokeDasharray={`${4 / viewport.transform.zoom} ${3 / viewport.transform.zoom}`}
                        pointerEvents="none"
                      />
                    )}
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

                {/* Drawing Confirmation (accept/reject) — skipped for calibration
                    (modal dialog) and for line/polyline (commit straight to canvas
                    + show undo button instead, see RecentCommitUndo below). */}
                {drawing.pendingShape &&
                  drawing.pendingShape.shape.type !== "calibration" &&
                  drawing.pendingShape.shape.type !== "polyline" && (
                  <DrawingConfirmation
                    screenX={drawing.pendingShape.screenX}
                    screenY={drawing.pendingShape.screenY}
                    onAccept={drawing.acceptPending}
                    onReject={drawing.rejectPending}
                  />
                )}

                {/* Accept + Undo pill anchored next to a just-committed shape.
                    Auto-disappears after ~3s; Accept dismisses, Undo removes
                    the shape. */}
                {drawing.recentCommit && (
                  <RecentCommitUndo
                    screenX={drawing.recentCommit.screenX}
                    screenY={drawing.recentCommit.screenY}
                    onAccept={drawing.dismissRecentCommit}
                    onUndo={drawing.undoRecentCommit}
                  />
                )}

                {/* Mid-draw pill — anchored at the latest placed vertex during
                    a click-tool draw. For polyline with ≥2 vertices Accept is
                    valid (commits the chain); for line/ruler/calibrate at
                    1 click Accept doesn't apply yet. */}
                {drawing.inProgressUndoAnchor && (
                  <RecentCommitUndo
                    screenX={drawing.inProgressUndoAnchor.x * viewport.transform.zoom + viewport.transform.panX}
                    screenY={drawing.inProgressUndoAnchor.y * viewport.transform.zoom + viewport.transform.panY}
                    onAccept={drawing.canAcceptInProgress
                      ? () => {
                          drawing.acceptInProgress();
                          setRenderTick((n) => n + 1);
                        }
                      : undefined}
                    onUndo={() => {
                      drawing.popLastDrawClick();
                      setRenderTick((n) => n + 1);
                    }}
                  />
                )}

                {/* Calibration dialog — opens when the calibrate tool drops a 2-point line */}
                {drawing.pendingShape && drawing.pendingShape.shape.type === "calibration" && (
                  <CalibrationDialog
                    pixelLength={Math.hypot(
                      drawing.pendingShape.shape.points[1].x - drawing.pendingShape.shape.points[0].x,
                      drawing.pendingShape.shape.points[1].y - drawing.pendingShape.shape.points[0].y,
                    )}
                    onConfirm={(pixelsPerMmValue) => {
                      imageAdj.setPixelsPerMm(pixelsPerMmValue);
                      // Keep the calibration line on canvas so the user can
                      // see WHICH points were calibrated and the px↔mm mapping
                      // shows up in the Measurements tab.
                      const pending = drawing.pendingShape;
                      if (pending) {
                        const cal = pending.shape;
                        const px = Math.hypot(
                          cal.points[1].x - cal.points[0].x,
                          cal.points[1].y - cal.points[0].y,
                        );
                        const mm = px / pixelsPerMmValue;
                        // Format mm with appropriate precision (cm if ≥10mm).
                        const mmLabel = mm >= 10
                          ? `${(mm / 10).toFixed(1)} cm`
                          : `${mm.toFixed(1)} mm`;
                        const calWithMeasurement: BaseShape = {
                          ...cal,
                          measurement: {
                            value: px,
                            unit: "px",
                            calibrated: true,
                            label: `${Math.round(px)} px = ${mmLabel}`,
                          },
                        };
                        handleAddShape(calWithMeasurement);
                      }
                      drawing.rejectPending();
                      setRenderTick((n) => n + 1);
                    }}
                    onCancel={() => {
                      drawing.rejectPending();
                      setRenderTick((n) => n + 1);
                    }}
                  />
                )}

                {/* Polyline finalization is now handled by Enter / double-click /
                    outside-image click. The dedicated Done/X button was removed
                    in favor of the single Undo pill (RecentCommitUndo at the
                    in-progress anchor). */}

                {/* Empty-canvas hint */}
                {shapes.length === 0 && !drawing.drawingShape && !drawing.pendingShape && (
                  <EmptyCanvasHint />
                )}

                {/* Series Strip (right edge) */}
                <SeriesStrip
                  patientId={patientId}
                  currentXrayId={xrayId}
                  xrays={patientSeries}
                  onBeforeNavigate={() => autoSave.saveNow(buildCanvasState(), imageAdj.adjustments)}
                />

                {/* First-run overlay (once per user) */}
                <FirstRunOverlay />
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={slot.imageUrl}
                            alt={slot.title}
                            width={slot.imageWidth}
                            height={slot.imageHeight}
                            style={{
                              filter: imageAdj.cssFilter,
                              imageRendering: viewport.transform.zoom > 2 ? "pixelated" : "auto",
                              display: "block",
                              transform: imageTransform,
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
                        {drawing.pendingShape &&
                          drawing.pendingShape.shape.type !== "polyline" && (
                          <DrawingConfirmation
                            screenX={drawing.pendingShape.screenX}
                            screenY={drawing.pendingShape.screenY}
                            onAccept={drawing.acceptPending}
                            onReject={drawing.rejectPending}
                          />
                        )}
                        {drawing.recentCommit && (
                          <RecentCommitUndo
                            screenX={drawing.recentCommit.screenX}
                            screenY={drawing.recentCommit.screenY}
                            onAccept={drawing.dismissRecentCommit}
                            onUndo={drawing.undoRecentCommit}
                          />
                        )}
                        {drawing.inProgressUndoAnchor && (
                          <RecentCommitUndo
                            screenX={drawing.inProgressUndoAnchor.x * viewport.transform.zoom + viewport.transform.panX}
                            screenY={drawing.inProgressUndoAnchor.y * viewport.transform.zoom + viewport.transform.panY}
                            onAccept={drawing.canAcceptInProgress
                              ? () => {
                                  drawing.acceptInProgress();
                                  setRenderTick((n) => n + 1);
                                }
                              : undefined}
                            onUndo={() => {
                              drawing.popLastDrawClick();
                              setRenderTick((n) => n + 1);
                            }}
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
                      imageTransform={imageTransform}
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
          onSetSelectedShapeIds={interaction.setSelectedShapeIds}
          onToggleVisibility={toggleShapeVisibility}
          onToggleLock={toggleShapeLock}
          onDeleteShapes={handleDeleteShapes}
          onRequestDeleteShapes={requestDeleteShapes}
          onUpdateShape={handleUpdateShape}
          currentStyle={currentStyle}
          onStyleChange={setCurrentStyle}
          isOpen={propertiesPanelOpen}
          onTogglePanel={handleTogglePropertiesPanel}
          pixelsPerMm={imageAdj.adjustments.pixelsPerMm}
          dependentCounts={buildDependentCounts(shapes)}
          onClearCalibration={() => imageAdj.setPixelsPerMm(undefined)}
          onEditCalibration={requestEditCalibration}
        />
      </div>

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel
        isOpen={shortcutsPanelOpen}
        onClose={() => setShortcutsPanelOpen(false)}
      />

      {/* Toast container for confirm-actions (e.g. multi-delete). Sonner
          doesn't have a true center-center position, so we use top-center
          and shift the toast container down with `offset` so it appears
          vertically centered in the viewport. */}
      <Toaster
        position="top-center"
        richColors
        closeButton
        offset="45vh"
      />

      {/* Calibration edit dialog — opens from the Measurements tab edit
          affordance. Re-uses CalibrationDialog with the current mm value
          pre-filled. */}
      {calibrationEdit && (
        <CalibrationDialog
          pixelLength={calibrationEdit.pixelLength}
          defaultMm={calibrationEdit.defaultMm > 0 ? calibrationEdit.defaultMm : undefined}
          onConfirm={applyCalibrationEdit}
          onCancel={closeCalibrationEdit}
        />
      )}

      {/* Cascade-delete dialog — opens when the user tries to delete a
          landmark that other measurements have snap-followed. */}
      {cascadeState && (
        <CascadeDeleteDialog
          targetNames={cascadeState.targetNames}
          dependents={cascadeState.dependents.map((d) => {
            const labels = computeGlobalPointLabels(shapes).get(d.shape.id);
            const baseName =
              d.shape.measurementId ||
              d.shape.label ||
              (labels && labels[0]) ||
              d.shape.type;
            const refList = d.vertexIndices
              .map((i) => labels?.[i] ?? `vertex ${i + 1}`)
              .join(", ");
            return {
              shape: d.shape,
              displayName: `${baseName} (refs ${refList})`,
            };
          })}
          onCancel={closeCascade}
          onKeepDependents={cascadeKeepDependents}
          onDeleteAll={cascadeDeleteAll}
        />
      )}

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
        viewMode={viewMode}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={undoRedo.undo}
        onRedo={undoRedo.redo}
      />
    </div>
  );
}

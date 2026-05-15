"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Minus,
  Pencil,
  Spline,
  Square,
  Circle,
  Type,
  Ruler,
  TriangleRight,
  Scaling,
  Trash2,
  ArrowRight,
  Dot,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import type { BaseShape, ShapeStyle, ShapeType } from "@/types/annotation";
import { ANNOTATION_COLOR_PRESETS, DASH_PATTERN_PRESETS } from "@/types/annotation";
import {
  formatMeasurement,
  computeGlobalPointLabels,
  resolveLandmarkLabelForDisplay,
} from "@/lib/measurements";
import {
  computePelvicAnalysis,
  formatParamValue,
  type ParamResult,
} from "@/lib/pelvic-analysis";

const shapeIcons: Record<ShapeType, React.ReactNode> = {
  point: <Dot size={20} strokeWidth={2.5} />,
  line: <Minus size={14} strokeWidth={1.5} />,
  polyline: <Spline size={14} strokeWidth={1.5} />,
  rectangle: <Square size={14} strokeWidth={1.5} />,
  ellipse: <Circle size={14} strokeWidth={1.5} />,
  freehand: <Pencil size={14} strokeWidth={1.5} />,
  text: <Type size={14} strokeWidth={1.5} />,
  arrow: <ArrowRight size={14} strokeWidth={1.5} />,
  ruler: <Ruler size={14} strokeWidth={1.5} />,
  angle: <TriangleRight size={14} strokeWidth={1.5} />,
  cobb_angle: <Scaling size={14} strokeWidth={1.5} />,
  calibration: <Ruler size={14} strokeWidth={1.5} />,
  landmark: <Dot size={20} strokeWidth={2.5} />,
};

/**
 * Human-readable shape category used in default layer names. Differs from
 * `shape.type` in two places that matter to users:
 *  - A `polyline` with exactly two points was drawn with the LINE tool and
 *    should read as "Line", not "Polyline". A polyline with 3+ points is a
 *    true multi-segment path and keeps the "Polyline" name.
 *  - `cobb_angle` displays as "Cobb angle" instead of the snake_case.
 */
function effectiveDisplayType(shape: BaseShape): string {
  if (shape.type === "polyline" && shape.points.length === 2) return "Line";
  const typeName =
    shape.type.charAt(0).toUpperCase() + shape.type.slice(1).replace("_", " ");
  return typeName;
}

/**
 * Build a Map<shapeId, displayIndex> where the index is scoped PER display
 * type — so two line-shapes get "Line 1" / "Line 2" regardless of how many
 * landmarks or other shape types sit above them in the layer list. Walks in
 * the same sortedShapes order the layers list renders in so the user sees
 * 1 at the top, 2 below, etc.
 */
function buildPerTypeIndices(shapes: BaseShape[]): Map<string, number> {
  const counters = new Map<string, number>();
  const idToIndex = new Map<string, number>();
  for (const s of shapes) {
    const t = effectiveDisplayType(s);
    const next = (counters.get(t) ?? 0) + 1;
    counters.set(t, next);
    idToIndex.set(s.id, next);
  }
  return idToIndex;
}

function getShapeDisplayName(shape: BaseShape, perTypeIndex: number): string {
  if (shape.label) return shape.label;
  return `${effectiveDisplayType(shape)} ${perTypeIndex}`;
}

/**
 * Inline-editable layer name. Double-click to edit; Enter / blur commits;
 * Escape cancels. The displayed text falls through `shape.label` →
 * `getShapeDisplayName`, so committing an empty string clears the custom
 * label and reverts to the auto-generated name.
 */
function LayerNameEditor({
  shape,
  index,
  selected,
  onRename,
}: {
  shape: BaseShape;
  index: number;
  selected: boolean;
  onRename: (id: string, label: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    onRename(shape.id, trimmed === "" ? null : trimmed);
    setEditing(false);
  }, [draft, onRename, shape.id]);

  const cancel = useCallback(() => setEditing(false), []);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          // Don't bubble — keystrokes here shouldn't trigger canvas shortcuts.
          e.stopPropagation();
        }}
        className="flex-1 truncate text-xs"
        style={{
          color: "#061b31",
          background: "#FFFFFF",
          border: "1px solid #533afd",
          borderRadius: 3,
          padding: "1px 4px",
          outline: "none",
          minWidth: 0,
        }}
      />
    );
  }

  const displayName = shape.label ?? getShapeDisplayName(shape, index);
  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(displayName);
        setEditing(true);
      }}
      className="flex-1 truncate text-xs cursor-text select-none"
      style={{
        color: selected ? "#061b31" : "#273951",
      }}
      title="Double-click to rename"
    >
      {displayName}
    </span>
  );
}

function getDashPatternName(dash: number[]): string {
  if (dash.length === 0) return "solid";
  if (dash[0] === 8 && dash[1] === 4) return "dashed";
  if (dash[0] === 2 && dash[1] === 4) return "dotted";
  return "solid";
}

interface PropertiesPanelProps {
  shapes: BaseShape[];
  selectedShapeIds: string[];
  onSelectShape: (id: string) => void;
  /** Replace the entire selection. Used for Cmd/Ctrl+click multi-select. */
  onSetSelectedShapeIds: (ids: string[]) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  /** Delete one or more shapes. Both single trash-icon clicks and the
   *  multi-select bulk delete route through this — they show a toast confirm
   *  before invoking it. */
  onDeleteShapes: (ids: string[]) => void;
  /** Pre-flight check for delete: if any of `ids` have dependents (other
   *  shapes whose pointRefs ref them), this opens the cascade-delete dialog
   *  upstream and returns `{ hasDependents: true }`. Caller skips the toast
   *  confirm in that case (the cascade dialog handles approval). */
  onRequestDeleteShapes?: (ids: string[]) => { hasDependents: boolean };
  onUpdateShape: (id: string, updates: Partial<BaseShape>) => void;
  currentStyle: ShapeStyle;
  onStyleChange: (style: ShapeStyle) => void;
  isOpen: boolean;
  onTogglePanel: () => void;
  /** When set, the Measurements tab converts px values to mm/cm. */
  pixelsPerMm?: number;
  /** Map of shapeId → number-of-dependent-shapes-that-snap-followed-it.
   *  Drives the "used by N" badge next to landmark rows. */
  dependentCounts?: Map<string, number>;
  /** Clears `pixelsPerMm` — used by the stale-calibration banner when there's
   *  no calibration line on canvas to delete. */
  onClearCalibration?: () => void;
  /** Open the calibration edit dialog. `shapeId` is set when the user is
   *  editing an existing calibration line; null when editing the stale
   *  (line-less) calibration ratio. */
  onEditCalibration?: (shapeId: string | null) => void;
  /**
   * Reset the given AI-detected landmarks back to their original positions,
   * in a single undo batch. The Pelvic Analysis section calls this when the
   * user clicks "Reset all" to revert their manual adjustments en masse.
   */
  onResetLandmarksToAi?: (ids: string[]) => void;
}

export function PropertiesPanel({
  shapes,
  selectedShapeIds,
  onSelectShape,
  onSetSelectedShapeIds,
  onToggleVisibility,
  onToggleLock,
  onDeleteShapes,
  onRequestDeleteShapes,
  onUpdateShape,
  currentStyle,
  onStyleChange,
  isOpen,
  onTogglePanel,
  pixelsPerMm,
  dependentCounts,
  onClearCalibration,
  onEditCalibration,
  onResetLandmarksToAi,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<"layers" | "properties" | "measurements">("layers");

  // ─── Selection / multi-select / bulk-delete helpers ───
  // Cmd/Ctrl+click toggles a layer in/out of the selection; plain click
  // replaces the selection with just that layer.
  const handleLayerClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const next = selectedShapeIds.includes(id)
          ? selectedShapeIds.filter((x) => x !== id)
          : [...selectedShapeIds, id];
        onSetSelectedShapeIds(next);
        return;
      }
      onSelectShape(id);
    },
    [selectedShapeIds, onSelectShape, onSetSelectedShapeIds]
  );

  // Confirm-before-delete. Two paths:
  //   1. If any target has dependents (other measurements snap-followed it),
  //      defer to the cascade dialog upstream — it asks "keep / delete all".
  //   2. Otherwise show a sonner toast confirm with a Delete action button.
  // Always asks — even for a single shape — so the user has one undo
  // channel before the destructive action commits.
  const requestBulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      if (onRequestDeleteShapes) {
        const { hasDependents } = onRequestDeleteShapes(ids);
        if (hasDependents) return;
      }
      const count = ids.length;
      const title = count === 1 ? "Delete this item?" : `Delete ${count} items?`;
      toast(title, {
        description: "This can be undone with Cmd+Z right after.",
        action: {
          label: "Delete",
          onClick: () => onDeleteShapes(ids),
        },
        cancel: { label: "Cancel", onClick: () => {} },
        duration: 8_000,
      });
    },
    [onDeleteShapes, onRequestDeleteShapes]
  );

  // Click on the trash icon: if this row is part of a multi-selection,
  // delete ALL selected; otherwise prompt to delete just this row.
  const handleDeleteIconClick = useCallback(
    (id: string) => {
      const targets =
        selectedShapeIds.length > 1 && selectedShapeIds.includes(id)
          ? selectedShapeIds
          : [id];
      requestBulkDelete(targets);
    },
    [selectedShapeIds, requestBulkDelete]
  );

  // Defensive dedupe — if `shapes` ever contains two entries with the same id
  // (HMR / autosave race / paste collision), the layers map below would render
  // two siblings with `key={shape.id}` and trigger a React warning. First-wins
  // mirrors what the canvas SVG dedupe does for the rendered shape.
  const seenIds = new Set<string>();
  const dedupedShapes: BaseShape[] = [];
  for (const s of shapes) {
    if (seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    dedupedShapes.push(s);
  }
  // Layers list shows smallest # on top: the first-drawn shape sits at the
  // top of its type group, the latest at the bottom. zIndex is assigned
  // monotonically at creation (getNextZIndex = max+1), so ascending zIndex
  // == creation order == numeric suffix order ("Line 1" above "Line 2").
  const sortedShapes = [...dedupedShapes].sort((a, b) => a.zIndex - b.zIndex);
  const selectedShape =
    selectedShapeIds.length === 1
      ? dedupedShapes.find((s) => s.id === selectedShapeIds[0])
      : null;

  // Per-display-type counters so Line / Polyline / Ruler / etc. each get
  // their own 1-based sequence in the layer name fallback. Built once over
  // sortedShapes (top-down) so the topmost row of a given type is #1.
  const perTypeIndices = buildPerTypeIndices(sortedShapes);

  // Globally-unique P# labels for every dot on every point/line/polyline.
  // Same source-of-truth as the canvas renderer so layer panel and dot labels
  // stay in lockstep.
  const vertexLabelsByShape = computeGlobalPointLabels(dedupedShapes);

  // Collapsed: thin 32px column with an icon-only toggle at the top. The column
  // stays in the flex row so it does NOT overlay the SeriesStrip/canvas. The
  // shape-count badge sits below the icon when shapes exist.
  if (!isOpen) {
    return (
      <div
        className="flex flex-col items-center"
        style={{
          width: 32,
          backgroundColor: "#FFFFFF",
          borderLeft: "1px solid #e5edf5",
          paddingTop: 8,
          gap: 6,
        }}
      >
        <button
          onClick={onTogglePanel}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; e.currentTarget.style.color = "#0A2540"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#64748d"; }}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            color: "#64748d",
          }}
          title="Show layers panel (\\)"
          aria-label="Show layers panel"
        >
          <PanelRightOpen size={14} strokeWidth={1.5} />
        </button>
        {shapes.length > 0 && (
          <span
            className="rounded-full px-1.5"
            style={{
              fontSize: 10,
              fontWeight: 600,
              backgroundColor: "#ededfc",
              color: "#533afd",
              minWidth: 18,
              textAlign: "center",
            }}
            title={`${shapes.length} annotation${shapes.length === 1 ? "" : "s"}`}
          >
            {shapes.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 280,
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid #e5edf5",
      }}
    >
      {/* Tab Header — content-sized tabs, evenly distributed with gap, with
          a right-margin breathing room before the close-icon separator. */}
      <div
        className="flex items-center"
        style={{ borderBottom: "1px solid #e5edf5" }}
      >
        <div
          className="flex flex-1 items-center"
          style={{ gap: 16, paddingLeft: 12, paddingRight: 20 }}
        >
          <button
            onClick={() => setActiveTab("layers")}
            onMouseEnter={(e) => { if (activeTab !== "layers") e.currentTarget.style.color = "#0A2540"; }}
            onMouseLeave={(e) => { if (activeTab !== "layers") e.currentTarget.style.color = "#64748d"; }}
            className="py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === "layers" ? "#533afd" : "#64748d",
              borderBottom: activeTab === "layers" ? "2px solid #533afd" : "2px solid transparent",
            }}
          >
            Layers
          </button>
          <button
            onClick={() => setActiveTab("properties")}
            onMouseEnter={(e) => { if (activeTab !== "properties") e.currentTarget.style.color = "#0A2540"; }}
            onMouseLeave={(e) => { if (activeTab !== "properties") e.currentTarget.style.color = "#64748d"; }}
            className="py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === "properties" ? "#533afd" : "#64748d",
              borderBottom: activeTab === "properties" ? "2px solid #533afd" : "2px solid transparent",
            }}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab("measurements")}
            onMouseEnter={(e) => { if (activeTab !== "measurements") e.currentTarget.style.color = "#0A2540"; }}
            onMouseLeave={(e) => { if (activeTab !== "measurements") e.currentTarget.style.color = "#64748d"; }}
            className="py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === "measurements" ? "#533afd" : "#64748d",
              borderBottom: activeTab === "measurements" ? "2px solid #533afd" : "2px solid transparent",
            }}
          >
            Measurements
          </button>
        </div>
        <button
          onClick={onTogglePanel}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f6f9fc"; e.currentTarget.style.color = "#0A2540"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#64748d"; }}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 32,
            height: 32,
            color: "#64748d",
            borderLeft: "1px solid #e5edf5",
          }}
          title="Hide panel (\\)"
          aria-label="Hide properties panel"
        >
          <PanelRightClose size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "layers" && (
          <div role="listbox" aria-label="Annotation layers" className="py-1">
            {sortedShapes.length === 0 && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: "#64748d" }}>
                No annotations yet.
                <br />
                Use the toolbar to start drawing.
              </div>
            )}
            {sortedShapes.map((shape, index) => {
              const isSelected = selectedShapeIds.includes(shape.id);
              // Show vertex children for shapes with multiple labeled, snap-target
              // vertices (line, polyline, ruler, angle, cobb). Point shapes already
              // ARE a single dot — their parent row carries the P# label.
              const showVertexChildren =
                shape.type === "line" ||
                shape.type === "polyline" ||
                shape.type === "ruler" ||
                shape.type === "angle" ||
                shape.type === "cobb_angle";
              const vertexLabels = vertexLabelsByShape.get(shape.id) ?? [];
              return (
                <div key={shape.id}>
                  <div
                    role="option"
                    aria-selected={isSelected}
                    onClick={(e) => handleLayerClick(shape.id, e)}
                    className="flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isSelected ? "#ededfc" : "transparent",
                    }}
                    title="Click to select. Click checkbox or Cmd/Ctrl+click to add to multi-selection."
                  >
                    {/* Checkbox replaces the old drag-handle (GripVertical) so
                        multi-select is discoverable without modifier keys.
                        Toggling here always adds/removes this shape from the
                        current selection (independent of single-click). */}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = isSelected
                          ? selectedShapeIds.filter((x) => x !== shape.id)
                          : [...selectedShapeIds, shape.id];
                        onSetSelectedShapeIds(next);
                      }}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          e.stopPropagation();
                          const next = isSelected
                            ? selectedShapeIds.filter((x) => x !== shape.id)
                            : [...selectedShapeIds, shape.id];
                          onSetSelectedShapeIds(next);
                        }
                      }}
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 14,
                        height: 14,
                        flexShrink: 0,
                        cursor: "pointer",
                        borderRadius: 3,
                        border: `1.5px solid ${isSelected ? "#533afd" : "#A3ACB9"}`,
                        backgroundColor: isSelected ? "#533afd" : "transparent",
                        color: "#FFFFFF",
                      }}
                    >
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8L7 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="flex items-center justify-center"
                      style={{
                        width: 20,
                        height: 20,
                        color: isSelected ? "#533afd" : "#64748d",
                        flexShrink: 0,
                      }}
                    >
                      {shapeIcons[shape.type]}
                    </span>
                    <LayerNameEditor
                      shape={shape}
                      index={perTypeIndices.get(shape.id) ?? index + 1}
                      selected={isSelected}
                      onRename={(id, label) => onUpdateShape(id, { label })}
                    />
                    {/* "used by N" badge: this shape is referenced by N other
                        measurements via pointRefs. Warns the user that
                        deleting it will trigger the cascade dialog. */}
                    {dependentCounts && (dependentCounts.get(shape.id) ?? 0) > 0 && (
                      <span
                        className="flex items-center justify-center text-[10px] font-medium"
                        style={{
                          height: 16,
                          minWidth: 16,
                          padding: "0 5px",
                          borderRadius: 8,
                          backgroundColor: "#FEF6E6",
                          color: "#9A6712",
                          border: "1px solid #F5E0B5",
                          flexShrink: 0,
                        }}
                        title={`${dependentCounts.get(shape.id)} measurement${dependentCounts.get(shape.id) === 1 ? "" : "s"} reference this shape`}
                      >
                        ↺ {dependentCounts.get(shape.id)}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(shape.id);
                      }}
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 20,
                        height: 20,
                        color: shape.visible ? "#64748d" : "#A3ACB9",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#0A2540")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = shape.visible ? "#64748d" : "#A3ACB9")}
                      aria-label={shape.visible ? "Hide shape" : "Show shape"}
                    >
                      {shape.visible ? (
                        <Eye size={12} strokeWidth={1.5} />
                      ) : (
                        <EyeOff size={12} strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(shape.id);
                      }}
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 20,
                        height: 20,
                        color: shape.locked ? "#533afd" : "#A3ACB9",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#533afd")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = shape.locked ? "#533afd" : "#A3ACB9")}
                      aria-label={shape.locked ? "Unlock shape" : "Lock shape"}
                    >
                      {shape.locked ? (
                        <Lock size={12} strokeWidth={1.5} />
                      ) : (
                        <Unlock size={12} strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteIconClick(shape.id);
                      }}
                      className="flex items-center justify-center transition-colors"
                      style={{
                        width: 20,
                        height: 20,
                        color: "#A3ACB9",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#DF1B41")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#A3ACB9")}
                      aria-label="Delete shape"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                  {/* Sub-row showing the vertex chain that makes up the line/
                      polyline (e.g. "○ P3 — ○ P4 — ○ P5"). Indented and muted so
                      the parent row stays the focus; click still selects the
                      whole parent shape. */}
                  {showVertexChildren && vertexLabels.length > 0 && (() => {
                    // Translate any LANDMARK_LABEL_SENTINEL entries into the
                    // actual landmark display name ("Iliac crest 1" etc.)
                    // before we render. Falls back to the raw label if the
                    // ref can't be resolved.
                    const displayLabels = vertexLabels.map(
                      (l, vi) =>
                        resolveLandmarkLabelForDisplay(l, shape.pointRefs, vi, shapes) ?? l,
                    );
                    return (
                      <div
                        onClick={(e) => handleLayerClick(shape.id, e)}
                        className="flex flex-wrap items-center cursor-pointer"
                        style={{
                          paddingLeft: 38,
                          paddingRight: 8,
                          paddingTop: 1,
                          paddingBottom: 3,
                          rowGap: 2,
                          backgroundColor: isSelected ? "rgba(83, 58, 253, 0.04)" : "transparent",
                        }}
                        title={`${displayLabels.join(" — ")} (vertices of ${getShapeDisplayName(shape, perTypeIndices.get(shape.id) ?? index + 1)})`}
                      >
                        {displayLabels.map((label, vi) => (
                          <span key={`${shape.id}:${vi}`} className="flex items-center gap-1">
                            {vi > 0 && (
                              <span className="text-[11px]" style={{ color: "#A3ACB9", padding: "0 4px" }}>
                                —
                              </span>
                            )}
                            {/* Hollow ring matching the on-canvas dot style */}
                            <span
                              aria-hidden="true"
                              className="inline-block"
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                border: `1.5px solid ${shape.style.strokeColor}`,
                                backgroundColor: "transparent",
                                flexShrink: 0,
                              }}
                            />
                            <span className="text-[11px] tabular-nums" style={{ color: "#64748d" }}>
                              {label}
                            </span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "properties" && (
          <div className="p-3">
            {selectedShape ? (
              <ShapeProperties
                shape={selectedShape}
                onUpdate={(updates) => onUpdateShape(selectedShape.id, updates)}
              />
            ) : selectedShapeIds.length > 1 ? (
              <div className="py-6 text-center text-xs" style={{ color: "#64748d" }}>
                {selectedShapeIds.length} shapes selected
              </div>
            ) : (
              <DefaultStyleEditor
                style={currentStyle}
                onChange={onStyleChange}
              />
            )}
          </div>
        )}

        {activeTab === "measurements" && (
          <>
            <PelvicAnalysisSection
              shapes={shapes}
              pixelsPerMm={pixelsPerMm}
              onResetLandmarksToAi={onResetLandmarksToAi}
            />
            <MeasurementSummary
              shapes={shapes}
              selectedShapeIds={selectedShapeIds}
              onLayerClick={handleLayerClick}
              pixelsPerMm={pixelsPerMm}
              onClearCalibration={onClearCalibration}
              onEditCalibration={onEditCalibration}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shape Properties Editor ───

function ShapeProperties({
  shape,
  onUpdate,
}: {
  shape: BaseShape;
  onUpdate: (updates: Partial<BaseShape>) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Label */}
      <PropertyField label="Label">
        <input
          type="text"
          value={shape.label ?? ""}
          onChange={(e) => onUpdate({ label: e.target.value || null })}
          placeholder="Add label..."
          className="w-full text-xs px-2 py-1"
          style={{
            border: "1px solid #e5edf5",
            borderRadius: 4,
            backgroundColor: "#f6f9fc",
            color: "#061b31",
          }}
        />
      </PropertyField>

      {/* Type (read-only) */}
      <PropertyField label="Type">
        <p className="text-xs" style={{ color: "#273951" }}>
          {shape.type.charAt(0).toUpperCase() + shape.type.slice(1).replace("_", " ")}
        </p>
      </PropertyField>

      {/* Reset to AI — only visible for landmarks the user has dragged. */}
      {shape.type === "landmark" &&
        shape.landmarkSource === "manual" &&
        shape.landmarkOriginalX != null &&
        shape.landmarkOriginalY != null && (
          <PropertyField label="AI suggestion">
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  points: [
                    {
                      x: shape.landmarkOriginalX!,
                      y: shape.landmarkOriginalY!,
                    },
                  ],
                  landmarkSource: "ai",
                })
              }
              className="text-xs px-2 py-1 transition-colors"
              style={{
                border: "1px solid #e5edf5",
                borderRadius: 4,
                backgroundColor: "#ffffff",
                color: "#533afd",
              }}
              title="Snap this landmark back to its original AI-suggested position."
            >
              Reset to AI position
            </button>
          </PropertyField>
        )}

      {/* Stroke Color */}
      <PropertyField label="Stroke color">
        <ColorPicker
          value={shape.style.strokeColor}
          onChange={(color) =>
            onUpdate({ style: { ...shape.style, strokeColor: color } })
          }
        />
      </PropertyField>

      {/* Stroke Width */}
      <PropertyField label="Stroke width">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={shape.style.strokeWidth}
            onChange={(e) =>
              onUpdate({
                style: { ...shape.style, strokeWidth: parseFloat(e.target.value) },
              })
            }
            className="flex-1"
          />
          <span className="text-xs tabular-nums w-8 text-right" style={{ color: "#273951" }}>
            {shape.style.strokeWidth}px
          </span>
        </div>
      </PropertyField>

      {/* Opacity */}
      <PropertyField label="Opacity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={shape.style.strokeOpacity}
            onChange={(e) =>
              onUpdate({
                style: { ...shape.style, strokeOpacity: parseFloat(e.target.value) },
              })
            }
            className="flex-1"
          />
          <span className="text-xs tabular-nums w-8 text-right" style={{ color: "#273951" }}>
            {Math.round(shape.style.strokeOpacity * 100)}%
          </span>
        </div>
      </PropertyField>

      {/* Fill Color */}
      <PropertyField label="Fill color">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
            <input
              type="checkbox"
              checked={shape.style.fillColor !== null}
              onChange={(e) =>
                onUpdate({
                  style: {
                    ...shape.style,
                    fillColor: e.target.checked ? shape.style.strokeColor : null,
                    fillOpacity: e.target.checked ? 0.2 : 0,
                  },
                })
              }
            />
            Fill
          </label>
          {shape.style.fillColor && (
            <ColorPicker
              value={shape.style.fillColor}
              onChange={(color) =>
                onUpdate({ style: { ...shape.style, fillColor: color } })
              }
            />
          )}
        </div>
      </PropertyField>

      {/* Dash Pattern */}
      <PropertyField label="Dash pattern">
        <select
          value={getDashPatternName(shape.style.lineDash)}
          onChange={(e) =>
            onUpdate({
              style: {
                ...shape.style,
                lineDash: DASH_PATTERN_PRESETS[e.target.value] ?? [],
              },
            })
          }
          className="w-full text-xs px-2 py-1"
          style={{
            border: "1px solid #e5edf5",
            borderRadius: 4,
            backgroundColor: "#f6f9fc",
            color: "#061b31",
          }}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </PropertyField>

      {/* Position */}
      <PropertyField label="Position">
        <div className="flex gap-2">
          <NumberInput
            label="X"
            value={Math.round(shape.x)}
            onChange={(v) => onUpdate({ x: v })}
          />
          <NumberInput
            label="Y"
            value={Math.round(shape.y)}
            onChange={(v) => onUpdate({ y: v })}
          />
        </div>
      </PropertyField>

      {/* Size (for text) */}
      {shape.type === "text" && (
        <PropertyField label="Size">
          <div className="flex gap-2">
            <NumberInput
              label="W"
              value={Math.round(shape.width)}
              onChange={(v) => onUpdate({ width: Math.max(1, v) })}
            />
            <NumberInput
              label="H"
              value={Math.round(shape.height)}
              onChange={(v) => onUpdate({ height: Math.max(1, v) })}
            />
          </div>
        </PropertyField>
      )}

      {/* Rotation */}
      <PropertyField label="Rotation">
        <NumberInput
          label="°"
          value={Math.round(shape.rotation)}
          onChange={(v) => onUpdate({ rotation: v % 360 })}
        />
      </PropertyField>

      {/* Locked */}
      <PropertyField label="Locked">
        <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
          <input
            type="checkbox"
            checked={shape.locked}
            onChange={(e) => onUpdate({ locked: e.target.checked })}
          />
          Lock shape
        </label>
      </PropertyField>

      {/* ─── Type-Specific Properties ─── */}

      {/* Text */}
      {shape.type === "text" && (
        <>
          <PropertyField label="Font size">
            <NumberInput
              label="px"
              value={shape.fontSize ?? 16}
              onChange={(v) => onUpdate({ fontSize: Math.max(8, Math.min(120, v)) })}
            />
          </PropertyField>
          <PropertyField label="Font weight">
            <select
              value={shape.fontWeight ?? 400}
              onChange={(e) =>
                onUpdate({ fontWeight: parseInt(e.target.value) as 400 | 500 | 600 | 700 })
              }
              className="w-full text-xs px-2 py-1"
              style={{
                border: "1px solid #e5edf5",
                borderRadius: 4,
                backgroundColor: "#f6f9fc",
                color: "#061b31",
              }}
            >
              <option value={400}>Regular</option>
              <option value={500}>Medium</option>
              <option value={600}>Semibold</option>
              <option value={700}>Bold</option>
            </select>
          </PropertyField>
          <PropertyField label="Font style">
            <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
              <input
                type="checkbox"
                checked={shape.fontStyle === "italic"}
                onChange={(e) => onUpdate({ fontStyle: e.target.checked ? "italic" : "normal" })}
              />
              Italic
            </label>
          </PropertyField>
          <PropertyField label="Text align">
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  onClick={() => onUpdate({ textAlign: align })}
                  className="flex-1 py-1 text-xs capitalize"
                  style={{
                    border: "1px solid #e5edf5",
                    borderRadius: 4,
                    backgroundColor: (shape.textAlign ?? "left") === align ? "#ededfc" : "#f6f9fc",
                    color: (shape.textAlign ?? "left") === align ? "#533afd" : "#273951",
                  }}
                >
                  {align}
                </button>
              ))}
            </div>
          </PropertyField>
          <PropertyField label="Background">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
                <input
                  type="checkbox"
                  checked={shape.textBackground !== null && shape.textBackground !== undefined}
                  onChange={(e) =>
                    onUpdate({ textBackground: e.target.checked ? "rgba(0,0,0,0.5)" : null })
                  }
                />
                Background
              </label>
            </div>
          </PropertyField>
        </>
      )}

      {/* ─── Measurement-Specific Properties ─── */}

      {/* Ruler */}
      {shape.type === "ruler" && (
        <>
          {shape.measurement && (
            <PropertyField label="Measurement">
              <p className="text-sm font-medium tabular-nums" style={{ color: "#00D4AA" }}>
                {shape.measurement.label}
              </p>
              <span
                className="inline-block mt-1 px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: shape.measurement.calibrated ? "#e6f9f3" : "#fef9e7",
                  color: shape.measurement.calibrated ? "#30B130" : "#F5A623",
                }}
              >
                {shape.measurement.calibrated ? "Calibrated" : "Uncalibrated"}
              </span>
            </PropertyField>
          )}
          <PropertyField label="End ticks">
            <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
              <input
                type="checkbox"
                checked={shape.showEndTicks !== false}
                onChange={(e) => onUpdate({ showEndTicks: e.target.checked })}
              />
              Show end ticks
            </label>
          </PropertyField>
          <PropertyField label="Label position">
            <select
              value={shape.labelPosition ?? "auto"}
              onChange={(e) => onUpdate({ labelPosition: e.target.value as "above" | "below" | "auto" })}
              className="w-full text-xs px-2 py-1"
              style={{ border: "1px solid #e5edf5", borderRadius: 4, backgroundColor: "#f6f9fc", color: "#061b31" }}
            >
              <option value="auto">Auto</option>
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
          </PropertyField>
        </>
      )}

      {/* Angle */}
      {shape.type === "angle" && shape.measurement && (
        <>
          <PropertyField label="Angle">
            <p className="text-sm font-medium tabular-nums" style={{ color: "#00D4AA" }}>
              {shape.measurement.label}
            </p>
          </PropertyField>
          <PropertyField label="Supplementary">
            <p className="text-xs tabular-nums" style={{ color: "#273951" }}>
              {(180 - shape.measurement.value).toFixed(1)}°
            </p>
          </PropertyField>
          <PropertyField label="Show supplementary">
            <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
              <input
                type="checkbox"
                checked={shape.showSupplementary ?? false}
                onChange={(e) => onUpdate({ showSupplementary: e.target.checked })}
              />
              Show supplementary
            </label>
          </PropertyField>
          <PropertyField label="Arc radius">
            <div className="flex items-center gap-2">
              <input
                type="range" min={15} max={60} step={1}
                value={shape.arcRadius ?? 30}
                onChange={(e) => onUpdate({ arcRadius: parseInt(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs tabular-nums w-8 text-right" style={{ color: "#273951" }}>
                {shape.arcRadius ?? 30}px
              </span>
            </div>
          </PropertyField>
        </>
      )}

      {/* Cobb Angle */}
      {shape.type === "cobb_angle" && shape.measurement && (
        <>
          <PropertyField label="Cobb angle">
            <p className="text-sm font-medium tabular-nums" style={{ color: "#00D4AA" }}>
              {shape.measurement.value.toFixed(1)}°
            </p>
          </PropertyField>
          <PropertyField label="Classification">
            <span
              className="inline-block px-2 py-0.5 text-xs rounded-full font-medium"
              style={{
                backgroundColor:
                  shape.cobbClassification === "Mild" ? "#e6f9f3"
                    : shape.cobbClassification === "Moderate" ? "#fef9e7"
                      : "#fde8ec",
                color:
                  shape.cobbClassification === "Mild" ? "#30B130"
                    : shape.cobbClassification === "Moderate" ? "#F5A623"
                      : "#DF1B41",
              }}
            >
              {shape.cobbClassification}
            </span>
          </PropertyField>
          <PropertyField label="Perpendiculars">
            <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
              <input
                type="checkbox"
                checked={shape.showPerpendiculars !== false}
                onChange={(e) => onUpdate({ showPerpendiculars: e.target.checked })}
              />
              Show perpendiculars
            </label>
          </PropertyField>
          <PropertyField label="Classification label">
            <label className="flex items-center gap-1 text-xs" style={{ color: "#273951" }}>
              <input
                type="checkbox"
                checked={shape.showClassification !== false}
                onChange={(e) => onUpdate({ showClassification: e.target.checked })}
              />
              Show classification
            </label>
          </PropertyField>
        </>
      )}

      {/* Generic measurement fallback */}
      {shape.measurement && shape.type !== "ruler" && shape.type !== "angle"
        && shape.type !== "cobb_angle" && (
        <PropertyField label="Measurement">
          <p className="text-sm font-medium tabular-nums" style={{ color: "#533afd" }}>
            {shape.measurement.label}
          </p>
        </PropertyField>
      )}
    </div>
  );
}

// ─── Measurement Summary Tab ───

function MeasurementSummary({
  shapes,
  selectedShapeIds,
  onLayerClick,
  pixelsPerMm,
  onClearCalibration,
  onEditCalibration,
}: {
  shapes: BaseShape[];
  selectedShapeIds: string[];
  onLayerClick: (id: string, e: React.MouseEvent) => void;
  pixelsPerMm?: number;
  onClearCalibration?: () => void;
  onEditCalibration?: (shapeId: string | null) => void;
}) {
  const measurementShapes = shapes.filter(
    (s) => s.measurement && s.visible
  );
  const hasCalibrationShape = shapes.some((s) => s.type === "calibration");
  // "Stale" calibration: pixelsPerMm is set but the calibration line itself
  // wasn't preserved (data from before we started keeping the shape on canvas).
  // Surface a small banner so the user can see and optionally clear it.
  const showStaleCalibrationBanner =
    pixelsPerMm != null && pixelsPerMm > 0 && !hasCalibrationShape;

  return (
    <div className="p-3">
      <p className="text-xs font-medium mb-2" style={{ color: "#061b31" }}>
        Measurement Summary
      </p>
      {showStaleCalibrationBanner && (
        <div
          className="mb-2 flex items-center gap-2 px-2 py-1.5"
          style={{
            backgroundColor: "#FEF6E6",
            border: "1px solid #F5E0B5",
            borderRadius: 4,
            fontSize: 11,
            color: "#9A6712",
          }}
          title="This image is calibrated but the calibration line wasn't saved (older data). Edit the ratio or Clear to remove."
        >
          <span className="flex-1">
            <strong>Calibrated</strong> — 1 mm = {pixelsPerMm.toFixed(2)} px
          </span>
          {onEditCalibration && (
            <button
              type="button"
              onClick={() => onEditCalibration(null)}
              className="transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#9A6712",
                textDecoration: "underline",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          )}
          {onClearCalibration && (
            <button
              type="button"
              onClick={onClearCalibration}
              className="transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#9A6712",
                textDecoration: "underline",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      {measurementShapes.length === 0 ? (
        <div className="py-6 text-center text-xs" style={{ color: "#64748d" }}>
          No measurements yet.
          <br />
          Use Line (L), Angle (A), or Cobb (Shift+A).
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Header */}
          <div className="flex items-center gap-2 pb-1 mb-1" style={{ borderBottom: "1px solid #e5edf5" }}>
            <span className="w-5 text-xs font-medium" style={{ color: "#64748d" }}>#</span>
            <span className="flex-1 text-xs font-medium" style={{ color: "#64748d" }}>Type</span>
            <span className="text-xs font-medium text-right" style={{ color: "#64748d", minWidth: 60 }}>Value</span>
          </div>
          {measurementShapes.map((s, i) => {
            const isSelected = selectedShapeIds.includes(s.id);
            const toggleCheckbox = (e: React.MouseEvent | React.KeyboardEvent) => {
              e.stopPropagation();
              // Use the same onLayerClick path with a synthetic Cmd-modified
              // event so toggling the checkbox is functionally identical to
              // Cmd+click on the row (adds/removes from the multi-selection).
              const synthetic = { ...e, metaKey: true, ctrlKey: false } as React.MouseEvent;
              onLayerClick(s.id, synthetic);
            };
            return (
              <div
                key={s.id}
                onClick={(e) => onLayerClick(s.id, e)}
                className="flex items-center gap-2 w-full py-1 px-0.5 rounded transition-colors text-left cursor-pointer"
                style={{ backgroundColor: isSelected ? "#ededfc" : "transparent" }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "#f6f9fc"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                title="Click to select. Click checkbox or Cmd/Ctrl+click to add to multi-selection."
              >
                <span
                  onClick={toggleCheckbox}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleCheckbox(e);
                    }
                  }}
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: 14,
                    height: 14,
                    flexShrink: 0,
                    cursor: "pointer",
                    borderRadius: 3,
                    border: `1.5px solid ${isSelected ? "#533afd" : "#A3ACB9"}`,
                    backgroundColor: isSelected ? "#533afd" : "transparent",
                    color: "#FFFFFF",
                  }}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L7 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="w-5 text-xs tabular-nums" style={{ color: isSelected ? "#533afd" : "#64748d" }}>{i + 1}</span>
                <span className="flex items-center gap-1 flex-1 text-xs" style={{ color: isSelected ? "#061b31" : "#273951" }}>
                  {shapeIcons[s.type]}
                  {s.type === "calibration"
                    ? "Calibration"
                    : (s.label || s.type.replace("_", " "))}
                </span>
                <span
                  className="text-xs font-medium tabular-nums text-right"
                  style={{
                    color: s.type === "calibration" ? "#9A6712" : "#00D4AA",
                    minWidth: 60,
                  }}
                >
                  {/* Calibration shapes display their stored "100 px = 25 mm"
                      label verbatim — they're the source of the px↔mm mapping
                      and showing both is more informative than a converted
                      single value. */}
                  {s.type === "calibration"
                    ? s.measurement!.label
                    : formatMeasurement(s.measurement!.value, s.measurement!.unit, pixelsPerMm ?? null)}
                </span>
                {s.type === "calibration" && onEditCalibration && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditCalibration(s.id);
                    }}
                    className="flex items-center justify-center transition-colors"
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      color: "#9A6712",
                      borderRadius: 3,
                      cursor: "pointer",
                      background: "transparent",
                      border: "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FEF6E6"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    title="Edit calibration value"
                    aria-label="Edit calibration"
                  >
                    <Pencil size={11} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

// ─── Default Style Editor (shown when nothing selected) ───

function DefaultStyleEditor({
  style,
  onChange,
}: {
  style: ShapeStyle;
  onChange: (style: ShapeStyle) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium" style={{ color: "#061b31" }}>
        Default Style
      </p>
      <p className="text-xs" style={{ color: "#64748d" }}>
        New shapes will use these settings.
      </p>
      <PropertyField label="Stroke color">
        <ColorPicker
          value={style.strokeColor}
          onChange={(color) => onChange({ ...style, strokeColor: color })}
        />
      </PropertyField>
      <PropertyField label="Stroke width">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={style.strokeWidth}
            onChange={(e) =>
              onChange({ ...style, strokeWidth: parseFloat(e.target.value) })
            }
            className="flex-1"
          />
          <span className="text-xs tabular-nums w-8 text-right" style={{ color: "#273951" }}>
            {style.strokeWidth}px
          </span>
        </div>
      </PropertyField>
    </div>
  );
}

// ─── Reusable Components ───

function PropertyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: "#061b31" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ANNOTATION_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className="flex items-center justify-center"
          title={color}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            backgroundColor: color,
            border: value === color ? "2px solid #533afd" : "1px solid #e5edf5",
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer"
        style={{ width: 24, height: 24, padding: 0, border: "none" }}
        title="Custom color"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs" style={{ color: "#64748d" }}>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="w-16 text-xs px-1.5 py-1 tabular-nums"
        style={{
          border: "1px solid #e5edf5",
          borderRadius: 4,
          backgroundColor: "#f6f9fc",
          color: "#061b31",
        }}
      />
    </div>
  );
}

// ─── Pelvic Analysis Section ───
//
// Mounted at the top of the Measurements tab when at least one landmark
// shape is present. Recomputes the four Heliyon parameters (FHHD, ICHD,
// ALFHRF, DOCS) on every render — landmark drags push fresh `shapes` props
// through, so values stay live without any explicit listener.
//
// Each row renders the computed value when all required landmarks are
// present; otherwise it lists the missing landmark names so the user knows
// what to place. When px-only (no calibration), a one-line hint nudges the
// user toward the calibration tool.
function PelvicAnalysisSection({
  shapes,
  pixelsPerMm,
  onResetLandmarksToAi,
}: {
  shapes: BaseShape[];
  pixelsPerMm?: number;
  onResetLandmarksToAi?: (ids: string[]) => void;
}) {
  const landmarkShapes = shapes.filter(
    (s) => s.type === "landmark" && s.visible && s.points.length >= 1,
  );
  const landmarks = landmarkShapes
    .map((s) => ({
      name: s.landmarkName ?? "",
      x: s.points[0].x,
      y: s.points[0].y,
    }))
    .filter((l) => l.name !== "");

  if (landmarks.length === 0) return null;

  // Manual landmarks that still remember where the AI placed them are the
  // candidates for "Reset all" — anything else either is still AI-placed or
  // was hand-drawn from scratch and has no original to revert to.
  const resettableIds = landmarkShapes
    .filter(
      (s) =>
        s.landmarkSource === "manual" &&
        s.landmarkOriginalX != null &&
        s.landmarkOriginalY != null,
    )
    .map((s) => s.id);

  const analysis = computePelvicAnalysis(landmarks, pixelsPerMm ?? null);
  const params: ParamResult[] = [
    analysis.fhhd,
    analysis.ichd,
    analysis.alfhrf,
    analysis.docs,
  ];
  const hasMm = pixelsPerMm != null && pixelsPerMm > 0;

  return (
    <div
      className="p-3"
      style={{ borderBottom: "1px solid #e5edf5" }}
    >
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <p className="text-xs font-medium" style={{ color: "#061b31" }}>
          Pelvic Analysis
        </p>
        <div className="flex items-baseline gap-2">
          {resettableIds.length > 0 && onResetLandmarksToAi && (
            <button
              type="button"
              onClick={() => onResetLandmarksToAi(resettableIds)}
              className="text-[10px] transition-colors"
              style={{ color: "#533afd" }}
              title={`Revert ${resettableIds.length} manually adjusted landmark${resettableIds.length === 1 ? "" : "s"} back to the AI suggestion.`}
            >
              Reset all to AI
            </button>
          )}
          <span className="text-[10px]" style={{ color: "#64748d" }}>
            {landmarks.length} landmark{landmarks.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {!hasMm && (
        <p
          className="text-[10px] mb-2 px-2 py-1"
          style={{
            backgroundColor: "#FEF6E6",
            border: "1px solid #F5E0B5",
            borderRadius: 4,
            color: "#9A6712",
          }}
        >
          Calibrate to display distances in mm
        </p>
      )}
      <div className="space-y-1.5">
        {params.map((p) => (
          <PelvicParamRow key={p.id} result={p} />
        ))}
      </div>
    </div>
  );
}

function PelvicParamRow({ result }: { result: ParamResult }) {
  const formatted = formatParamValue(result);
  const isMissing = result.value === null;

  return (
    <div
      className="flex items-baseline justify-between gap-2 px-2 py-1"
      style={{
        backgroundColor: isMissing ? "#f6f9fc" : "#ffffff",
        border: "1px solid #e5edf5",
        borderRadius: 4,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: "#061b31" }}
          >
            {result.label}
          </span>
          <span
            className="text-[10px] truncate"
            style={{ color: "#64748d" }}
            title={result.description}
          >
            {result.description}
          </span>
        </div>
        {isMissing && result.missing.length > 0 && (
          <p
            className="text-[10px] mt-0.5 italic"
            style={{ color: "#9A6712" }}
            title={result.missing.join(", ")}
          >
            Missing: {result.missing.map(humanizeLandmarkName).join(", ")}
          </p>
        )}
      </div>
      <span
        className="text-xs font-medium tabular-nums shrink-0"
        style={{ color: isMissing ? "#A3ACB9" : "#533afd" }}
      >
        {formatted ?? "—"}
      </span>
    </div>
  );
}

// snake_case landmark id → terse human label for the "missing" hint line.
// Kept local to the panel: the canonical displayName lives on each shape's
// `label` field once placed, but missing landmarks have no shape yet.
function humanizeLandmarkName(name: string): string {
  const map: Record<string, string> = {
    top_of_left_femoral_head: "L femoral head",
    top_of_right_femoral_head: "R femoral head",
    top_of_left_iliac_crest: "L iliac crest",
    top_of_right_iliac_crest: "R iliac crest",
    second_sacral_tubercle: "S2 tubercle",
    center_of_symphysis_pubis: "symphysis pubis",
  };
  return map[name] ?? name.replace(/_/g, " ");
}

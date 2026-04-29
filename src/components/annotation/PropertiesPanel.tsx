"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Minus,
  Pencil,
  Type,
  Ruler,
  TriangleRight,
  GripVertical,
  Scaling,
  Trash2,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import type { BaseShape, ShapeStyle, ShapeType } from "@/types/annotation";
import { ANNOTATION_COLOR_PRESETS, DASH_PATTERN_PRESETS } from "@/types/annotation";
import { formatMeasurement } from "@/lib/measurements";

const shapeIcons: Record<ShapeType, React.ReactNode> = {
  line: <Minus size={14} strokeWidth={1.5} />,
  freehand: <Pencil size={14} strokeWidth={1.5} />,
  text: <Type size={14} strokeWidth={1.5} />,
  ruler: <Ruler size={14} strokeWidth={1.5} />,
  angle: <TriangleRight size={14} strokeWidth={1.5} />,
  cobb_angle: <Scaling size={14} strokeWidth={1.5} />,
};

function getShapeDisplayName(shape: BaseShape, index: number): string {
  if (shape.label) return shape.label;
  const typeName = shape.type.charAt(0).toUpperCase() + shape.type.slice(1).replace("_", " ");
  return `${typeName} ${index + 1}`;
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
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteShape: (id: string) => void;
  onUpdateShape: (id: string, updates: Partial<BaseShape>) => void;
  currentStyle: ShapeStyle;
  onStyleChange: (style: ShapeStyle) => void;
  isOpen: boolean;
  onTogglePanel: () => void;
  pixelsPerMm?: number | null;
}

export function PropertiesPanel({
  shapes,
  selectedShapeIds,
  onSelectShape,
  onToggleVisibility,
  onToggleLock,
  onDeleteShape,
  onUpdateShape,
  currentStyle,
  onStyleChange,
  isOpen,
  onTogglePanel,
  pixelsPerMm,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<"layers" | "properties" | "measurements">("layers");

  const sortedShapes = [...shapes].sort((a, b) => b.zIndex - a.zIndex);
  const selectedShape =
    selectedShapeIds.length === 1
      ? shapes.find((s) => s.id === selectedShapeIds[0])
      : null;

  // Collapsed: render only a thin right-edge toggle so users can find the panel
  if (!isOpen) {
    return (
      <button
        onClick={onTogglePanel}
        className="flex flex-col items-center justify-center transition-colors"
        style={{
          width: 28,
          backgroundColor: "#FFFFFF",
          borderLeft: "1px solid #e5edf5",
          color: "#64748d",
          gap: 6,
        }}
        title="Show properties panel (\\)"
        aria-label="Show properties panel"
      >
        <PanelRightOpen size={16} strokeWidth={1.5} />
        <span
          style={{
            writingMode: "vertical-rl",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.4,
            color: "#64748d",
          }}
        >
          Layers · Properties
        </span>
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
          >
            {shapes.length}
          </span>
        )}
      </button>
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
      {/* Tab Header */}
      <div
        className="flex items-center"
        style={{ borderBottom: "1px solid #e5edf5" }}
      >
        <button
          onClick={() => setActiveTab("layers")}
          className="flex-1 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "layers" ? "#533afd" : "#64748d",
            borderBottom: activeTab === "layers" ? "2px solid #533afd" : "2px solid transparent",
          }}
        >
          Layers
        </button>
        <button
          onClick={() => setActiveTab("properties")}
          className="flex-1 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "properties" ? "#533afd" : "#64748d",
            borderBottom: activeTab === "properties" ? "2px solid #533afd" : "2px solid transparent",
          }}
        >
          Properties
        </button>
        <button
          onClick={() => setActiveTab("measurements")}
          className="flex-1 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "measurements" ? "#533afd" : "#64748d",
            borderBottom: activeTab === "measurements" ? "2px solid #533afd" : "2px solid transparent",
          }}
        >
          Measurements
        </button>
        <button
          onClick={onTogglePanel}
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
              return (
                <div
                  key={shape.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelectShape(shape.id)}
                  className="flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isSelected ? "#ededfc" : "transparent",
                  }}
                >
                  <GripVertical
                    size={12}
                    style={{ color: "#A3ACB9", cursor: "grab", flexShrink: 0 }}
                  />
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
                  <span
                    className="flex-1 truncate text-xs"
                    style={{
                      color: isSelected ? "#061b31" : "#273951",
                    }}
                  >
                    {getShapeDisplayName(shape, index)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(shape.id);
                    }}
                    className="flex items-center justify-center"
                    style={{
                      width: 20,
                      height: 20,
                      color: shape.visible ? "#64748d" : "#A3ACB9",
                      flexShrink: 0,
                    }}
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
                    className="flex items-center justify-center"
                    style={{
                      width: 20,
                      height: 20,
                      color: shape.locked ? "#533afd" : "#A3ACB9",
                      flexShrink: 0,
                    }}
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
                      onDeleteShape(shape.id);
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
          <MeasurementSummary
            shapes={shapes}
            onSelectShape={onSelectShape}
            pixelsPerMm={pixelsPerMm ?? null}
          />
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
  onSelectShape,
  pixelsPerMm,
}: {
  shapes: BaseShape[];
  onSelectShape: (id: string) => void;
  pixelsPerMm: number | null;
}) {
  const measurementShapes = shapes.filter(
    (s) => s.measurement && s.visible
  );

  return (
    <div className="p-3">
      <p className="text-xs font-medium mb-2" style={{ color: "#061b31" }}>
        Measurement Summary
      </p>
      {measurementShapes.length === 0 ? (
        <div className="py-6 text-center text-xs" style={{ color: "#64748d" }}>
          No measurements yet.
          <br />
          Use Ruler (M), Angle (Shift+M), or Cobb (Cmd+Shift+M).
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Header */}
          <div className="flex items-center gap-2 pb-1 mb-1" style={{ borderBottom: "1px solid #e5edf5" }}>
            <span className="w-5 text-xs font-medium" style={{ color: "#64748d" }}>#</span>
            <span className="flex-1 text-xs font-medium" style={{ color: "#64748d" }}>Type</span>
            <span className="text-xs font-medium text-right" style={{ color: "#64748d", minWidth: 60 }}>Value</span>
          </div>
          {measurementShapes.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onSelectShape(s.id)}
              className="flex items-center gap-2 w-full py-1 px-0.5 rounded transition-colors text-left"
              style={{ backgroundColor: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f6f9fc")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <span className="w-5 text-xs tabular-nums" style={{ color: "#64748d" }}>{i + 1}</span>
              <span className="flex items-center gap-1 flex-1 text-xs" style={{ color: "#273951" }}>
                {shapeIcons[s.type]}
                {s.label || s.type.replace("_", " ")}
              </span>
              <span className="text-xs font-medium tabular-nums text-right" style={{ color: "#00D4AA", minWidth: 60 }}>
                {formatMeasurement(s.measurement!.value, s.measurement!.unit, pixelsPerMm)}
              </span>
            </button>
          ))}
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

"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Minus,
  Pentagon,
  Circle,
  ArrowRight,
  Pencil,
  Type,
  Ruler,
  TriangleRight,
  GripVertical,
} from "lucide-react";
import type { BaseShape, ShapeType } from "@/types/annotation";

const shapeIcons: Record<ShapeType, React.ReactNode> = {
  line: <Minus size={14} strokeWidth={1.5} />,
  polyline: <Minus size={14} strokeWidth={1.5} />,
  rectangle: <Pentagon size={14} strokeWidth={1.5} />,
  ellipse: <Circle size={14} strokeWidth={1.5} />,
  arrow: <ArrowRight size={14} strokeWidth={1.5} />,
  freehand: <Pencil size={14} strokeWidth={1.5} />,
  text: <Type size={14} strokeWidth={1.5} />,
  ruler: <Ruler size={14} strokeWidth={1.5} />,
  angle: <TriangleRight size={14} strokeWidth={1.5} />,
  cobb_angle: <TriangleRight size={14} strokeWidth={1.5} />,
};

function getShapeDisplayName(shape: BaseShape, index: number): string {
  if (shape.label) return shape.label;
  const typeName = shape.type.charAt(0).toUpperCase() + shape.type.slice(1).replace("_", " ");
  return `${typeName} ${index + 1}`;
}

interface PropertiesPanelProps {
  shapes: BaseShape[];
  selectedShapeIds: string[];
  onSelectShape: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  isOpen: boolean;
  onTogglePanel: () => void;
}

export function PropertiesPanel({
  shapes,
  selectedShapeIds,
  onSelectShape,
  onToggleVisibility,
  onToggleLock,
  isOpen,
  onTogglePanel,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<"layers" | "properties">("layers");

  if (!isOpen) return null;

  const sortedShapes = [...shapes].sort((a, b) => b.zIndex - a.zIndex);
  const selectedShape =
    selectedShapeIds.length === 1
      ? shapes.find((s) => s.id === selectedShapeIds[0])
      : null;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 280,
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid #E3E8EE",
      }}
    >
      {/* Tab Header */}
      <div
        className="flex"
        style={{ borderBottom: "1px solid #E3E8EE" }}
      >
        <button
          onClick={() => setActiveTab("layers")}
          className="flex-1 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "layers" ? "#635BFF" : "#697386",
            borderBottom: activeTab === "layers" ? "2px solid #635BFF" : "2px solid transparent",
          }}
        >
          Layers
        </button>
        <button
          onClick={() => setActiveTab("properties")}
          className="flex-1 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "properties" ? "#635BFF" : "#697386",
            borderBottom: activeTab === "properties" ? "2px solid #635BFF" : "2px solid transparent",
          }}
        >
          Properties
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "layers" && (
          <div role="listbox" aria-label="Annotation layers" className="py-1">
            {sortedShapes.length === 0 && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: "#697386" }}>
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
                    backgroundColor: isSelected ? "#F0EEFF" : "transparent",
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
                      color: isSelected ? "#635BFF" : "#697386",
                      flexShrink: 0,
                    }}
                  >
                    {shapeIcons[shape.type]}
                  </span>
                  <span
                    className="flex-1 truncate text-xs"
                    style={{
                      color: isSelected ? "#0A2540" : "#425466",
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
                      color: shape.visible ? "#697386" : "#A3ACB9",
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
                      color: shape.locked ? "#635BFF" : "#A3ACB9",
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
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "properties" && (
          <div className="p-3">
            {selectedShape ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                    Type
                  </label>
                  <p className="text-xs" style={{ color: "#425466" }}>
                    {selectedShape.type.charAt(0).toUpperCase() + selectedShape.type.slice(1).replace("_", " ")}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                    Position
                  </label>
                  <p className="text-xs tabular-nums" style={{ color: "#425466" }}>
                    X: {Math.round(selectedShape.x)}, Y: {Math.round(selectedShape.y)}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                    Size
                  </label>
                  <p className="text-xs tabular-nums" style={{ color: "#425466" }}>
                    {Math.round(selectedShape.width)} × {Math.round(selectedShape.height)}
                  </p>
                </div>
                {selectedShape.rotation !== 0 && (
                  <div>
                    <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                      Rotation
                    </label>
                    <p className="text-xs tabular-nums" style={{ color: "#425466" }}>
                      {Math.round(selectedShape.rotation)}°
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                    Stroke
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="h-4 w-4 rounded-full border"
                      style={{
                        backgroundColor: selectedShape.style.strokeColor,
                        borderColor: "#E3E8EE",
                      }}
                    />
                    <span className="text-xs" style={{ color: "#425466" }}>
                      {selectedShape.style.strokeColor} · {selectedShape.style.strokeWidth}px
                    </span>
                  </div>
                </div>
                {selectedShape.measurement && (
                  <div>
                    <label className="text-xs font-medium" style={{ color: "#0A2540" }}>
                      Measurement
                    </label>
                    <p className="text-sm font-medium tabular-nums" style={{ color: "#635BFF" }}>
                      {selectedShape.measurement.label}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs" style={{ color: "#697386" }}>
                {selectedShapeIds.length > 1
                  ? `${selectedShapeIds.length} shapes selected`
                  : "Select a shape to view properties"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Measurement Summary */}
      {shapes.filter((s) => s.measurement).length > 0 && (
        <div
          className="px-3 py-2"
          style={{ borderTop: "1px solid #E3E8EE" }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: "#0A2540" }}>
            Measurements
          </p>
          {shapes
            .filter((s) => s.measurement && s.visible)
            .map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-0.5"
              >
                <span className="text-xs truncate" style={{ color: "#425466" }}>
                  {s.label || s.type}
                </span>
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{ color: "#635BFF" }}
                >
                  {s.measurement!.label}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

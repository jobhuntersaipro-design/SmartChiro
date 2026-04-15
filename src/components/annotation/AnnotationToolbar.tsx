"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Hand,
  Minus,
  ArrowRight,
  Pencil,
  Type,
  Ruler,
  TriangleRight,
  Eraser,
  Scaling,
  Undo2,
  Redo2,
  RulerDimensionLine,
} from "lucide-react";
import type { ToolId } from "@/types/annotation";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  description: string;
  icon: React.ReactNode;
  separator?: boolean;
}

const tools: ToolItem[] = [
  { id: "hand", label: "Pan", shortcut: "H", description: "Click and drag to move around the X-ray. Click on shapes to select them.", icon: <Hand size={18} strokeWidth={1.5} /> },
  { id: "freehand", label: "Freehand", shortcut: "P", description: "Draw freely with your cursor", icon: <Pencil size={18} strokeWidth={1.5} />, separator: true },
  { id: "line", label: "Line", shortcut: "L", description: "Draw a straight line between two points", icon: <Minus size={18} strokeWidth={1.5} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", description: "Draw an arrow pointing in one direction", icon: <ArrowRight size={18} strokeWidth={1.5} /> },
  { id: "text", label: "Text", shortcut: "T", description: "Click to add a text label", icon: <Type size={18} strokeWidth={1.5} /> },
  { id: "eraser", label: "Eraser", shortcut: "X", description: "Click on any annotation to remove it", icon: <Eraser size={18} strokeWidth={1.5} />, separator: true },
  { id: "ruler", label: "Ruler", shortcut: "M", description: "Measure distance between two points", icon: <Ruler size={18} strokeWidth={1.5} /> },
  { id: "angle", label: "Angle", shortcut: "⇧M", description: "Measure the angle between three points", icon: <TriangleRight size={18} strokeWidth={1.5} /> },
  { id: "cobb_angle", label: "Cobb Angle", shortcut: "⌘⇧M", description: "Measure Cobb angle between two lines", icon: <Scaling size={18} strokeWidth={1.5} /> },
  { id: "calibration", label: "Calibration", shortcut: "K", description: "Draw on a known-distance object to calibrate measurements", icon: <RulerDimensionLine size={18} strokeWidth={1.5} /> },
];

interface AnnotationToolbarProps {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleShortcuts?: () => void;
}

function ToolTooltip({
  tool,
  anchorRect,
}: {
  tool: ToolItem;
  anchorRect: DOMRect;
}) {
  return (
    <div
      className="pointer-events-none fixed z-50 flex flex-col gap-0.5 px-2.5 py-1.5"
      style={{
        top: anchorRect.bottom + 6,
        left: anchorRect.left + anchorRect.width / 2,
        transform: "translateX(-50%)",
        backgroundColor: "#0A2540",
        color: "#FFFFFF",
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.4,
        maxWidth: 220,
        whiteSpace: "normal",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{tool.label}</span>
        <span
          className="rounded px-1 py-0.5 text-[10px]"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        >
          {tool.shortcut}
        </span>
      </div>
      <span style={{ color: "#A3ACB9" }}>{tool.description}</span>
    </div>
  );
}

export function AnnotationToolbar({
  activeTool,
  onToolChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onToggleShortcuts,
}: AnnotationToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  const showTooltip = useCallback((toolId: string) => {
    const btn = buttonRefsMap.current.get(toolId);
    if (btn) {
      setTooltipRect(btn.getBoundingClientRect());
      setHoveredTool(toolId);
    }
  }, []);

  const handleMouseEnter = useCallback(
    (toolId: string) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => showTooltip(toolId), 400);
    },
    [showTooltip]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredTool(null);
    setTooltipRect(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Undo/redo pseudo tool items for tooltips
  const undoRedoTooltips: Record<string, ToolItem> = {
    __undo: { id: "hand" as ToolId, label: "Undo", shortcut: "⌘Z", description: "Undo the last action", icon: null },
    __redo: { id: "hand" as ToolId, label: "Redo", shortcut: "⌘⇧Z", description: "Redo the last undone action", icon: null },
    __shortcuts: { id: "hand" as ToolId, label: "Keyboard Shortcuts", shortcut: "?", description: "Show all keyboard shortcuts", icon: null },
  };

  const hoveredToolData = hoveredTool
    ? undoRedoTooltips[hoveredTool] ?? tools.find((t) => t.id === hoveredTool)
    : null;

  return (
    <div className="flex items-center gap-1 px-2">
      {/* Undo/Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        onMouseEnter={() => handleMouseEnter("__undo")}
        onMouseLeave={handleMouseLeave}
        ref={(el) => { if (el) buttonRefsMap.current.set("__undo", el); }}
        className="flex items-center justify-center transition-colors disabled:cursor-not-allowed"
        style={{
          width: 36,
          height: 36,
          borderRadius: 4,
          color: canUndo ? "#425466" : "#A3ACB9",
        }}
      >
        <Undo2 size={18} strokeWidth={1.5} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        onMouseEnter={() => handleMouseEnter("__redo")}
        onMouseLeave={handleMouseLeave}
        ref={(el) => { if (el) buttonRefsMap.current.set("__redo", el); }}
        className="flex items-center justify-center transition-colors disabled:cursor-not-allowed"
        style={{
          width: 36,
          height: 36,
          borderRadius: 4,
          color: canRedo ? "#425466" : "#A3ACB9",
        }}
      >
        <Redo2 size={18} strokeWidth={1.5} />
      </button>
      <div className="mx-1" style={{ width: 1, height: 28, backgroundColor: "#E3E8EE" }} />

      {tools.map((tool, i) => {
        const isActive = activeTool === tool.id;
        const prevTool = i > 0 ? tools[i - 1] : null;
        return (
          <div key={tool.id} className="flex items-center">
            {prevTool?.separator && (
              <div
                className="mx-1"
                style={{ width: 1, height: 28, backgroundColor: "#E3E8EE" }}
              />
            )}
            <button
              ref={(el) => {
                if (el) buttonRefsMap.current.set(tool.id, el);
              }}
              onClick={() => onToolChange(tool.id)}
              onMouseEnter={() => handleMouseEnter(tool.id)}
              onMouseLeave={handleMouseLeave}
              aria-label={`${tool.label} (${tool.shortcut})`}
              className="flex items-center justify-center transition-colors"
              style={{
                width: 36,
                height: 36,
                borderRadius: 4,
                backgroundColor: isActive ? "#F0EEFF" : "transparent",
                color: isActive ? "#635BFF" : "#425466",
              }}
            >
              {tool.icon}
            </button>
          </div>
        );
      })}
      {/* Spacer to push ? button to the right */}
      <div className="flex-1" />
      <button
        onClick={onToggleShortcuts}
        onMouseEnter={() => handleMouseEnter("__shortcuts")}
        onMouseLeave={handleMouseLeave}
        ref={(el) => { if (el) buttonRefsMap.current.set("__shortcuts", el); }}
        className="flex items-center justify-center transition-colors"
        style={{
          width: 36,
          height: 36,
          borderRadius: 4,
          color: "#697386",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        ?
      </button>

      {hoveredToolData && tooltipRect && (
        <ToolTooltip tool={hoveredToolData} anchorRect={tooltipRect} />
      )}
    </div>
  );
}

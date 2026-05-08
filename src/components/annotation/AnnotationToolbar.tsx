"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Hand,
  Dot,
  Minus,
  Spline,
  Type,
  TriangleRight,
  Scaling,
  ArrowRight,
  Ruler,
  Settings2,
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
  { id: "hand", label: "Pan", shortcut: "H", description: "Click and drag to move around the X-ray. Click a shape to select it; Backspace or Delete removes it.", icon: <Hand size={18} strokeWidth={1.5} /> },
  { id: "point", label: "Point", shortcut: "D", description: "Click to drop a numbered landmark (P1, P2, ...). Used for anatomical reference points; can be reused as endpoints for line/angle/cobb tools.", icon: <Dot size={28} strokeWidth={2.5} /> },
  { id: "line", label: "Line", shortcut: "L", description: "Click two points to draw a measured line. Each endpoint becomes a numbered, draggable dot.", icon: <Minus size={18} strokeWidth={1.5} /> },
  { id: "polyline", label: "Polyline", shortcut: "⇧L", description: "Click to chain vertices. Numbered dots can be snapped by line/angle/cobb. Done button, double-click, or Enter to finish.", icon: <Spline size={18} strokeWidth={1.5} /> },
  { id: "ruler", label: "Ruler", shortcut: "M", description: "Click two points to measure distance between them. Snap-aware — start or end on an existing landmark to chain measurements. Shows mm when calibrated, px otherwise.", icon: <Ruler size={18} strokeWidth={1.5} /> },
  { id: "angle", label: "Angle", shortcut: "A", description: "Click three points (endpoint, vertex, endpoint) to measure an angle.", icon: <TriangleRight size={18} strokeWidth={1.5} /> },
  { id: "cobb_angle", label: "Cobb angle", shortcut: "⇧A", description: "Click four points — two for each line — to measure Cobb angle between two lines.", icon: <Scaling size={18} strokeWidth={1.5} />, separator: true },
  { id: "arrow", label: "Arrow", shortcut: "R", description: "Drag to draw an arrow. For patient communication — pointing at areas of interest.", icon: <ArrowRight size={18} strokeWidth={1.5} /> },
  { id: "text", label: "Text", shortcut: "T", description: "Click to add a text label. For patient communication.", icon: <Type size={18} strokeWidth={1.5} />, separator: true },
  { id: "calibrate", label: "Calibrate", shortcut: "K", description: "Click two points on a known reference (e.g., a vertebra of known size), then enter the real-world length. All measurements convert to mm/cm afterwards.", icon: <Settings2 size={18} strokeWidth={1.5} /> },
];

interface AnnotationToolbarProps {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
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
        top: anchorRect.top + anchorRect.height / 2,
        left: anchorRect.right + 8,
        transform: "translateY(-50%)",
        backgroundColor: "#061b31",
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
}: AnnotationToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  const showTooltip = useCallback((toolId: string) => {
    const btn = buttonRefsMap.current.get(toolId);
    if (btn) {
      setTooltipRect(btn.getBoundingClientRect());
    }
  }, []);

  const handleMouseEnter = useCallback(
    (toolId: string) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      setHoveredTool(toolId);
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

  const hoveredToolData = hoveredTool
    ? tools.find((t) => t.id === hoveredTool)
    : null;

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      {tools.map((tool, i) => {
        const isActive = activeTool === tool.id;
        const isHovered = hoveredTool === tool.id;
        const prevTool = i > 0 ? tools[i - 1] : null;
        return (
          <div key={tool.id} className="flex flex-col items-center">
            {prevTool?.separator && (
              <div
                style={{ width: 24, height: 1, backgroundColor: "#1c2738", margin: "4px 0" }}
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
                backgroundColor: isActive
                  ? "#533afd"
                  : isHovered
                    ? "rgba(255,255,255,.14)"
                    : "rgba(255,255,255,.06)",
                color: isActive ? "#FFFFFF" : isHovered ? "#FFFFFF" : "#cdd5e2",
              }}
            >
              {tool.icon}
            </button>
          </div>
        );
      })}

      {hoveredToolData && tooltipRect && (
        <ToolTooltip tool={hoveredToolData} anchorRect={tooltipRect} />
      )}
    </div>
  );
}

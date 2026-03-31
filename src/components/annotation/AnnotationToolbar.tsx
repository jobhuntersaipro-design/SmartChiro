"use client";

import {
  MousePointer2,
  Hand,
  Minus,
  Pentagon,
  Circle,
  ArrowRight,
  Pencil,
  Type,
  Ruler,
  TriangleRight,
  Spline,
  Eraser,
  Share2,
} from "lucide-react";
import type { ToolId } from "@/types/annotation";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  separator?: boolean;
}

const tools: ToolItem[] = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 size={18} strokeWidth={1.5} /> },
  { id: "hand", label: "Pan", shortcut: "H", icon: <Hand size={18} strokeWidth={1.5} />, separator: true },
  { id: "freehand", label: "Freehand", shortcut: "P", icon: <Pencil size={18} strokeWidth={1.5} /> },
  { id: "line", label: "Line", shortcut: "L", icon: <Minus size={18} strokeWidth={1.5} /> },
  { id: "polyline", label: "Polyline", shortcut: "⇧L", icon: <Share2 size={18} strokeWidth={1.5} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: <ArrowRight size={18} strokeWidth={1.5} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: <Pentagon size={18} strokeWidth={1.5} /> },
  { id: "ellipse", label: "Ellipse", shortcut: "E", icon: <Circle size={18} strokeWidth={1.5} /> },
  { id: "bezier", label: "Bezier", shortcut: "B", icon: <Spline size={18} strokeWidth={1.5} /> },
  { id: "text", label: "Text", shortcut: "T", icon: <Type size={18} strokeWidth={1.5} /> },
  { id: "eraser", label: "Eraser", shortcut: "X", icon: <Eraser size={18} strokeWidth={1.5} />, separator: true },
  { id: "ruler", label: "Ruler", shortcut: "M", icon: <Ruler size={18} strokeWidth={1.5} /> },
  { id: "angle", label: "Angle", shortcut: "G", icon: <TriangleRight size={18} strokeWidth={1.5} /> },
];

interface AnnotationToolbarProps {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
}

export function AnnotationToolbar({ activeTool, onToolChange }: AnnotationToolbarProps) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-2"
      style={{
        width: 56,
        backgroundColor: "#FFFFFF",
        borderRight: "1px solid #E3E8EE",
      }}
    >
      {tools.map((tool, i) => {
        const isActive = activeTool === tool.id;
        const prevTool = i > 0 ? tools[i - 1] : null;
        return (
          <div key={tool.id}>
            {prevTool?.separator && (
              <div
                className="mx-auto my-1"
                style={{ width: 28, height: 1, backgroundColor: "#E3E8EE" }}
              />
            )}
            <button
              onClick={() => onToolChange(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              className="flex items-center justify-center transition-colors"
              style={{
                width: 40,
                height: 40,
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
    </div>
  );
}

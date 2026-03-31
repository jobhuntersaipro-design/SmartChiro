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
} from "lucide-react";
import type { ToolId } from "@/types/annotation";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const tools: ToolItem[] = [
  { id: "select", label: "Select", shortcut: "V", icon: <MousePointer2 size={18} strokeWidth={1.5} /> },
  { id: "hand", label: "Pan", shortcut: "H", icon: <Hand size={18} strokeWidth={1.5} /> },
  { id: "line", label: "Line", shortcut: "L", icon: <Minus size={18} strokeWidth={1.5} /> },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: <Pentagon size={18} strokeWidth={1.5} /> },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: <Circle size={18} strokeWidth={1.5} /> },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: <ArrowRight size={18} strokeWidth={1.5} /> },
  { id: "freehand", label: "Freehand", shortcut: "P", icon: <Pencil size={18} strokeWidth={1.5} /> },
  { id: "text", label: "Text", shortcut: "T", icon: <Type size={18} strokeWidth={1.5} /> },
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
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
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
        );
      })}
    </div>
  );
}

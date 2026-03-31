"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolId, ToolState, BaseShape, Point } from "@/types/annotation";
import { screenToImage } from "@/types/annotation";
import type { ViewTransform } from "@/types/annotation";

interface UseCanvasInteractionOptions {
  transform: ViewTransform;
  pan: (dx: number, dy: number) => void;
  shapes: BaseShape[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMoveShapes?: (shapeIds: string[], dx: number, dy: number) => void;
}

interface DragEvent {
  shapeIds: string[];
  startImagePos: Point;
  hasMoved: boolean;
}

interface UseCanvasInteractionReturn {
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  toolState: ToolState;
  selectedShapeIds: string[];
  setSelectedShapeIds: (ids: string[]) => void;
  cursorPosition: Point | null;
  isPanning: boolean;
  isDragging: boolean;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

export function useCanvasInteraction({
  transform,
  pan,
  shapes,
  containerRef,
  onMoveShapes,
}: UseCanvasInteractionOptions): UseCanvasInteractionReturn {
  const [activeTool, setActiveToolState] = useState<ToolId>("select");
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragEvent | null>(null);
  const spaceHeldRef = useRef(false);
  const previousToolRef = useRef<ToolId>("select");

  const setActiveTool = useCallback(
    (tool: ToolId) => {
      setActiveToolState(tool);
      setToolState(tool === "select" ? "idle" : "tool_selected");
    },
    []
  );

  // Hit test: find topmost visible, unlocked shape at a point
  const hitTest = useCallback(
    (imageX: number, imageY: number): BaseShape | null => {
      const sorted = [...shapes]
        .filter((s) => s.visible && !s.locked)
        .sort((a, b) => b.zIndex - a.zIndex);

      for (const shape of sorted) {
        if (
          imageX >= shape.x &&
          imageX <= shape.x + shape.width &&
          imageY >= shape.y &&
          imageY <= shape.y + shape.height
        ) {
          return shape;
        }
      }
      return null;
    },
    [shapes]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Middle mouse button or space+click = pan
      if (e.button === 1 || spaceHeldRef.current || activeTool === "hand") {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "select") {
        const imagePos = screenToImage(screenX, screenY, transform);
        const hit = hitTest(imagePos.x, imagePos.y);

        if (hit) {
          if (e.shiftKey) {
            setSelectedShapeIds((prev) =>
              prev.includes(hit.id)
                ? prev.filter((id) => id !== hit.id)
                : [...prev, hit.id]
            );
          } else if (!selectedShapeIds.includes(hit.id)) {
            setSelectedShapeIds([hit.id]);
          }
          setToolState("shape_selected");
          // Start drag tracking
          const dragIds = selectedShapeIds.includes(hit.id)
            ? selectedShapeIds
            : [hit.id];
          dragRef.current = {
            shapeIds: dragIds,
            startImagePos: imagePos,
            hasMoved: false,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } else {
          setSelectedShapeIds([]);
          setToolState("idle");
          dragRef.current = null;
        }
      }
    },
    [activeTool, transform, hitTest, selectedShapeIds]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const imagePos = screenToImage(screenX, screenY, transform);
      setCursorPosition(imagePos);

      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        pan(dx, dy);
        return;
      }

      // Shape dragging
      if (dragRef.current && activeTool === "select") {
        const dx = imagePos.x - dragRef.current.startImagePos.x;
        const dy = imagePos.y - dragRef.current.startImagePos.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          if (!dragRef.current.hasMoved) {
            dragRef.current.hasMoved = true;
            setIsDragging(true);
          }
          onMoveShapes?.(dragRef.current.shapeIds, dx, dy);
          dragRef.current.startImagePos = imagePos;
        }
      }
    },
    [transform, isPanning, pan, activeTool, onMoveShapes]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
      if (dragRef.current) {
        if (dragRef.current.hasMoved) {
          // Drag completed — commit undo entry via custom event
          window.dispatchEvent(
            new CustomEvent("canvas:drag-end", {
              detail: { shapeIds: dragRef.current.shapeIds },
            })
          );
        }
        dragRef.current = null;
        setIsDragging(false);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // Already released
        }
      }
    },
    [isPanning]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      // Space for temporary pan
      if (e.code === "Space" && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        previousToolRef.current = activeTool;
        setActiveToolState("hand");
        return;
      }

      // Ctrl/Cmd+Shift+M = Cobb Angle (check before non-mod shortcuts)
      if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setActiveTool("cobb_angle");
        return;
      }

      // Tool shortcuts (no modifier except Shift for polyline/angle)
      if (!mod) {
        // Shift+L = Polyline
        if (e.shiftKey && e.key.toLowerCase() === "l") {
          setActiveTool("polyline");
          return;
        }

        // Shift+M = Angle
        if (e.shiftKey && e.key.toLowerCase() === "m") {
          setActiveTool("angle");
          return;
        }

        if (!e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case "v":
              setActiveTool("select");
              return;
            case "h":
              setActiveTool("hand");
              return;
            case "p":
              setActiveTool("freehand");
              return;
            case "l":
              setActiveTool("line");
              return;
            case "a":
              setActiveTool("arrow");
              return;
            case "r":
              setActiveTool("rectangle");
              return;
            case "e":
              setActiveTool("ellipse");
              return;
            case "b":
              setActiveTool("bezier");
              return;
            case "t":
              setActiveTool("text");
              return;
            case "x":
              setActiveTool("eraser");
              return;
            case "m":
              setActiveTool("ruler");
              return;
            case "k":
              setActiveTool("calibration_reference");
              return;
          }
        }
      }

      // Selection shortcuts
      if (e.key === "Escape") {
        setSelectedShapeIds([]);
        setToolState("idle");
        return;
      }

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const selectableIds = shapes
          .filter((s) => s.visible && !s.locked)
          .map((s) => s.id);
        setSelectedShapeIds(selectableIds);
        if (selectableIds.length > 0) setToolState("shape_selected");
        return;
      }

      // Delete selected shapes
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedShapeIds.length > 0
      ) {
        const event = new CustomEvent("canvas:delete-shapes", {
          detail: { shapeIds: selectedShapeIds },
        });
        window.dispatchEvent(event);
        setSelectedShapeIds([]);
        setToolState("idle");
        return;
      }

      // Layer ordering: [ and ]
      if (e.key === "[" && selectedShapeIds.length > 0) {
        window.dispatchEvent(
          new CustomEvent("canvas:reorder-shape", {
            detail: { shapeId: selectedShapeIds[0], direction: "back" },
          })
        );
        return;
      }
      if (e.key === "]" && selectedShapeIds.length > 0) {
        window.dispatchEvent(
          new CustomEvent("canvas:reorder-shape", {
            detail: { shapeId: selectedShapeIds[0], direction: "forward" },
          })
        );
        return;
      }

      // Duplicate
      if (mod && e.key.toLowerCase() === "d" && selectedShapeIds.length > 0) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("canvas:duplicate-shapes", {
            detail: { shapeIds: selectedShapeIds },
          })
        );
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setActiveToolState(previousToolRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeTool, setActiveTool, selectedShapeIds, shapes]);

  return {
    activeTool,
    setActiveTool,
    toolState,
    selectedShapeIds,
    setSelectedShapeIds,
    cursorPosition,
    isPanning,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

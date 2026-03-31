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
}

interface UseCanvasInteractionReturn {
  activeTool: ToolId;
  setActiveTool: (tool: ToolId) => void;
  toolState: ToolState;
  selectedShapeIds: string[];
  setSelectedShapeIds: (ids: string[]) => void;
  cursorPosition: Point | null;
  isPanning: boolean;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

export function useCanvasInteraction({
  transform,
  pan,
  shapes,
  containerRef,
}: UseCanvasInteractionOptions): UseCanvasInteractionReturn {
  const [activeTool, setActiveToolState] = useState<ToolId>("select");
  const [toolState, setToolState] = useState<ToolState>("idle");
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const panStartRef = useRef<{ x: number; y: number } | null>(null);
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
      // Iterate shapes from highest zIndex to lowest
      const sorted = [...shapes]
        .filter((s) => s.visible && !s.locked)
        .sort((a, b) => b.zIndex - a.zIndex);

      for (const shape of sorted) {
        // Simple bounding box hit test
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
            // Toggle selection
            setSelectedShapeIds((prev) =>
              prev.includes(hit.id)
                ? prev.filter((id) => id !== hit.id)
                : [...prev, hit.id]
            );
          } else {
            setSelectedShapeIds([hit.id]);
          }
          setToolState("shape_selected");
        } else {
          setSelectedShapeIds([]);
          setToolState("idle");
        }
      }
    },
    [activeTool, transform, hitTest]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const imagePos = screenToImage(screenX, screenY, transform);
      setCursorPosition(imagePos);

      // Handle panning
      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        pan(dx, dy);
      }
    },
    [transform, isPanning, pan]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    [isPanning]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
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

      // Tool shortcuts
      if (!mod && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "v":
            setActiveTool("select");
            return;
          case "h":
            setActiveTool("hand");
            return;
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
        // Emit delete event — handled by parent
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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

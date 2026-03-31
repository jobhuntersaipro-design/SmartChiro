"use client";

import { useCallback, useRef, useState } from "react";
import type { BaseShape, CanvasCommand, CommandType } from "@/types/annotation";

const MAX_HISTORY = 100;

function generateId(): string {
  return crypto.randomUUID();
}

interface UseUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => BaseShape[] | null;
  redo: () => BaseShape[] | null;
  pushCommand: (
    type: CommandType,
    shapeId: string,
    shapeBefore: BaseShape | null,
    shapeAfter: BaseShape | null
  ) => void;
  pushBatch: (commands: Omit<CanvasCommand, "id" | "timestamp">[]) => void;
  clear: () => void;
  historyLength: number;
}

export function useUndoRedo(): UseUndoRedoReturn {
  const historyRef = useRef<CanvasCommand[]>([]);
  const pointerRef = useRef(-1);
  const [, forceUpdate] = useState(0);

  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

  const pushCommand = useCallback(
    (
      type: CommandType,
      shapeId: string,
      shapeBefore: BaseShape | null,
      shapeAfter: BaseShape | null
    ) => {
      const command: CanvasCommand = {
        id: generateId(),
        type,
        timestamp: new Date().toISOString(),
        shapeBefore,
        shapeAfter,
        shapeId,
      };

      // Fork: discard everything after current pointer
      historyRef.current = historyRef.current.slice(0, pointerRef.current + 1);
      historyRef.current.push(command);

      // Cap at max size
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY);
      }

      pointerRef.current = historyRef.current.length - 1;
      rerender();
    },
    [rerender]
  );

  const pushBatch = useCallback(
    (commands: Omit<CanvasCommand, "id" | "timestamp">[]) => {
      const batchCommand: CanvasCommand = {
        id: generateId(),
        type: "BATCH",
        timestamp: new Date().toISOString(),
        shapeBefore: null,
        shapeAfter: null,
        shapeId: "batch",
        children: commands.map((cmd) => ({
          ...cmd,
          id: generateId(),
          timestamp: new Date().toISOString(),
        })),
      };

      historyRef.current = historyRef.current.slice(0, pointerRef.current + 1);
      historyRef.current.push(batchCommand);

      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY);
      }

      pointerRef.current = historyRef.current.length - 1;
      rerender();
    },
    [rerender]
  );

  // Returns the shapes array that should replace current shapes, or null if nothing to undo
  const undo = useCallback((): BaseShape[] | null => {
    if (pointerRef.current < 0) return null;
    const command = historyRef.current[pointerRef.current];
    pointerRef.current--;
    rerender();
    // Caller applies the undo by using command.shapeBefore
    // For batch, caller iterates command.children
    return command ? [command.shapeBefore].filter(Boolean) as BaseShape[] : null;
  }, [rerender]);

  const redo = useCallback((): BaseShape[] | null => {
    if (pointerRef.current >= historyRef.current.length - 1) return null;
    pointerRef.current++;
    const command = historyRef.current[pointerRef.current];
    rerender();
    return command ? [command.shapeAfter].filter(Boolean) as BaseShape[] : null;
  }, [rerender]);

  const clear = useCallback(() => {
    historyRef.current = [];
    pointerRef.current = -1;
    rerender();
  }, [rerender]);

  return {
    canUndo: pointerRef.current >= 0,
    canRedo: pointerRef.current < historyRef.current.length - 1,
    undo,
    redo,
    pushCommand,
    pushBatch,
    clear,
    historyLength: historyRef.current.length,
  };
}

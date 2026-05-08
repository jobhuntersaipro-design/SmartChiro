"use client";

import { useCallback, useRef, useState } from "react";
import type { BaseShape, CanvasCommand, CommandType, ToolId } from "@/types/annotation";

const MAX_HISTORY = 100;

function generateId(): string {
  return crypto.randomUUID();
}

interface UseUndoRedoOptions {
  shapes: BaseShape[];
  setShapes: React.Dispatch<React.SetStateAction<BaseShape[]>>;
  onDirty: () => void;
}

interface UseUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushCommand: (
    type: CommandType,
    shapeId: string,
    shapeBefore: BaseShape | null,
    shapeAfter: BaseShape | null,
    authoringTool?: ToolId,
  ) => void;
  pushBatch: (commands: Omit<CanvasCommand, "id" | "timestamp">[]) => void;
  clear: () => void;
  historyLength: number;
  pointer: number;
  /**
   * Undo only the topmost command authored with one of `tools`. When the top
   * isn't from a matching tool, this is a no-op — used by tool-scoped Cmd+Z so
   * line/polyline only undo their own actions.
   */
  undoForTools: (tools: ToolId[]) => void;
  /** True iff the top of the undo stack was authored with one of `tools`. */
  canUndoForTools: (tools: ToolId[]) => boolean;
}

function applyUndo(shapes: BaseShape[], command: CanvasCommand): BaseShape[] {
  if (command.type === "BATCH" && command.children) {
    let result = shapes;
    // Apply children in reverse order for undo
    for (let i = command.children.length - 1; i >= 0; i--) {
      result = applyUndo(result, command.children[i]);
    }
    return result;
  }

  switch (command.type) {
    case "ADD_SHAPE":
      // Undo add = remove the shape
      return shapes.filter((s) => s.id !== command.shapeId);
    case "DELETE_SHAPE":
      // Undo delete = re-add the shape
      if (command.shapeBefore) {
        return [...shapes, command.shapeBefore];
      }
      return shapes;
    case "MODIFY_SHAPE":
    case "REORDER_SHAPE":
      // Undo modify = restore shapeBefore
      if (command.shapeBefore) {
        return shapes.map((s) =>
          s.id === command.shapeId ? command.shapeBefore! : s
        );
      }
      return shapes;
    default:
      return shapes;
  }
}

function applyRedo(shapes: BaseShape[], command: CanvasCommand): BaseShape[] {
  if (command.type === "BATCH" && command.children) {
    let result = shapes;
    for (const child of command.children) {
      result = applyRedo(result, child);
    }
    return result;
  }

  switch (command.type) {
    case "ADD_SHAPE":
      // Redo add = re-add the shape
      if (command.shapeAfter) {
        return [...shapes, command.shapeAfter];
      }
      return shapes;
    case "DELETE_SHAPE":
      // Redo delete = remove the shape
      return shapes.filter((s) => s.id !== command.shapeId);
    case "MODIFY_SHAPE":
    case "REORDER_SHAPE":
      // Redo modify = apply shapeAfter
      if (command.shapeAfter) {
        return shapes.map((s) =>
          s.id === command.shapeId ? command.shapeAfter! : s
        );
      }
      return shapes;
    default:
      return shapes;
  }
}

export function useUndoRedo({
  setShapes,
  onDirty,
}: UseUndoRedoOptions): UseUndoRedoReturn {
  const historyRef = useRef<CanvasCommand[]>([]);
  const pointerRef = useRef(-1);
  const [, forceUpdate] = useState(0);

  const rerender = useCallback(() => forceUpdate((n) => n + 1), []);

  const pushCommand = useCallback(
    (
      type: CommandType,
      shapeId: string,
      shapeBefore: BaseShape | null,
      shapeAfter: BaseShape | null,
      authoringTool?: ToolId,
    ) => {
      const command: CanvasCommand = {
        id: generateId(),
        type,
        timestamp: new Date().toISOString(),
        shapeBefore,
        shapeAfter,
        shapeId,
        authoringTool,
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

  const undo = useCallback(() => {
    if (pointerRef.current < 0) return;
    const command = historyRef.current[pointerRef.current];
    pointerRef.current--;
    setShapes((prev) => applyUndo(prev, command));
    onDirty();
    rerender();
  }, [rerender, setShapes, onDirty]);

  const redo = useCallback(() => {
    if (pointerRef.current >= historyRef.current.length - 1) return;
    pointerRef.current++;
    const command = historyRef.current[pointerRef.current];
    setShapes((prev) => applyRedo(prev, command));
    onDirty();
    rerender();
  }, [rerender, setShapes, onDirty]);

  const clear = useCallback(() => {
    historyRef.current = [];
    pointerRef.current = -1;
    rerender();
  }, [rerender]);

  // Tool-scoped undo: only fires if the topmost command was authored with one
  // of the supplied tool ids. The user wants line/polyline Cmd+Z to NOT cross
  // tool boundaries — switching to Line and pressing Cmd+Z should only roll
  // back actions made with Line, not the polyline before it.
  const canUndoForTools = useCallback((tools: ToolId[]) => {
    if (pointerRef.current < 0) return false;
    const top = historyRef.current[pointerRef.current];
    return !!top.authoringTool && tools.includes(top.authoringTool);
  }, []);

  const undoForTools = useCallback(
    (tools: ToolId[]) => {
      if (!canUndoForTools(tools)) return;
      const command = historyRef.current[pointerRef.current];
      pointerRef.current--;
      setShapes((prev) => applyUndo(prev, command));
      onDirty();
      rerender();
    },
    [canUndoForTools, rerender, setShapes, onDirty],
  );

  // Refs are the source of truth for undo state; mutations call `rerender()`
  // to schedule a re-render, so by the time React reads this return object
  // the refs reflect the latest mutation. The React 19 `react-hooks/refs`
  // rule (downgraded to a warning in eslint.config.mjs) flags these reads,
  // but the state-mirror alternative would require duplicate state for every
  // ref — doubling memory and adding sync churn for no behavioral gain.
  return {
    canUndo: pointerRef.current >= 0,
    canRedo: pointerRef.current < historyRef.current.length - 1,
    undo,
    redo,
    pushCommand,
    pushBatch,
    clear,
    historyLength: historyRef.current.length,
    pointer: pointerRef.current,
    canUndoForTools,
    undoForTools,
  };
}

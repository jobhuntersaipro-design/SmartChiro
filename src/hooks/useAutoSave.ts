"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";
import { AnnotationSaver, type SaveStatus } from "@/lib/annotation-saver";

interface UseAutoSaveOptions {
  annotationId: string | null;
  /** Server version of `annotationId` as loaded, for conflict detection. */
  annotationVersion?: number | null;
  xrayId: string;
  userId: string;
  interval?: number; // ms, default 30000
  debounceMs?: number; // ms, default 500
}

interface UseAutoSaveReturn {
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  sizeWarning: string | null;
  markDirty: () => void;
  updateState: (state: AnnotationCanvasState, adjustments: ImageAdjustments) => void;
  saveNow: (state: AnnotationCanvasState, adjustments: ImageAdjustments) => Promise<void>;
  /** Retry after a failure; after a conflict this overwrites the other copy. */
  retrySave: () => void;
  /** Switch the target xray and annotation for saves (multi-view). Pending edits are saved to the old target first. */
  switchTarget: (xrayId: string, annotationId: string | null, version?: number | null) => void;
  /** Save now; resolves with the X-ray + annotation the edits went to (for export). */
  saveAndGetTarget: (
    state: AnnotationCanvasState,
    adjustments: ImageAdjustments,
  ) => Promise<{ xrayId: string; annotationId: string | null }>;
  /** Live (not render-time) check, e.g. after awaiting a save before leaving. */
  hasUnsavedChanges: () => boolean;
  /** See AnnotationSaver.adoptIfEditing. */
  adoptIfEditing: (annotationId: string, version: number | null) => boolean;
  /** Current annotation ID (may be created during save) */
  currentAnnotationId: string | null;
  currentVersion: number | null;
}

export function useAutoSave({
  annotationId: initialAnnotationId,
  annotationVersion = null,
  xrayId,
  userId,
  interval = 30000,
  debounceMs = 500,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  const [saver] = useState(
    () =>
      new AnnotationSaver(
        { xrayId, annotationId: initialAnnotationId, version: annotationVersion },
        userId,
        {
          onStatus: (status, error) => {
            setSaveStatus(status);
            setSaveError(error);
          },
          onDirty: setIsDirty,
          onSaved: setLastSavedAt,
          onSizeWarning: setSizeWarning,
        },
        undefined,
        debounceMs,
      ),
  );

  const markDirty = useCallback(() => saver.markDirty(), [saver]);

  const updateState = useCallback(
    (state: AnnotationCanvasState, adjustments: ImageAdjustments) => saver.update(state, adjustments),
    [saver],
  );

  const saveNow = useCallback(
    (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      saver.update(state, adjustments);
      return saver.flush({ force: true });
    },
    [saver],
  );

  const retrySave = useCallback(() => {
    void saver.retry();
  }, [saver]);

  const switchTarget = useCallback(
    (newXrayId: string, newAnnotationId: string | null, version: number | null = null) => {
      void saver.switchTarget({ xrayId: newXrayId, annotationId: newAnnotationId, version });
    },
    [saver],
  );

  const saveAndGetTarget = useCallback(
    async (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      saver.update(state, adjustments);
      await saver.flush({ force: true });
      return { xrayId: saver.xrayId, annotationId: saver.annotationId };
    },
    [saver],
  );

  const hasUnsavedChanges = useCallback(() => saver.isDirty, [saver]);

  const adoptIfEditing = useCallback(
    (annotationId: string, version: number | null) => saver.adoptIfEditing(annotationId, version),
    [saver],
  );

  // Safety net: periodic save of anything the debounce missed.
  useEffect(() => {
    const timer = setInterval(() => void saver.flush(), interval);
    return () => clearInterval(timer);
  }, [saver, interval]);

  // Leaving the page: fire the pending edits with sendBeacon (survives the tab
  // closing) and ask the browser to confirm while anything is unsaved.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const request = saver.unloadRequest();
      if (request) {
        navigator.sendBeacon(request.url, new Blob([request.body], { type: "application/json" }));
      }
      if (request || saver.isSaving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saver]);

  // In-app navigation (router links) unmounts without beforeunload — flush with keepalive.
  useEffect(() => {
    return () => {
      const request = saver.unloadRequest();
      if (request) {
        void fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request.body,
          keepalive: true,
        }).catch(() => undefined);
      }
      saver.dispose();
    };
  }, [saver]);

  return {
    isDirty,
    isSaving: saveStatus === "saving" || saveStatus === "retrying",
    lastSavedAt,
    saveStatus,
    saveError,
    sizeWarning,
    markDirty,
    updateState,
    saveNow,
    retrySave,
    switchTarget,
    saveAndGetTarget,
    hasUnsavedChanges,
    adoptIfEditing,
    currentAnnotationId: saver.annotationId,
    currentVersion: saver.version,
  };
}

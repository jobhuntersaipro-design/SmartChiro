"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

interface UseAutoSaveOptions {
  annotationId: string | null;
  interval?: number; // ms, default 30000
  debounceMs?: number; // ms, default 500
}

interface UseAutoSaveReturn {
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  markDirty: () => void;
  saveNow: (state: AnnotationCanvasState, adjustments: ImageAdjustments) => Promise<void>;
}

export function useAutoSave({
  annotationId,
  interval = 30000,
  debounceMs = 500,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const latestStateRef = useRef<AnnotationCanvasState | null>(null);
  const latestAdjustmentsRef = useRef<ImageAdjustments | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      if (!annotationId) return;

      setIsSaving(true);
      try {
        const body = JSON.stringify({
          canvasState: state,
          canvasStateSize: new Blob([JSON.stringify(state)]).size,
          imageAdjustments: adjustments,
        });

        const res = await fetch(`/api/annotations/${annotationId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (res.ok) {
          setIsDirty(false);
          setLastSavedAt(new Date());
        }
      } finally {
        setIsSaving(false);
      }
    },
    [annotationId]
  );

  const saveNow = useCallback(
    async (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      latestStateRef.current = state;
      latestAdjustmentsRef.current = adjustments;
      await save(state, adjustments);
    },
    [save]
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Auto-save on interval
  useEffect(() => {
    if (!annotationId) return;

    const timer = setInterval(() => {
      if (
        latestStateRef.current &&
        latestAdjustmentsRef.current &&
        isDirty
      ) {
        save(latestStateRef.current, latestAdjustmentsRef.current);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [annotationId, interval, isDirty, save]);

  // Debounced save on tool switch (caller triggers markDirty)
  useEffect(() => {
    if (!isDirty || !annotationId) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (latestStateRef.current && latestAdjustmentsRef.current) {
        save(latestStateRef.current, latestAdjustmentsRef.current);
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isDirty, annotationId, debounceMs, save]);

  // beforeunload — attempt save via sendBeacon
  useEffect(() => {
    if (!annotationId) return;

    const handleBeforeUnload = () => {
      if (latestStateRef.current && latestAdjustmentsRef.current && isDirty) {
        const body = JSON.stringify({
          canvasState: latestStateRef.current,
          canvasStateSize: new Blob([JSON.stringify(latestStateRef.current)]).size,
          imageAdjustments: latestAdjustmentsRef.current,
        });
        navigator.sendBeacon(
          `/api/annotations/${annotationId}`,
          new Blob([body], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [annotationId, isDirty]);

  return {
    isDirty,
    isSaving,
    lastSavedAt,
    markDirty,
    saveNow,
  };
}

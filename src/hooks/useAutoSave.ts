"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

interface UseAutoSaveOptions {
  annotationId: string | null;
  xrayId: string;
  userId: string;
  interval?: number; // ms, default 30000
  debounceMs?: number; // ms, default 500
}

type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "failed";

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
  retrySave: () => void;
  /** Switch the target xray and annotation for saves (used in multi-view) */
  switchTarget: (xrayId: string, annotationId: string | null) => void;
  /** Current annotation ID (may be created during save) */
  currentAnnotationId: string | null;
}

const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024; // 10 MB
const WARN_CANVAS_STATE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_RETRIES = 3;

export function useAutoSave({
  annotationId: initialAnnotationId,
  xrayId,
  userId,
  interval = 30000,
  debounceMs = 500,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  const latestStateRef = useRef<AnnotationCanvasState | null>(null);
  const latestAdjustmentsRef = useRef<ImageAdjustments | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const annotationIdRef = useRef<string | null>(initialAnnotationId);
  const xrayIdRef = useRef<string>(xrayId);

  const save = useCallback(
    async (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      // If no annotation exists yet, create one for this xrayId
      if (!annotationIdRef.current) {
        try {
          const createRes = await fetch(`/api/xrays/${xrayIdRef.current}/annotations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              canvasState: state,
              canvasStateSize: new Blob([JSON.stringify(state)]).size,
              imageAdjustments: adjustments,
              createdById: userId,
            }),
          });
          if (createRes.ok) {
            const data = await createRes.json();
            annotationIdRef.current = data.annotation.id;
            setIsDirty(false);
            setLastSavedAt(new Date());
            setSaveStatus("saved");
            retryCountRef.current = 0;
          } else {
            throw new Error(`Create failed with status ${createRes.status}`);
          }
        } catch {
          setSaveStatus("failed");
          setSaveError("Failed to create annotation. Check your connection.");
        }
        return;
      }

      // Check canvas state size
      const stateJson = JSON.stringify(state);
      const canvasStateSize = new Blob([stateJson]).size;

      if (canvasStateSize > MAX_CANVAS_STATE_SIZE) {
        setSaveStatus("failed");
        setSaveError("Annotation data is too large. Try simplifying some shapes.");
        setSizeWarning(null);
        return;
      }

      if (canvasStateSize > WARN_CANVAS_STATE_SIZE) {
        setSizeWarning("Annotation file is getting large. Consider simplifying some shapes.");
      } else {
        setSizeWarning(null);
      }

      setIsSaving(true);
      setSaveStatus(retryCountRef.current > 0 ? "retrying" : "saving");
      setSaveError(null);

      try {
        const body = JSON.stringify({
          canvasState: state,
          canvasStateSize,
          imageAdjustments: adjustments,
        });

        const res = await fetch(`/api/annotations/${annotationIdRef.current}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (res.ok) {
          setIsDirty(false);
          setLastSavedAt(new Date());
          setSaveStatus("saved");
          retryCountRef.current = 0;
        } else {
          throw new Error(`Save failed with status ${res.status}`);
        }
      } catch {
        retryCountRef.current++;

        if (retryCountRef.current < MAX_RETRIES) {
          // Auto-retry with exponential backoff
          setSaveStatus("retrying");
          setSaveError(`Save failed — retrying... (${retryCountRef.current}/${MAX_RETRIES})`);
          const delay = Math.pow(2, retryCountRef.current) * 1000; // 2s, 4s
          setTimeout(() => {
            if (latestStateRef.current && latestAdjustmentsRef.current) {
              save(latestStateRef.current, latestAdjustmentsRef.current);
            }
          }, delay);
        } else {
          setSaveStatus("failed");
          setSaveError("Unable to save. Check your connection.");
          retryCountRef.current = 0;
        }
      } finally {
        setIsSaving(false);
      }
    },
    [userId]
  );

  const saveNow = useCallback(
    async (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      latestStateRef.current = state;
      latestAdjustmentsRef.current = adjustments;
      retryCountRef.current = 0;
      await save(state, adjustments);
    },
    [save]
  );

  const retrySave = useCallback(() => {
    if (latestStateRef.current && latestAdjustmentsRef.current) {
      retryCountRef.current = 0;
      save(latestStateRef.current, latestAdjustmentsRef.current);
    }
  }, [save]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const switchTarget = useCallback((newXrayId: string, newAnnotationId: string | null) => {
    xrayIdRef.current = newXrayId;
    annotationIdRef.current = newAnnotationId;
    retryCountRef.current = 0;
    setIsDirty(false);
    setSaveStatus("idle");
    setSaveError(null);
    setSizeWarning(null);
  }, []);

  // Update the latest state refs so debounced/interval saves have current data
  const updateState = useCallback(
    (state: AnnotationCanvasState, adjustments: ImageAdjustments) => {
      latestStateRef.current = state;
      latestAdjustmentsRef.current = adjustments;
    },
    []
  );

  // Auto-save on interval
  useEffect(() => {
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
  }, [interval, isDirty, save]);

  // Debounced save on tool switch (caller triggers markDirty)
  useEffect(() => {
    if (!isDirty) return;

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
  }, [isDirty, debounceMs, save]);

  // beforeunload — attempt save via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (annotationIdRef.current && latestStateRef.current && latestAdjustmentsRef.current && isDirty) {
        const body = JSON.stringify({
          canvasState: latestStateRef.current,
          canvasStateSize: new Blob([JSON.stringify(latestStateRef.current)]).size,
          imageAdjustments: latestAdjustmentsRef.current,
        });
        navigator.sendBeacon(
          `/api/annotations/${annotationIdRef.current}`,
          new Blob([body], { type: "application/json" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  return {
    isDirty,
    isSaving,
    lastSavedAt,
    saveStatus,
    saveError,
    sizeWarning,
    markDirty,
    updateState,
    saveNow,
    retrySave,
    switchTarget,
    currentAnnotationId: annotationIdRef.current,
  };
}

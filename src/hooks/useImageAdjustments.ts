"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type ImageAdjustments,
  DEFAULT_IMAGE_ADJUSTMENTS,
} from "@/types/annotation";

interface UseImageAdjustmentsReturn {
  adjustments: ImageAdjustments;
  setBrightness: (value: number) => void;
  setContrast: (value: number) => void;
  setInvert: (value: boolean) => void;
  setPixelsPerMm: (value: number | undefined) => void;
  setOrientation: (value: Pick<ImageAdjustments, "flipH" | "flipV" | "rotation">) => void;
  /** Back to defaults — calibration is kept (it describes the film, not the view). */
  reset: () => void;
  /** Swap in another X-ray's saved adjustments (multi-view slot switch). */
  replace: (value: ImageAdjustments) => void;
  cssFilter: string;
  isModified: boolean;
}

export function useImageAdjustments(
  initial?: ImageAdjustments
): UseImageAdjustmentsReturn {
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(
    initial ?? { ...DEFAULT_IMAGE_ADJUSTMENTS }
  );

  const setBrightness = useCallback((value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      brightness: Math.max(-100, Math.min(100, value)),
    }));
  }, []);

  const setContrast = useCallback((value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      contrast: Math.max(-100, Math.min(100, value)),
    }));
  }, []);

  const setInvert = useCallback((value: boolean) => {
    setAdjustments((prev) => ({ ...prev, invert: value }));
  }, []);

  const setPixelsPerMm = useCallback((value: number | undefined) => {
    setAdjustments((prev) => ({ ...prev, pixelsPerMm: value }));
  }, []);

  const setOrientation = useCallback(
    (value: Pick<ImageAdjustments, "flipH" | "flipV" | "rotation">) => {
      setAdjustments((prev) => ({ ...prev, ...value }));
    },
    [],
  );

  const reset = useCallback(() => {
    setAdjustments((prev) => ({ ...DEFAULT_IMAGE_ADJUSTMENTS, pixelsPerMm: prev.pixelsPerMm }));
  }, []);

  const replace = useCallback((value: ImageAdjustments) => {
    setAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS, ...value });
  }, []);

  const cssFilter = useMemo(() => adjustmentsToCssFilter(adjustments), [adjustments]);

  const isModified = useMemo(() => {
    return (
      adjustments.brightness !== 0 ||
      adjustments.contrast !== 0 ||
      adjustments.invert !== false ||
      !!adjustments.flipH ||
      !!adjustments.flipV ||
      (adjustments.rotation ?? 0) !== 0
    );
  }, [adjustments]);

  return {
    adjustments,
    setBrightness,
    setContrast,
    setInvert,
    setPixelsPerMm,
    setOrientation,
    reset,
    replace,
    cssFilter,
    isModified,
  };
}

/**
 * CSS filter string for brightness/contrast/invert.
 * brightness: 0 → 1.0 (100%), -100 → 0.0, +100 → 2.0; contrast likewise.
 */
export function adjustmentsToCssFilter(adjustments: ImageAdjustments): string {
  const b = 1 + adjustments.brightness / 100;
  const c = 1 + adjustments.contrast / 100;
  const filters = [`brightness(${b})`, `contrast(${c})`];
  if (adjustments.invert) filters.push("invert(1)");
  return filters.join(" ");
}

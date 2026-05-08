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
  reset: () => void;
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

  const reset = useCallback(() => {
    setAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS });
  }, []);

  // CSS filter string for brightness/contrast/invert
  // brightness: 0 → 1.0 (100%), -100 → 0.0, +100 → 2.0
  // contrast: 0 → 1.0, -100 → 0.0, +100 → 2.0
  const cssFilter = useMemo(() => {
    const b = 1 + adjustments.brightness / 100;
    const c = 1 + adjustments.contrast / 100;
    const filters = [`brightness(${b})`, `contrast(${c})`];
    if (adjustments.invert) filters.push("invert(1)");
    return filters.join(" ");
  }, [adjustments.brightness, adjustments.contrast, adjustments.invert]);

  const isModified = useMemo(() => {
    return (
      adjustments.brightness !== 0 ||
      adjustments.contrast !== 0 ||
      adjustments.invert !== false
    );
  }, [adjustments]);

  return {
    adjustments,
    setBrightness,
    setContrast,
    setInvert,
    setPixelsPerMm,
    reset,
    cssFilter,
    isModified,
  };
}

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
  setWindowCenter: (value: number) => void;
  setWindowWidth: (value: number) => void;
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

  const setWindowCenter = useCallback((value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      windowCenter: Math.max(0, Math.min(255, value)),
    }));
  }, []);

  const setWindowWidth = useCallback((value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      windowWidth: Math.max(1, Math.min(512, value)),
    }));
  }, []);

  const reset = useCallback(() => {
    setAdjustments({ ...DEFAULT_IMAGE_ADJUSTMENTS });
  }, []);

  // CSS filter string for brightness/contrast
  // brightness: 0 → 1.0 (100%), -100 → 0.0, +100 → 2.0
  // contrast: 0 → 1.0, -100 → 0.0, +100 → 2.0
  const cssFilter = useMemo(() => {
    const b = 1 + adjustments.brightness / 100;
    const c = 1 + adjustments.contrast / 100;
    return `brightness(${b}) contrast(${c})`;
  }, [adjustments.brightness, adjustments.contrast]);

  const isModified = useMemo(() => {
    return (
      adjustments.brightness !== 0 ||
      adjustments.contrast !== 0 ||
      adjustments.invert !== false ||
      adjustments.windowCenter !== 128 ||
      adjustments.windowWidth !== 256
    );
  }, [adjustments]);

  return {
    adjustments,
    setBrightness,
    setContrast,
    setInvert,
    setWindowCenter,
    setWindowWidth,
    reset,
    cssFilter,
    isModified,
  };
}

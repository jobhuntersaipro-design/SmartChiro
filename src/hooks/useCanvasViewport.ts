"use client";

import { useCallback, useRef, useState } from "react";
import {
  type ViewTransform,
  type Point,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_SCROLL_STEP,
  ZOOM_SHORTCUT_STEP,
  CANVAS_PADDING,
  screenToImage,
  imageToScreen,
} from "@/types/annotation";

interface UseCanvasViewportOptions {
  imageWidth: number;
  imageHeight: number;
}

export function useCanvasViewport({ imageWidth, imageHeight }: UseCanvasViewportOptions) {
  const [transform, setTransform] = useState<ViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = useCallback((zoom: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  }, []);

  // Zoom centered on a specific point (e.g. cursor position)
  const zoomAtPoint = useCallback(
    (newZoom: number, anchorScreenX: number, anchorScreenY: number) => {
      const clamped = clampZoom(newZoom);
      setTransform((prev) => {
        // Convert anchor from screen to image space using old transform
        const imagePos = screenToImage(anchorScreenX, anchorScreenY, prev);
        // Compute new pan so the same image point stays under the cursor
        const newPanX = anchorScreenX - imagePos.x * clamped;
        const newPanY = anchorScreenY - imagePos.y * clamped;
        return { zoom: clamped, panX: newPanX, panY: newPanY };
      });
    },
    [clampZoom]
  );

  // Zoom centered on viewport center
  const zoomAtCenter = useCallback(
    (newZoom: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      zoomAtPoint(newZoom, rect.width / 2, rect.height / 2);
    },
    [zoomAtPoint]
  );

  const zoomIn = useCallback(() => {
    setTransform((prev) => {
      const newZoom = clampZoom(prev.zoom * ZOOM_SHORTCUT_STEP);
      const container = containerRef.current;
      if (!container) return { ...prev, zoom: newZoom };
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const imagePos = screenToImage(cx, cy, prev);
      return {
        zoom: newZoom,
        panX: cx - imagePos.x * newZoom,
        panY: cy - imagePos.y * newZoom,
      };
    });
  }, [clampZoom]);

  const zoomOut = useCallback(() => {
    setTransform((prev) => {
      const newZoom = clampZoom(prev.zoom / ZOOM_SHORTCUT_STEP);
      const container = containerRef.current;
      if (!container) return { ...prev, zoom: newZoom };
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const imagePos = screenToImage(cx, cy, prev);
      return {
        zoom: newZoom,
        panX: cx - imagePos.x * newZoom,
        panY: cy - imagePos.y * newZoom,
      };
    });
  }, [clampZoom]);

  // Fit image to viewport with padding
  const fitToViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageWidth || !imageHeight) return;
    const rect = container.getBoundingClientRect();
    const availW = rect.width - CANVAS_PADDING * 2;
    const availH = rect.height - CANVAS_PADDING * 2;
    const zoom = clampZoom(Math.min(availW / imageWidth, availH / imageHeight));
    const panX = (rect.width - imageWidth * zoom) / 2;
    const panY = (rect.height - imageHeight * zoom) / 2;
    setTransform({ zoom, panX, panY });
  }, [imageWidth, imageHeight, clampZoom]);

  // Zoom to 100% (1:1 pixel mapping), centered
  const zoomToActual = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const panX = (rect.width - imageWidth) / 2;
    const panY = (rect.height - imageHeight) / 2;
    setTransform({ zoom: 1, panX, panY });
  }, [imageWidth, imageHeight]);

  // Handle scroll wheel zoom — requires Ctrl/Cmd modifier (or pinch-to-zoom which sets ctrlKey)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();

      // Only zoom when Ctrl (Windows/Linux) or Cmd (Mac) is held, or pinch gesture
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_SCROLL_STEP : 1 / ZOOM_SCROLL_STEP;
      setTransform((prev) => {
        const newZoom = clampZoom(prev.zoom * factor);
        const imagePos = screenToImage(mouseX, mouseY, prev);
        return {
          zoom: newZoom,
          panX: mouseX - imagePos.x * newZoom,
          panY: mouseY - imagePos.y * newZoom,
        };
      });
    },
    [clampZoom]
  );

  // Pan by delta
  const pan = useCallback((deltaX: number, deltaY: number) => {
    setTransform((prev) => ({
      ...prev,
      panX: prev.panX + deltaX,
      panY: prev.panY + deltaY,
    }));
  }, []);

  // Convert screen coords to image coords
  const toImageSpace = useCallback(
    (screenX: number, screenY: number): Point => {
      return screenToImage(screenX, screenY, transform);
    },
    [transform]
  );

  // Convert image coords to screen coords
  const toScreenSpace = useCallback(
    (imageX: number, imageY: number): Point => {
      return imageToScreen(imageX, imageY, transform);
    },
    [transform]
  );

  return {
    transform,
    setTransform,
    containerRef,
    zoomIn,
    zoomOut,
    zoomAtPoint,
    zoomAtCenter,
    fitToViewport,
    zoomToActual,
    handleWheel,
    pan,
    toImageSpace,
    toScreenSpace,
    zoomPercent: Math.round(transform.zoom * 100),
  };
}

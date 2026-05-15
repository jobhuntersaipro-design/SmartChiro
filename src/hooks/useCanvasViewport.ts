"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  applyZoomAroundAnchor,
} from "@/types/annotation";

interface UseCanvasViewportOptions {
  imageWidth: number;
  imageHeight: number;
}

export function useCanvasViewport({ imageWidth, imageHeight }: UseCanvasViewportOptions) {
  // Start at zoom ~0 so the image is invisible (scale(0.001)) until fitToViewport runs.
  // This prevents the "flash of full-size image" on page load.
  // Using 0.001 instead of 0 to avoid division-by-zero in coordinate transforms.
  const [transform, setTransform] = useState<ViewTransform>({
    zoom: 0.001,
    panX: 0,
    panY: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = useCallback((zoom: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  }, []);

  // Zoom centered on a specific point (e.g. cursor position).
  // Absolute target zoom — useful for slider input or "zoom to 200%" jumps.
  // For wheel events, prefer `zoomBy` so the multiplier composes with the
  // freshest committed state (avoids sticky feel + drift on rapid events).
  const zoomAtPoint = useCallback(
    (newZoom: number, anchorScreenX: number, anchorScreenY: number) => {
      setTransform((prev) => {
        // Use applyZoomAroundAnchor with factor = newZoom / prev.zoom so the
        // helper handles clamping + the cursor-anchor invariant identically
        // to the wheel path.
        const factor = newZoom / prev.zoom;
        return applyZoomAroundAnchor(prev, factor, anchorScreenX, anchorScreenY);
      });
    },
    []
  );

  // Zoom by a multiplicative factor (e.g. 1.1 in, 0.9 out) anchored on the
  // given screen point. Reads the freshest zoom inside setTransform so rapid
  // wheel events compose cleanly without drift or stale-base stalling.
  const zoomBy = useCallback(
    (factor: number, anchorScreenX: number, anchorScreenY: number) => {
      setTransform((prev) =>
        applyZoomAroundAnchor(prev, factor, anchorScreenX, anchorScreenY)
      );
    },
    []
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

  // Fit image to viewport with padding. We deliberately use a TIGHT 4px
  // padding (well under the legacy CANVAS_PADDING=24) so the X-ray
  // dominates the cell — chiropractors complained the image looked
  // shrunken when there was 24px of empty space on every side, especially
  // in 2×2 mode where cells are already squat.
  const fitToViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageWidth || !imageHeight) return;
    const rect = container.getBoundingClientRect();
    const PAD = 4;
    const availW = rect.width - PAD * 2;
    const availH = rect.height - PAD * 2;
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
      zoomBy(factor, mouseX, mouseY);
    },
    [zoomBy]
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

  // Auto-refit when the container box changes (e.g. user switches between
  // single / side-by-side / 2×2, or resizes the window). Without this the
  // viewport's zoom stays computed for the prior cell size, leaving the
  // image off-center and at the wrong scale until the user manually hits
  // Fit. We refit on EVERY observation — including the initial one —
  // because that's the rect that reflects post-layout size, and skipping
  // it can leave a transient pre-layout fit (e.g. when imageLoaded fired
  // before the new cell height was applied) as the persisted state.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      fitToViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToViewport]);

  return {
    transform,
    setTransform,
    containerRef,
    zoomIn,
    zoomOut,
    zoomAtPoint,
    zoomBy,
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

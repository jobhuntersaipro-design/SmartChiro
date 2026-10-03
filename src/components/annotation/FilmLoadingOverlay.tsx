"use client";

import { ImageOff, Loader2 } from "lucide-react";

/** Covers a viewer pane until its film has loaded, so a slow image never looks like an empty canvas. */
export function FilmLoadingOverlay({ failed = false, compact = false }: { failed?: boolean; compact?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-canvas"
      role="status"
      aria-live="polite"
      aria-busy={!failed}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        {failed ? (
          <ImageOff className="size-6 text-white/50" strokeWidth={1.5} aria-hidden />
        ) : (
          <Loader2 className="size-6 animate-spin text-white/60" strokeWidth={1.5} aria-hidden />
        )}
        <p className={compact ? "text-[11px] text-white/60" : "text-[13px] text-white/70"}>
          {failed ? "Couldn't load this X-ray. Reload the page to try again." : "Loading X-ray and annotations…"}
        </p>
        {!failed && !compact && (
          <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-film-loading rounded-full bg-brand" />
          </div>
        )}
      </div>
    </div>
  );
}

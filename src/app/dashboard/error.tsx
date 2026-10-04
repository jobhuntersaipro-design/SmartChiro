"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const RELOAD_KEY = "smartchiro:chunk-reload-at";

/** A tab opened before a deploy asks for code files that no longer exist. */
function isStaleChunk(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /Loading chunk|Failed to load chunk|dynamically imported module|Importing a module script failed/i.test(error.message)
  );
}

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleChunk(error);

  useEffect(() => {
    if (!stale) {
      console.error(error);
      return;
    }
    // Reload once to pick up the new version (not again within a minute, so a
    // real failure can't loop).
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // storage blocked: still reload once
    }
    window.location.reload();
  }, [error, stale]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-panel border border-border bg-surface p-6 text-center shadow-(--shadow-card)">
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
      <h2 className="mt-3 font-heading text-[18px] font-medium text-foreground">
        {stale ? "SmartChiro was just updated" : "Something went wrong"}
      </h2>
      <p className="mt-1 text-[14px] text-fg-secondary">
        {stale ? "Reload the page to get the new version." : "Try again. If it keeps happening, reload the page."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {!stale && (
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        )}
        <Button onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReportPayload, ReportSection } from "@/types/reports";

export interface ReportQuery {
  branchId: string;
  from: string;
  to: string;
}

export interface ReportState<T> {
  data: T | null;
  /** A request is in flight (the previous data, if any, stays on screen). */
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Loads one report section. Each card calls this on its own, so a slow
 * section never holds up the others. On a range change the last result is
 * kept (shown dimmed) until the new one arrives.
 */
export function useReport<S extends ReportSection>(section: S, query: ReportQuery): ReportState<ReportPayload[S]> {
  const [attempt, setAttempt] = useState(0);
  const { branchId, from, to } = query;
  const key = `${section}|${branchId}|${from}|${to}|${attempt}`;
  // The last settled request; while `key` differs from it, a request is in flight.
  const [result, setResult] = useState<{ key: string; data: ReportPayload[S] | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ branchId, from, to });
    fetch(`/api/reports/${section}?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.message ?? "This report couldn't be loaded.");
        setResult({ key, data: body as ReportPayload[S], error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "This report couldn't be loaded.";
        setResult((prev) => ({ key, data: prev.data, error: message }));
      });
    return () => controller.abort();
  }, [key, section, branchId, from, to]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = result.key !== key;
  return { data: result.data, loading, error: loading ? null : result.error, retry };
}

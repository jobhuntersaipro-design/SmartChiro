"use client";

import { useEffect, useState } from "react";
import type { PublicSlot } from "@/types/booking";

interface Query {
  slug: string;
  treatment: string | null;
  doctorId: string | null;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function params(q: Query, extra: Record<string, string>): string {
  return new URLSearchParams({ treatment: q.treatment ?? "", doctorId: q.doctorId ?? "any", ...extra }).toString();
}

function useJson<T>(url: string | null, pick: (body: unknown) => T, reloadKey = 0): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T> & { url: string | null; key: number }>({
    data: null,
    loading: false,
    error: null,
    url: null,
    key: -1,
  });
  // Mark as loading during render when the request changes, so stale data never shows.
  if (url && (state.url !== url || state.key !== reloadKey)) {
    setState({ data: null, loading: true, error: null, url, key: reloadKey });
  }
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error(res.status === 429 ? "rate_limited" : "failed");
        setState((s) => (s.url === url ? { ...s, data: pick(body), loading: false } : s));
      })
      .catch((e: Error) => {
        if (controller.signal.aborted) return;
        setState((s) => (s.url === url ? { ...s, loading: false, error: e.message } : s));
      });
    return () => controller.abort();
    // `pick` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloadKey]);
  return url ? state : { data: null, loading: false, error: null };
}

const pickDays = (body: unknown) => new Set(((body as { days?: string[] })?.days ?? []) as string[]);
const pickSlots = (body: unknown) => ((body as { slots?: PublicSlot[] })?.slots ?? []) as PublicSlot[];

/** Days of `month` ("YYYY-MM") with at least one slot. */
export function useAvailableDays(q: Query, month: string | null) {
  const url = q.treatment && q.doctorId && month ? `/api/public/booking/${q.slug}/days?${params(q, { month })}` : null;
  return useJson(url, pickDays);
}

/** Slot start times on `date` ("YYYY-MM-DD"). Bump `reloadKey` to refetch. */
export function useSlots(q: Query, date: string | null, reloadKey: number) {
  const url = q.treatment && q.doctorId && date ? `/api/public/booking/${q.slug}/slots?${params(q, { date })}` : null;
  return useJson(url, pickSlots, reloadKey);
}

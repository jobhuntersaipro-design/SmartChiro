"use client";

import { useEffect, useState } from "react";
import type { RepeatRulePayload } from "@/lib/package-ui";
import type { OccurrenceCheckJson } from "@/types/packages";

export interface SeriesPreview {
  occurrences: OccurrenceCheckJson[];
  summary: { total: number; ok: number; withProblems: number };
  capped: boolean;
}

interface Args {
  /** Null disables the preview (repeat off or the form is incomplete). */
  rule: RepeatRulePayload | null;
  branchId: string | null | undefined;
  doctorId: string | null | undefined;
  patientId?: string | null;
  duration: number;
  treatmentType?: string | null;
}

/** Debounced dry run of a repeat rule (POST /api/appointment-series/preview). */
export function useSeriesPreview({ rule, branchId, doctorId, patientId, duration, treatmentType }: Args) {
  const [preview, setPreview] = useState<SeriesPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = rule && branchId && doctorId
    ? JSON.stringify({ rule, branchId, doctorId, patientId: patientId ?? undefined, duration, treatmentType: treatmentType || undefined })
    : null;

  useEffect(() => {
    if (!key) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }
    const { rule: r, ...rest } = JSON.parse(key) as { rule: RepeatRulePayload } & Record<string, unknown>;
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/appointment-series/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, ...r }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as Partial<SeriesPreview> & { message?: string };
        if (!res.ok || !data.occurrences) {
          setPreview(null);
          setError(data.message ?? "Couldn't check these dates.");
        } else {
          setPreview(data as SeriesPreview);
          setError(null);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't check these dates.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [key]);

  return { preview, loading, error };
}

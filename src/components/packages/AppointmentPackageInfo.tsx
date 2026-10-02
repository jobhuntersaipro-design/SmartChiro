"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Package, Undo2 } from "lucide-react";
import { packageCoversTreatment, redemptionToast, sessionsUsedLabel } from "@/lib/package-ui";
import type { PatientPackageJson, RedemptionSummaryJson } from "@/types/packages";

interface Props {
  appointmentId: string;
  status: string;
  patientId: string;
  treatmentType: string | null | undefined;
  /** Redeem / undo: `appointment.manageAll` or the appointment's own doctor. */
  canRedeem: boolean;
  /** Smaller type for the calendar popover. */
  compact?: boolean;
  onChanged?: () => void;
}

/**
 * "Package: 12 Adjustments — 5 of 12 used" + Undo on a completed visit, or
 * "Use package session" when it has none and the patient has a matching package.
 */
export function AppointmentPackageInfo({
  appointmentId,
  status,
  patientId,
  treatmentType,
  canRedeem,
  compact = false,
  onChanged,
}: Props) {
  const [redemption, setRedemption] = useState<RedemptionSummaryJson | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [eligible, setEligible] = useState<PatientPackageJson[]>([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const completed = status === "COMPLETED";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`);
      const data = res.ok ? ((await res.json()) as { appointment?: { redemption?: RedemptionSummaryJson | null } }) : null;
      const r = data?.appointment?.redemption ?? null;
      setRedemption(r);
      if (!r && canRedeem) {
        const pres = await fetch(`/api/patients/${patientId}/packages`);
        const pdata = pres.ok ? ((await pres.json()) as { packages: PatientPackageJson[] }) : { packages: [] };
        const list = pdata.packages.filter(
          (p) => p.effectiveStatus === "ACTIVE" && packageCoversTreatment(p.treatmentTypes, treatmentType),
        );
        setEligible(list);
        // "" = let the server pick (the series' package first, else the earliest-expiring one).
        setChoice("");
      } else {
        setEligible([]);
      }
    } catch {
      setRedemption(null);
    } finally {
      setLoaded(true);
    }
  }, [appointmentId, patientId, treatmentType, canRedeem]);

  useEffect(() => {
    setLoaded(false);
    setRedemption(null);
    setEligible([]);
    if (completed) void load();
  }, [completed, load]);

  if (!completed || !loaded) return null;
  if (!redemption && eligible.length === 0) return null;

  async function undo() {
    setBusy(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/redeem/reverse`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Couldn't give the session back.");
        return;
      }
      toast.success(redemption ? `Session given back to ${redemption.packageName}` : "Session given back");
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(choice ? { patientPackageId: choice } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { redemption?: RedemptionSummaryJson; message?: string };
      if (!res.ok || !data.redemption) {
        toast.error(data.message ?? "Couldn't use a package session.");
        return;
      }
      toast.success(redemptionToast(data.redemption));
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const text = compact ? "text-[12px]" : "text-[13px]";
  const button = `inline-flex items-center gap-1 rounded-control border border-border bg-white px-2 font-medium transition-colors hover:bg-surface-muted disabled:opacity-60 ${compact ? "h-6 text-[11px]" : "h-7 text-[12px]"}`;

  if (redemption) {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md bg-brand-subtle px-2.5 py-1.5 ${text}`}>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
          <Package className="h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={1.75} />
          <span className="truncate">
            Package: <span className="font-medium text-foreground">{redemption.packageName}</span>
            {" — "}
            <span className="tabular-nums">{sessionsUsedLabel(redemption.sessionsUsed, redemption.sessionsTotal)}</span>
          </span>
        </span>
        {canRedeem && (
          <button type="button" onClick={() => void undo()} disabled={busy} className={`${button} text-warning`}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" strokeWidth={1.75} />}
            Undo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 py-1.5 ${text}`}>
      <Package className="h-3.5 w-3.5 shrink-0 text-fg-secondary" strokeWidth={1.75} />
      {eligible.length > 1 ? (
        <select
          aria-label="Package to use"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-control border border-border bg-white px-1.5 text-[12px] text-foreground"
        >
          <option value="">Best match (automatic)</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.sessionsLeft} left
            </option>
          ))}
        </select>
      ) : (
        <span className="min-w-0 flex-1 truncate text-fg-secondary">
          {eligible[0].name} · {eligible[0].sessionsLeft} left
        </span>
      )}
      <button type="button" onClick={() => void redeem()} disabled={busy} className={`${button} text-brand`}>
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Use package session
      </button>
    </div>
  );
}

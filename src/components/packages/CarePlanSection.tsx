"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Loader2, Package, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "./ModalShell";
import { CreateCarePlanDialog } from "./CreateCarePlanDialog";
import { clinicDateLabel, clinicInstantFromInputs } from "@/lib/clinic-time";
import { displayDoctorName } from "@/lib/format";
import { carePlanProgressView, sessionsUsedLabel } from "@/lib/package-ui";
import type { CarePlanJson, CarePlanStatusValue } from "@/types/packages";

interface Props {
  patientId: string;
  patientName: string;
  branchId: string;
  /** Default doctor for a new plan (the patient's doctor, or the signed-in DOCTOR). */
  defaultDoctor: { id: string; name: string } | null;
  canPickDoctor: boolean;
  /** Sell a catalogue package together with the plan. */
  canSell: boolean;
  /** Something the packages section shows changed (a sale). */
  onChanged?: () => void;
}

const STATUS_STYLE: Record<CarePlanStatusValue, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-success-subtle text-success" },
  COMPLETED: { label: "Completed", className: "bg-brand-subtle text-brand" },
  CANCELLED: { label: "Cancelled", className: "bg-surface-hover text-fg-secondary" },
};

/** Clinical: the patient's care plans with visit progress (never shown to front desk). */
export function CarePlanSection({ patientId, patientName, branchId, defaultDoctor, canPickDoctor, canSell, onChanged }: Props) {
  const [plans, setPlans] = useState<CarePlanJson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CarePlanJson | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}/care-plans`);
      if (!res.ok) {
        setError(res.status === 403 ? "Only the patient's doctor can see care plans." : "Couldn't load care plans.");
        return;
      }
      const data = (await res.json()) as { carePlans: CarePlanJson[] };
      setPlans(data.carePlans);
      setError(null);
    } catch {
      setError("Couldn't load care plans.");
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-panel border border-border bg-white" aria-labelledby="care-plans-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 id="care-plans-title" className="text-[16px] font-medium text-foreground">Care plan</h2>
          <p className="text-[13px] text-fg-secondary">Planned visits, progress and goals.</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-8 gap-1.5 rounded-control bg-primary text-[14px] text-white hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New care plan
        </Button>
      </div>

      <div className="px-5 py-4">
        {error && <p className="text-[14px] text-danger">{error}</p>}
        {!plans && !error && (
          <div className="flex items-center gap-2 text-[14px] text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading care plans…
          </div>
        )}
        {plans && plans.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-border-strong" strokeWidth={1.25} />
            <p className="text-[14px] text-fg-secondary">No care plan yet.</p>
            <p className="text-[13px] text-fg-muted">Plan the visits, book them and sell a package in one step.</p>
          </div>
        )}
        {plans && plans.length > 0 && (
          <div className="space-y-3">
            {plans.map((p) => (
              <CarePlanCard key={p.id} plan={p} onCancel={() => setCancelTarget(p)} />
            ))}
          </div>
        )}
      </div>

      <CreateCarePlanDialog
        open={createOpen}
        patientId={patientId}
        patientName={patientName}
        branchId={branchId}
        defaultDoctor={defaultDoctor}
        canPickDoctor={canPickDoctor}
        canSell={canSell}
        onClose={() => setCreateOpen(false)}
        onCreated={({ message }) => {
          setCreateOpen(false);
          toast.success(message);
          void load();
          onChanged?.();
        }}
      />
      <CancelCarePlanDialog
        plan={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={(message) => {
          setCancelTarget(null);
          toast.success(message);
          void load();
          onChanged?.();
        }}
      />
    </section>
  );
}

function CarePlanCard({ plan, onCancel }: { plan: CarePlanJson; onCancel: () => void }) {
  const v = carePlanProgressView(plan.progress);
  const style = STATUS_STYLE[plan.status];
  return (
    <div className="rounded-panel border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-foreground">{plan.title}</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${style.className}`}>{style.label}</span>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            {displayDoctorName(plan.doctor.name)} · {plan.visitsPerWeek}× a week · {plan.totalVisits} visits · from{" "}
            {clinicDateLabel(clinicInstantFromInputs(plan.startDate, "12:00"))}
          </p>
        </div>
        {plan.status === "ACTIVE" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-7 gap-1 rounded-control border-border px-2 text-[12px] text-warning"
          >
            <XCircle className="h-3 w-3" strokeWidth={1.75} /> Cancel plan
          </Button>
        )}
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
          <span className="font-medium tabular-nums text-foreground">
            {v.completed} of {v.planned} visits completed
          </span>
          <span className="tabular-nums text-fg-secondary">
            {v.upcoming} upcoming
            {v.missed > 0 ? ` · ${v.missed} missed` : ""}
            {v.unbooked > 0 ? ` · ${v.unbooked} not booked` : ""}
          </span>
        </div>
        <div
          className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-hover"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={v.planned}
          aria-valuenow={v.completed}
          aria-label={`${plan.title} progress`}
        >
          <div className="h-full bg-success" style={{ width: `${v.completedPct}%` }} />
          <div className="h-full bg-brand-subtle" style={{ width: `${v.upcomingPct}%` }} />
        </div>
      </div>

      {plan.package && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-fg-secondary">
          <Package className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
          {plan.package.name} — <span className="tabular-nums">{sessionsUsedLabel(plan.package.sessionsUsed, plan.package.sessionsTotal)}</span>
        </p>
      )}
      {plan.goals && (
        <p className="mt-2 whitespace-pre-wrap text-[13px] text-fg-secondary">
          <span className="font-medium text-foreground">Goals: </span>
          {plan.goals}
        </p>
      )}
    </div>
  );
}

function CancelCarePlanDialog({
  plan,
  onClose,
  onDone,
}: {
  plan: CarePlanJson | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [cancelRemaining, setCancelRemaining] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCancelRemaining(true);
    setError(null);
  }, [plan?.id]);

  async function submit() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/care-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", cancelRemaining }),
      });
      const data = (await res.json().catch(() => ({}))) as { cancelledAppointments?: number; message?: string };
      if (!res.ok) {
        setError(data.message ?? "Couldn't cancel the plan.");
        return;
      }
      const n = data.cancelledAppointments ?? 0;
      onDone(n > 0 ? `Care plan cancelled · ${n} upcoming visit${n === 1 ? "" : "s"} cancelled` : "Care plan cancelled");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={!!plan}
      role="alertdialog"
      title="Cancel care plan?"
      description={plan?.title}
      onClose={onClose}
      busy={saving}
      widthClass="max-w-md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="h-8 rounded-control text-[14px]">
            Keep plan
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="h-8 gap-1.5 rounded-control bg-danger text-[14px] hover:bg-danger/90"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            Cancel plan
          </Button>
        </>
      }
    >
      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
      <label className="flex items-start gap-2 text-[14px] text-foreground">
        <input
          type="checkbox"
          checked={cancelRemaining}
          onChange={(e) => setCancelRemaining(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span>
          Also cancel the remaining booked visits
          {plan ? ` (${plan.progress.upcoming} upcoming)` : ""}
        </span>
      </label>
      <p className="mt-2 text-[12px] text-fg-secondary">Completed visits and used package sessions stay as they are.</p>
    </ModalShell>
  );
}

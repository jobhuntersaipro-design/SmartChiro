"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABELS } from "@/lib/permissions";
import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";
import { cn } from "@/lib/utils";
import type { PlanState } from "@/lib/plans";
import type { BranchRole } from "@prisma/client";

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  signedUp: string;
  /** Signed up in the last 7 days. */
  newThisWeek: boolean;
  verified: boolean;
  state: PlanState;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  trialEndsLabel: string | null;
  subscriptionStatus: string | null;
  subscriptionInterval: string | null;
  renewsLabel: string | null;
  aiToday: number;
  aiDailyLimit: number;
  disabled: boolean;
  clinics: { name: string; role: BranchRole }[];
  isSelf: boolean;
}

type Filter = "all" | PlanState | "disabled";

const PLAN_PILL: Record<PlanState, { label: string; className: string }> = {
  subscribed: { label: "Subscribed", className: "bg-success-subtle text-success" },
  trial: { label: "Trial", className: "bg-brand-subtle text-brand" },
  expired: { label: "Expired", className: "bg-warning-subtle text-warning" },
};

export function SuperAdminView({ rows }: { rows: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      week: rows.filter((r) => r.newThisWeek).length,
      trial: rows.filter((r) => r.state === "trial").length,
      subscribed: rows.filter((r) => r.state === "subscribed").length,
      expired: rows.filter((r) => r.state === "expired").length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "disabled" ? !r.disabled : filter !== "all" && r.state !== filter) return false;
      if (!q) return true;
      return [r.name ?? "", r.email, ...r.clinics.map((c) => c.name)].some((t) => t.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-[23px] font-medium text-foreground">Super admin</h1>
        <p className="mt-1 text-[14px] text-fg-secondary">
          Everyone who signed up, their plan, and how much AI analysis they use. Daily AI limits count different X-rays per
          clinic day.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Sign-ups", stats.total],
          ["Last 7 days", stats.week],
          ["On trial", stats.trial],
          ["Subscribed", stats.subscribed],
          ["Trial ended", stats.expired],
        ].map(([label, value]) => (
          <div key={label} className="rounded-panel border border-border bg-surface p-4 shadow-(--shadow-card)">
            <p className="text-[13px] text-fg-secondary">{label}</p>
            <p className="mt-1 font-heading text-[23px] font-medium tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or clinic"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <div role="radiogroup" aria-label="Filter by plan" className="inline-flex rounded-control bg-surface-muted p-0.5">
          {(
            [
              ["all", "All"],
              ["trial", "Trial"],
              ["subscribed", "Subscribed"],
              ["expired", "Trial ended"],
              ["disabled", "Disabled"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-control px-3 py-1 text-[13px] font-medium transition-colors",
                filter === f ? "bg-surface text-foreground shadow-(--shadow-resting)" : "text-fg-secondary hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-panel border border-border bg-surface shadow-(--shadow-card)">
        <table className="w-full min-w-225">
          <thead>
            <tr className="border-b border-border text-left text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary whitespace-nowrap">
              <th className="py-2.5 pl-4 pr-3">User</th>
              <th className="px-3 py-2.5">Clinic</th>
              <th className="px-3 py-2.5">Signed up</th>
              <th className="px-3 py-2.5">Plan</th>
              <th className="px-3 py-2.5 text-right">AI today</th>
              <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Users className="mx-auto mb-2 size-7 text-border-strong" strokeWidth={1.25} />
                  <p className="text-[15px] text-fg-secondary">No users match.</p>
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="py-2.5 pl-4 pr-3">
                    <p className="text-[14px] font-medium text-foreground">
                      {r.name ?? "—"}
                      {r.disabled && (
                        <span className="ml-2 rounded-full bg-danger-subtle px-1.5 py-px text-[11px] font-medium text-danger">Disabled</span>
                      )}
                    </p>
                    <p className="text-[13px] text-fg-secondary">
                      {r.email}
                      {!r.verified && <span className="ml-1.5 text-warning">· unverified</span>}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-fg-secondary">
                    {r.clinics.length === 0
                      ? "—"
                      : r.clinics.map((c) => (
                          <span key={c.name} className="block">
                            {c.name} <span className="text-fg-muted">· {ROLE_LABELS[c.role]}</span>
                          </span>
                        ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-fg-secondary">{r.signedUp}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", PLAN_PILL[r.state].className)}>
                      {PLAN_PILL[r.state].label}
                      {r.state === "subscribed" && r.subscriptionInterval ? ` · ${r.subscriptionInterval}ly` : ""}
                    </span>
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      {r.state === "trial"
                        ? `${r.trialDaysLeft} day${r.trialDaysLeft === 1 ? "" : "s"} left · ends ${r.trialEndsLabel}`
                        : r.state === "subscribed"
                          ? `${r.subscriptionStatus}${r.renewsLabel ? ` · renews ${r.renewsLabel}` : ""}`
                          : r.trialEndsLabel
                            ? `Trial ended ${r.trialEndsLabel}`
                            : "No trial"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-[14px] tabular-nums">
                    <span className={r.aiToday >= r.aiDailyLimit ? "text-danger" : "text-foreground"}>{r.aiToday}</span>
                    <span className="text-fg-muted"> / {r.aiDailyLimit}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && <ManageUserDialog key={editing.id} row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ManageUserDialog({ row, onClose }: { row: AdminUserRow; onClose: () => void }) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(row.aiDailyLimit));
  const [trialEnd, setTrialEnd] = useState(row.trialEndsAt ? clinicDateKey(new Date(row.trialEndsAt)) : "");
  const [disabled, setDisabled] = useState(row.disabled);
  const [saving, setSaving] = useState(false);

  const limitNumber = Number(limit);
  const limitValid = limit.trim() !== "" && Number.isInteger(limitNumber) && limitNumber >= 0 && limitNumber <= 1000;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiDailyLimit: limitNumber,
          // The trial runs to the end of the chosen clinic day.
          trialEndsAt: trialEnd ? clinicDayBounds(trialEnd).end.toISOString() : null,
          ...(row.isSelf ? {} : { disabled }),
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't save.");
      toast.success(`Saved ${row.name ?? row.email}.`);
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {row.name ?? row.email}</DialogTitle>
          <DialogDescription>{row.email}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (limitValid && !saving) void save();
          }}
        >
          <label className="block">
            <span className="text-[14px] font-medium text-foreground">AI analyses per day</span>
            <span className="block text-[12px] text-fg-secondary">Different X-rays per clinic day. Default 10; 0 turns AI off.</span>
            <Input
              type="number"
              min={0}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="mt-1.5 w-32"
              aria-invalid={!limitValid}
            />
          </label>
          <div>
            <span className="text-[14px] font-medium text-foreground">Free trial ends</span>
            <span className="block text-[12px] text-fg-secondary">
              Pick a later date to extend the trial. Doesn&apos;t affect a paid subscription.
            </span>
            <DateInput value={trialEnd} onChange={setTrialEnd} className="mt-1.5 w-44" aria-label="Free trial ends" />
          </div>
          {!row.isSelf && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <span className="text-[14px] font-medium text-foreground">Disable account</span>
                <span className="block text-[12px] text-fg-secondary">Signs them out straight away and blocks sign-in.</span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!limitValid || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Trash2, Loader2, Coffee, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DoctorDetail } from "@/types/doctor";
import { DateInput } from "@/components/ui/date-input";
import { clinicDateLabel, clinicDayBounds, clinicInstantFromInputs } from "@/lib/clinic-time";

interface Props {
  doctorId: string;
  doctor: DoctorDetail;
  currentUserId: string;
  /** Threaded from the page-level server component: caller has an OWNER/ADMIN
   * seat somewhere, or is editing themselves. The API still enforces real
   * branch-scoped RBAC; this just hides affordances the server would reject. */
  isAdminLike: boolean;
}

const LEAVE_TYPES = [
  { value: "ANNUAL_LEAVE", label: "Annual Leave" },
  { value: "SICK_LEAVE", label: "Sick Leave" },
  { value: "PERSONAL_LEAVE", label: "Personal Leave" },
  { value: "CONFERENCE", label: "Conference / CE" },
  { value: "JURY_DUTY", label: "Jury Duty" },
  { value: "UNPAID_LEAVE", label: "Unpaid Leave" },
  { value: "OTHER", label: "Other" },
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TimeOffRow {
  id: string;
  type: (typeof LEAVE_TYPES)[number]["value"];
  startDate: string;
  endDate: string;
  branch: { id: string; name: string } | null;
  notes: string | null;
}

interface BreakSlot {
  id?: string;
  branchId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  label: string | null;
}

function minutesToTimeStr(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeStrToMinutes(s: string): number {
  const [h, m] = s.split(":").map((p) => parseInt(p, 10));
  return h * 60 + m;
}

export function DoctorAvailabilityTab({ doctorId, doctor, currentUserId, isAdminLike }: Props) {
  // canEdit gates the visible affordances. The API still enforces the actual
  // branch-scoped RBAC (DOCTOR edits own; OWNER/ADMIN edits any doctor at
  // their branch). A self-view is always editable; otherwise OWNER/ADMIN
  // anywhere is allowed to attempt.
  void doctor;
  const canEdit = useMemo(
    () => isAdminLike || currentUserId === doctorId,
    [isAdminLike, currentUserId, doctorId]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TimeOffSection doctorId={doctorId} doctor={doctor} canEdit={canEdit} />
      <BreakTimeSection doctorId={doctorId} doctor={doctor} canEdit={canEdit} />
    </div>
  );
}

function TimeOffSection({
  doctorId,
  doctor,
  canEdit,
}: {
  doctorId: string;
  doctor: DoctorDetail;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<TimeOffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    type: "ANNUAL_LEAVE" as (typeof LEAVE_TYPES)[number]["value"],
    startDate: "",
    endDate: "",
    branchId: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/doctors/${doctorId}/time-off`);
    if (res.ok) {
      const body = await res.json();
      setRows(body.timeOff);
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  async function add() {
    if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) return;
    setSubmitting(true);
    const res = await fetch(`/api/doctors/${doctorId}/time-off`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: draft.type,
        // Whole clinic days: 00:00 on the first day to 23:59:59 on the last
        startDate: clinicInstantFromInputs(draft.startDate, "00:00").toISOString(),
        endDate: new Date(clinicDayBounds(draft.endDate).end.getTime() - 1000).toISOString(),
        branchId: draft.branchId || null,
        notes: draft.notes || null,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setAdding(false);
      setDraft({ type: "ANNUAL_LEAVE", startDate: "", endDate: "", branchId: "", notes: "" });
      load();
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/doctors/${doctorId}/time-off/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <section className="bg-white border border-border rounded-panel p-5">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-brand" strokeWidth={1.75} />
            Time off
          </h3>
          <p className="text-[12px] text-fg-muted">
            Annual leave, sick leave, conferences, etc.
          </p>
        </div>
        {canEdit && !adding && (
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            className="h-8 rounded-control bg-primary hover:bg-primary/90 text-white text-[13px] gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add leave
          </Button>
        )}
      </header>

      {adding && (
        <div className="mb-4 p-4 bg-surface-muted border border-border rounded-panel space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-fg-secondary mb-1">Type</label>
              <Select
                value={draft.type}
                items={LEAVE_TYPES}
                onValueChange={(v) => setDraft({ ...draft, type: v as typeof draft.type })}
              >
                <SelectTrigger className="h-9 rounded-control text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-[13px]">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-fg-secondary mb-1">
                Branch (optional)
              </label>
              <Select
                value={draft.branchId || "all"}
                items={[{ value: "all", label: "All branches" }, ...doctor.branches.map((b) => ({ value: b.id, label: b.name }))]}
                onValueChange={(v) =>
                  setDraft({ ...draft, branchId: v === "all" || v == null ? "" : v })
                }
              >
                <SelectTrigger className="h-9 rounded-control text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[13px]">
                    All branches
                  </SelectItem>
                  {doctor.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-[13px]">
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-fg-secondary mb-1">From</label>
              <DateInput
                aria-label="From"
                value={draft.startDate}
                onChange={(iso) => setDraft((d) => ({ ...d, startDate: iso }))}
                inputClassName="w-full h-9 rounded-control border border-border bg-white px-2 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-fg-secondary mb-1">To</label>
              <DateInput
                aria-label="To"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(iso) => setDraft((d) => ({ ...d, endDate: iso }))}
                inputClassName="w-full h-9 rounded-control border border-border bg-white px-2 text-[13px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-fg-secondary mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdding(false)}
              disabled={submitting}
              className="h-8 rounded-control text-[13px]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={add}
              disabled={submitting || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate}
              className="h-8 rounded-control bg-primary hover:bg-primary/90 text-white text-[13px] gap-1.5"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
              Add
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-[13px] text-fg-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted py-2">No time off scheduled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            const typeLabel =
              LEAVE_TYPES.find((t) => t.value === r.type)?.label ?? r.type;
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">
                    {typeLabel}
                    {r.branch && (
                      <span className="ml-2 text-[12px] font-normal text-fg-muted">
                        · {r.branch.name}
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-fg-secondary tabular-nums">
                    {clinicDateLabel(start, "numeric")} → {clinicDateLabel(end, "numeric")}
                  </p>
                  {r.notes && (
                    <p className="text-[12px] text-fg-muted mt-0.5">{r.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => remove(r.id)}
                    className="text-fg-muted hover:text-danger transition-colors h-7 w-7 flex items-center justify-center rounded-control hover:bg-danger-subtle"
                    aria-label="Delete leave"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BreakTimeSection({
  doctorId,
  doctor,
  canEdit,
}: {
  doctorId: string;
  doctor: DoctorDetail;
  canEdit: boolean;
}) {
  const [activeBranch, setActiveBranch] = useState<string>(
    doctor.branches[0]?.id ?? ""
  );
  const [slots, setSlots] = useState<BreakSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load() {
    if (!activeBranch) return;
    setLoading(true);
    const res = await fetch(
      `/api/doctors/${doctorId}/break-times?branchId=${activeBranch}`
    );
    if (res.ok) {
      const body = await res.json();
      setSlots(
        body.breakTimes.map((b: BreakSlot) => ({
          ...b,
          branchId: activeBranch,
        }))
      );
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, activeBranch]);

  function addSlot() {
    setSlots([
      ...slots,
      {
        branchId: activeBranch,
        dayOfWeek: 1, // Monday
        startMinute: 12 * 60,
        endMinute: 13 * 60,
        label: "Lunch",
      },
    ]);
  }

  function updateSlot(idx: number, patch: Partial<BreakSlot>) {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSlot(idx: number) {
    setSlots(slots.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/doctors/${doctorId}/break-times`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branchId: activeBranch, slots }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    }
  }

  return (
    <section className="bg-white border border-border rounded-panel p-5">
      <header className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <Coffee className="h-4 w-4 text-warning" strokeWidth={1.75} />
            Break times
          </h3>
          <p className="text-[12px] text-fg-muted">
            Recurring weekly breaks (e.g. lunch). Bookings on these slots require confirmation.
          </p>
        </div>
        {doctor.branches.length > 1 && (
          <Select
            value={activeBranch}
            items={doctor.branches.map((b) => ({ value: b.id, label: b.name }))}
            onValueChange={(v) => v && setActiveBranch(v)}
          >
            <SelectTrigger className="h-8 w-45 rounded-control text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {doctor.branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-[13px]">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {loading ? (
        <div className="text-center py-6 text-[13px] text-fg-muted">Loading…</div>
      ) : slots.length === 0 ? (
        <p className="text-[13px] text-fg-muted py-2 mb-3">
          No break times set.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {slots.map((s, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 p-2 bg-surface-muted border border-border rounded-md"
            >
              <Select
                value={String(s.dayOfWeek)}
                items={DAYS.map((d, i) => ({ value: String(i), label: d }))}
                onValueChange={(v) =>
                  v && updateSlot(idx, { dayOfWeek: parseInt(v, 10) })
                }
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 w-20 rounded-control text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)} className="text-[12px]">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="time"
                value={minutesToTimeStr(s.startMinute)}
                onChange={(e) =>
                  updateSlot(idx, { startMinute: timeStrToMinutes(e.target.value) })
                }
                disabled={!canEdit}
                className="h-8 rounded-control border border-border bg-white px-2 text-[12px] tabular-nums"
              />
              <span className="text-[12px] text-fg-muted">→</span>
              <input
                type="time"
                value={minutesToTimeStr(s.endMinute)}
                onChange={(e) =>
                  updateSlot(idx, { endMinute: timeStrToMinutes(e.target.value) })
                }
                disabled={!canEdit}
                className="h-8 rounded-control border border-border bg-white px-2 text-[12px] tabular-nums"
              />
              <input
                type="text"
                placeholder="Label"
                value={s.label ?? ""}
                onChange={(e) => updateSlot(idx, { label: e.target.value })}
                disabled={!canEdit}
                className="flex-1 h-8 rounded-control border border-border bg-white px-2 text-[12px]"
              />
              {canEdit && (
                <button
                  onClick={() => removeSlot(idx)}
                  className="text-fg-muted hover:text-danger transition-colors h-7 w-7 flex items-center justify-center rounded-control hover:bg-danger-subtle"
                  aria-label="Remove slot"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={addSlot}
            className="h-8 rounded-control text-[13px] gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add break
          </Button>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-[12px] text-success">Saved</span>
            )}
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              className="h-8 rounded-control bg-primary hover:bg-primary/90 text-white text-[13px] gap-1.5"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
              Save break times
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

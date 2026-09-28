"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ALERT_ERROR, BTN_PRIMARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, INVALID } from "@/components/invoices/form-styles";

const MAX_HOURS = 336;

function hoursError(text: string): string | null {
  if (!/^\d{1,3}$/.test(text.trim())) return "Whole hours, 0–336";
  return Number(text) > MAX_HOURS ? "Whole hours, 0–336" : null;
}

/**
 * Branch → Settings → Patient portal: how close to the visit patients may
 * still cancel online. OWNER/ADMIN.
 */
export function BranchPortalSettingsCard({ branchId }: { branchId: string }) {
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/branches/${branchId}/portal-settings`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ portalCancelHours: number }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSaved(data.portalCancelHours);
        setValue(String(data.portalCancelHours));
      })
      .catch(() => !cancelled && setLoadError("Couldn't load patient portal settings."));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (loadError) return <p className={ALERT_ERROR}>{loadError}</p>;
  if (saved === null) return <div className="p-6 text-[#697386]">Loading patient portal settings…</div>;

  const error = hoursError(value);
  const dirty = !error && Number(value) !== saved;

  async function save() {
    if (error) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/portal-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalCancelHours: Number(value) }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { portalCancelHours: number };
      setSaved(data.portalCancelHours);
      setValue(String(data.portalCancelHours));
      toast.success("Patient portal settings saved");
    } catch {
      toast.error("Couldn't save patient portal settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4">
        <h3 className="text-[18px] font-medium text-[#0A2540]">Patient portal</h3>
        <p className="text-[14px] text-[#697386]">
          Patients sign in at <span className="font-mono">/portal</span> with the email on their record to see
          appointments, packages and receipts.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <label htmlFor="portal-cancel-hours" className={FIELD_LABEL}>
            Online cancellation cutoff (hours)
          </label>
          <input
            id="portal-cancel-hours"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="portal-cancel-hours-hint"
            className={cn(FIELD_INPUT, error && INVALID)}
          />
        </div>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className={BTN_PRIMARY}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save
        </button>
      </div>
      {error ? (
        <p className={FIELD_ERROR}>{error}</p>
      ) : (
        <p id="portal-cancel-hours-hint" className="mt-1 text-[13px] text-[#697386]">
          Patients can cancel a booked appointment online until this many hours before it starts; after that they call
          the clinic.
        </p>
      )}
    </div>
  );
}

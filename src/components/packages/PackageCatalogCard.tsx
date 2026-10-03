"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Package, Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PackageTemplateDialog } from "./PackageTemplateDialog";
import { formatMYR } from "@/lib/invoices";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import { treatmentTypesSummary } from "@/lib/package-ui";
import type { TreatmentType } from "@/types/appointment";
import type { PackageTemplateJson } from "@/types/packages";

interface Props {
  branchId: string;
  /** OWNER / ADMIN (`package.manage`): create, edit, take off sale. */
  canManage: boolean;
}

const labelFor = (t: string) => treatmentLabelFor(t as TreatmentType);

/** Branch → Settings → Packages: the catalogue of prepaid packages this branch sells. */
export function PackageCatalogCard({ branchId, canManage }: Props) {
  const [templates, setTemplates] = useState<PackageTemplateJson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PackageTemplateJson | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/branches/${branchId}/packages${canManage ? "?includeInactive=true" : ""}`);
      if (!res.ok) {
        setError("Couldn't load packages.");
        return;
      }
      const data = (await res.json()) as { templates: PackageTemplateJson[] };
      setTemplates(data.templates);
      setError(null);
    } catch {
      setError("Couldn't load packages.");
    }
  }, [branchId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(t: PackageTemplateJson, active: boolean) {
    setBusyId(t.id);
    try {
      const res = active
        ? await fetch(`/api/branches/${branchId}/packages/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          })
        : await fetch(`/api/branches/${branchId}/packages/${t.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Couldn't update the package.");
        return;
      }
      toast.success(active ? `${t.name} is on sale again` : `${t.name} taken off sale`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-panel border border-border bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-medium text-foreground">Packages</div>
          <div className="text-[14px] text-fg-muted">
            Prepaid session bundles. Completing a visit uses a session automatically.
          </div>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="h-8 shrink-0 gap-1.5 rounded-control bg-primary text-[14px] text-white hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New package
          </Button>
        )}
      </div>

      {error && <p className="text-[14px] text-danger">{error}</p>}
      {!templates && !error && (
        <div className="flex items-center gap-2 py-4 text-[14px] text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading packages…
        </div>
      )}
      {templates && templates.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center">
          <Package className="mb-2 h-8 w-8 text-border-strong" strokeWidth={1.25} />
          <p className="text-[14px] text-fg-muted">No packages yet.</p>
          {canManage && <p className="text-[13px] text-fg-muted">Create one, e.g. &ldquo;12 Adjustments&rdquo;.</p>}
        </div>
      )}
      {templates && templates.length > 0 && (
        <ul className="-mx-6 divide-y divide-border border-y border-border">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 hover:bg-surface-hover">
              <div className="min-w-0 grow basis-full sm:basis-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[15px] font-medium ${t.isActive ? "text-foreground" : "text-fg-muted"}`}>{t.name}</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${
                      t.isActive ? "bg-success-subtle text-success" : "bg-surface-hover text-fg-secondary"
                    }`}
                  >
                    {t.isActive ? "On sale" : "Off sale"}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-fg-muted">
                  <span className="tabular-nums">{t.sessions} sessions</span> ·{" "}
                  {t.validityDays ? `valid ${t.validityDays} days` : "no expiry"} ·{" "}
                  <span title={t.treatmentTypes.map(labelFor).join(", ") || "Any treatment"}>
                    {treatmentTypesSummary(t.treatmentTypes, labelFor)}
                  </span>
                </div>
                {t.description && (
                  <div className="truncate text-[12px] text-fg-muted" title={t.description}>
                    {t.description}
                  </div>
                )}
              </div>
              <div className="whitespace-nowrap text-right tabular-nums">
                <div className="text-[15px] text-foreground">{formatMYR(t.price)}</div>
                <div className="text-[12px] text-fg-muted">{formatMYR(t.unitValue)} / session</div>
              </div>
              {canManage && (
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => {
                      setEditing(t);
                      setDialogOpen(true);
                    }}
                    className="h-7 gap-1 rounded-control border-border px-2 text-[12px]"
                  >
                    <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === t.id}
                    onClick={() => void setActive(t, !t.isActive)}
                    className={`h-7 gap-1 rounded-control border-border px-2 text-[12px] ${t.isActive ? "text-warning" : "text-success"}`}
                  >
                    {busyId === t.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Power className="h-3 w-3" strokeWidth={1.75} />
                    )}
                    {t.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <PackageTemplateDialog
          open={dialogOpen}
          branchId={branchId}
          template={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={(t) => {
            setDialogOpen(false);
            toast.success(editing ? `Saved ${t.name}` : `Created ${t.name}`);
            void load();
          }}
        />
      )}
    </div>
  );
}

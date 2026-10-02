"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Package, Plus, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellPackageDialog } from "./SellPackageDialog";
import { CancelPackageDialog } from "./CancelPackageDialog";
import { formatMYR } from "@/lib/invoices";
import { clinicDateLabel } from "@/lib/clinic-time";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import { displayDoctorName } from "@/lib/format";
import {
  PACKAGE_STATUS_STYLE,
  appointmentHref,
  sessionsUsedLabel,
  treatmentTypesSummary,
} from "@/lib/package-ui";
import type { TreatmentType } from "@/types/appointment";
import type { PatientPackageJson } from "@/types/packages";

interface Props {
  patientId: string;
  patientName: string;
  branchId: string;
  /** `invoice.manage` — OWNER / ADMIN / FRONT_DESK. */
  canSell: boolean;
  /** `package.manage` — OWNER / ADMIN. */
  canCancel: boolean;
  /** Link invoice numbers to the Invoices page (roles that can open it). */
  canOpenInvoices: boolean;
  /** Bump to reload (e.g. after a care plan sold a package). */
  refreshKey?: number;
  onChanged?: () => void;
}

interface Summary {
  activeCount: number;
  sessionsLeft: number;
}

const labelFor = (t: string) => treatmentLabelFor(t as TreatmentType);

/** Patient page: packages bought, sessions left, expiry and redemption history. */
export function PatientPackagesSection({
  patientId,
  patientName,
  branchId,
  canSell,
  canCancel,
  canOpenInvoices,
  refreshKey = 0,
  onChanged,
}: Props) {
  const [packages, setPackages] = useState<PatientPackageJson[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PatientPackageJson | null>(null);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/patients/${patientId}/packages`);
      if (!res.ok) {
        setError(res.status === 403 ? "You can't view this patient's packages." : "Couldn't load packages.");
        return;
      }
      const data = (await res.json()) as { packages: PatientPackageJson[]; summary: Summary };
      setPackages(data.packages);
      setSummary(data.summary);
      setError(null);
    } catch {
      setError("Couldn't load packages.");
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const current = packages?.filter((p) => p.effectiveStatus === "ACTIVE") ?? [];
  const past = packages?.filter((p) => p.effectiveStatus !== "ACTIVE") ?? [];

  return (
    <section className="rounded-panel border border-border bg-white" aria-labelledby="patient-packages-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 id="patient-packages-title" className="text-[16px] font-medium text-foreground">Packages</h2>
          {summary && (
            <p className="text-[13px] text-fg-secondary">
              {summary.activeCount === 0
                ? "No active package"
                : `${summary.activeCount} active · ${summary.sessionsLeft} session${summary.sessionsLeft === 1 ? "" : "s"} left`}
            </p>
          )}
        </div>
        {canSell && (
          <Button
            onClick={() => setSellOpen(true)}
            className="h-8 gap-1.5 rounded-control bg-primary text-[14px] text-white hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Sell package
          </Button>
        )}
      </div>

      <div className="px-5 py-4">
        {error && <p className="text-[14px] text-danger">{error}</p>}
        {!packages && !error && (
          <div className="flex items-center gap-2 text-[14px] text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading packages…
          </div>
        )}
        {packages && packages.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <Package className="mb-2 h-8 w-8 text-border-strong" strokeWidth={1.25} />
            <p className="text-[14px] text-fg-secondary">No packages sold to {patientName} yet.</p>
          </div>
        )}
        {packages && packages.length > 0 && (
          <div className="space-y-3">
            {current.length === 0 && <p className="text-[14px] text-fg-secondary">No active package.</p>}
            {current.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                branchId={branchId}
                canCancel={canCancel}
                canOpenInvoices={canOpenInvoices}
                onCancel={() => setCancelTarget(p)}
              />
            ))}
            {past.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPast((v) => !v)}
                  aria-expanded={showPast}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                >
                  {showPast ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {showPast ? "Hide" : "Show"} {past.length} past package{past.length === 1 ? "" : "s"}
                </button>
                {showPast && (
                  <div className="mt-3 space-y-3">
                    {past.map((p) => (
                      <PackageCard
                        key={p.id}
                        pkg={p}
                        branchId={branchId}
                        canCancel={canCancel}
                        canOpenInvoices={canOpenInvoices}
                        onCancel={() => setCancelTarget(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {canSell && (
        <SellPackageDialog
          open={sellOpen}
          patientId={patientId}
          patientName={patientName}
          branchId={branchId}
          onClose={() => setSellOpen(false)}
          onSold={(pkg) => {
            setSellOpen(false);
            toast.success(
              pkg.invoice ? `Sold ${pkg.name} — invoice ${pkg.invoice.invoiceNumber}` : `Sold ${pkg.name}`,
            );
            void load();
            onChanged?.();
          }}
        />
      )}
      {canCancel && (
        <CancelPackageDialog
          pkg={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={(pkg) => {
            setCancelTarget(null);
            toast.success(`${pkg.name} cancelled`);
            void load();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

interface CardProps {
  pkg: PatientPackageJson;
  branchId: string;
  canCancel: boolean;
  canOpenInvoices: boolean;
  onCancel: () => void;
}

function PackageCard({ pkg, branchId, canCancel, canOpenInvoices, onCancel }: CardProps) {
  const [open, setOpen] = useState(false);
  const style = PACKAGE_STATUS_STYLE[pkg.effectiveStatus];
  const pct = pkg.sessionsTotal === 0 ? 0 : Math.min(100, Math.round((pkg.sessionsUsed / pkg.sessionsTotal) * 100));
  const redemptions = pkg.redemptions ?? [];
  const active = pkg.effectiveStatus === "ACTIVE";

  return (
    <div className="rounded-panel border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-foreground">{pkg.name}</span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${style.className}`}>
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            {treatmentTypesSummary(pkg.treatmentTypes, labelFor)} · bought {clinicDateLabel(new Date(pkg.purchasedAt))}
            {pkg.soldBy?.name ? ` by ${pkg.soldBy.name}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="whitespace-nowrap text-[15px] tabular-nums text-foreground">{formatMYR(pkg.price)}</div>
          {pkg.invoice && (
            <div className="text-[12px] text-fg-secondary">
              {canOpenInvoices ? (
                <Link
                  href={`/dashboard/invoices?invoice=${encodeURIComponent(pkg.invoice.id)}`}
                  className="tabular-nums text-brand hover:underline"
                >
                  {pkg.invoice.invoiceNumber}
                </Link>
              ) : (
                <span className="tabular-nums">{pkg.invoice.invoiceNumber}</span>
              )}{" "}
              · {pkg.invoice.status.replace("_", " ").toLowerCase()}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-foreground tabular-nums">{sessionsUsedLabel(pkg.sessionsUsed, pkg.sessionsTotal)}</span>
          <span className="text-fg-secondary tabular-nums">
            {pkg.sessionsLeft} left
            {pkg.expiresAt ? ` · ${active ? "expires" : "expired"} ${clinicDateLabel(new Date(pkg.expiresAt))}` : " · no expiry"}
          </span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pkg.sessionsTotal}
          aria-valuenow={pkg.sessionsUsed}
          aria-label={`${pkg.name} sessions used`}
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {pkg.cancelReason && (
        <p className="mt-2 text-[13px] text-danger">
          Cancelled{pkg.cancelledAt ? ` ${clinicDateLabel(new Date(pkg.cancelledAt))}` : ""}: {pkg.cancelReason}
        </p>
      )}
      {pkg.notes && <p className="mt-2 text-[13px] text-fg-secondary">{pkg.notes}</p>}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Sessions used ({redemptions.filter((r) => !r.reversedAt).length})
        </button>
        {canCancel && pkg.status !== "CANCELLED" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-7 gap-1 rounded-control border-border px-2 text-[12px] text-danger"
          >
            <XCircle className="h-3 w-3" strokeWidth={1.75} /> Cancel package
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 overflow-x-auto">
          {redemptions.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">No sessions used yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-fg-muted">
                  <th className="py-1.5 pr-3 font-medium">Visit</th>
                  <th className="py-1.5 pr-3 font-medium">Treatment</th>
                  <th className="py-1.5 pr-3 font-medium">Doctor</th>
                  <th className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => {
                  const when = r.appointment?.dateTime ?? r.redeemedAt;
                  return (
                    <tr key={r.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                        <Link
                          href={appointmentHref(r.appointmentId, when, branchId)}
                          className={r.reversedAt ? "text-fg-muted line-through" : "text-brand hover:underline"}
                        >
                          {clinicDateLabel(new Date(when), "day")}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-fg-secondary">
                        {r.appointment?.treatmentType ? labelFor(r.appointment.treatmentType) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-fg-secondary">
                        {r.appointment?.doctorName ? displayDoctorName(r.appointment.doctorName) : "—"}
                      </td>
                      <td className="py-1.5">
                        {r.reversedAt ? (
                          <span
                            className="inline-flex items-center gap-1 text-[12px] text-warning"
                            title={`Undone ${clinicDateLabel(new Date(r.reversedAt))}${r.reversedBy?.name ? ` by ${r.reversedBy.name}` : ""}`}
                          >
                            <Undo2 className="h-3 w-3" strokeWidth={1.75} /> Undone
                          </span>
                        ) : (
                          <span className="text-[12px] text-success">Used</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X, Loader2, Wallet } from "lucide-react";
import type { Package as PackageType } from "@/types/package";
import type { PaymentMethod } from "@/types/visit";
import { PAYMENT_METHOD_LABELS } from "@/types/visit";

const selectClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none cursor-pointer";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  branchId: string;
  onSold: () => void;
}

export function SellPackageDialog({ open, onOpenChange, patientId, branchId, onSold }: Props) {
  const [packages, setPackages] = useState<PackageType[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [markPaid, setMarkPaid] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/branches/${branchId}/packages`)
      .then((r) => (r.ok ? r.json() : { packages: [] }))
      .then((data) => {
        const list: PackageType[] = data.packages ?? [];
        setPackages(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch(() => setError("Failed to load packages"))
      .finally(() => setLoading(false));
  }, [open, branchId]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selected,
          ...(markPaid ? { markPaid: true, paymentMethod: method } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sell package");
      }
      onOpenChange(false);
      setMarkPaid(false);
      onSold();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sell package");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPkg = packages.find((p) => p.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-[520px] rounded-[6px] border border-[#e5edf5] bg-white"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5edf5]">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
            <h2 className="text-[18px] font-light text-[#061b31]">Sell Package</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {loading ? (
            <div className="py-6 text-center text-[14px] text-[#64748d]">Loading packages…</div>
          ) : packages.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-[14px] text-[#64748d]">No packages available for this branch yet.</p>
              <Link
                href={`/dashboard/branches/${branchId}?tab=settings`}
                className="text-[13px] text-[#533afd] hover:underline"
              >
                Go to branch settings →
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Package</label>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className={selectClass}
                >
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.sessionCount} sessions @ RM {p.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPkg && (
                <div className="rounded-[4px] bg-[#f6f9fc] p-3 text-[13px] text-[#273951] space-y-1">
                  <div>
                    <span className="text-[#64748d]">Sessions:</span> {selectedPkg.sessionCount}
                  </div>
                  <div>
                    <span className="text-[#64748d]">Price:</span> RM {selectedPkg.price.toFixed(2)} {selectedPkg.currency}
                  </div>
                  {selectedPkg.validityDays != null && (
                    <div>
                      <span className="text-[#64748d]">Validity:</span> {selectedPkg.validityDays} days from purchase
                    </div>
                  )}
                  {selectedPkg.description && (
                    <p className="text-[12px] text-[#64748d] italic mt-1">{selectedPkg.description}</p>
                  )}
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={markPaid}
                  onChange={(e) => setMarkPaid(e.target.checked)}
                  className="h-4 w-4 rounded border-[#e5edf5] text-[#533afd]"
                  style={{ accentColor: "#533afd" }}
                />
                <span className="text-[13px] text-[#273951]">Mark invoice as paid now</span>
              </label>

              {markPaid && (
                <div>
                  <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Payment Method</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
                    {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2 text-[13px] text-[#DF1B41]">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e5edf5]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || packages.length === 0}
              className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Selling…
                </>
              ) : (
                "Sell Package"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


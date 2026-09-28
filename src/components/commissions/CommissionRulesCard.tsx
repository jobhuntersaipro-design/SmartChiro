"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { HandCoins, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommissionRuleDialog } from "./CommissionRuleDialog";
import { COMMISSION_BASIS_LABEL, describeRate } from "@/lib/commissions";
import { TREATMENT_LABELS } from "@/lib/treatment-colors";
import { formatDateInput } from "@/lib/date-input";
import type { CommissionRuleJson, CommissionRulesResponse, CommissionStaffOption } from "@/types/commissions";

interface Props {
  branchId: string;
}

/**
 * Branch → Settings → Commissions (OWNER / ADMIN): who earns what. The
 * Reports page's Commissions card applies these rules.
 */
export function CommissionRulesCard({ branchId }: Props) {
  const [rules, setRules] = useState<CommissionRuleJson[] | null>(null);
  const [staff, setStaff] = useState<CommissionStaffOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommissionRuleJson | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/branches/${branchId}/commission-rules`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as CommissionRulesResponse;
      setRules(data.rules);
      setStaff(data.staff);
      setError(null);
    } catch {
      setError("Couldn't load commission rules.");
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(rule: CommissionRuleJson) {
    if (!window.confirm("Delete this commission rule? Reports recalculate without it.")) return;
    setBusyId(rule.id);
    try {
      const res = await fetch(`/api/branches/${branchId}/commission-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Rule deleted");
      await load();
    } catch {
      toast.error("Couldn't delete the rule.");
    } finally {
      setBusyId(null);
    }
  }

  const who = (r: CommissionRuleJson) =>
    r.doctorId ? (r.doctorName ?? "Former staff") : r.basis === "PERCENT_PACKAGE_SALE" ? "Anyone" : "All doctors";

  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-medium text-[#0A2540]">Commissions</h3>
          <p className="text-[14px] text-[#697386]">
            The most specific active rule wins: doctor + treatment, doctor, treatment, then all. See Reports → Commissions.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="h-8 shrink-0 gap-1.5 rounded-md bg-[#533afd] text-[14px] text-white hover:bg-[#4434d4]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New rule
        </Button>
      </div>

      {error && <p className="text-[14px] text-[#DF1B41]">{error}</p>}
      {!rules && !error && (
        <div className="flex items-center gap-2 py-4 text-[14px] text-[#697386]">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading rules…
        </div>
      )}
      {rules && rules.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center">
          <HandCoins className="mb-2 h-8 w-8 text-[#c1c9d2]" strokeWidth={1.25} />
          <p className="text-[14px] text-[#697386]">No commission rules yet.</p>
          <p className="text-[13px] text-[#94a3b8]">e.g. all doctors earn 10% of payments collected.</p>
        </div>
      )}
      {rules && rules.length > 0 && (
        <div className="-mx-6 overflow-x-auto border-y border-[#e5edf5]">
          <table className="w-full text-[14px]">
            <caption className="sr-only">Commission rules</caption>
            <thead>
              <tr className="bg-[#f6f9fc] text-left text-[13px] text-[#64748d]">
                <th scope="col" className="px-6 py-2 font-medium">Who</th>
                <th scope="col" className="px-3 py-2 font-medium">Treatment</th>
                <th scope="col" className="px-3 py-2 font-medium">Basis</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Rate</th>
                <th scope="col" className="px-3 py-2 font-medium">From</th>
                <th scope="col" className="px-6 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5edf5]">
              {rules.map((r) => (
                <tr key={r.id} className={`hover:bg-[#F0F3F7] ${r.active ? "" : "text-[#94a3b8]"}`}>
                  <td className="px-6 py-2.5 whitespace-nowrap">
                    <span className={r.active ? "text-[#061b31]" : ""}>{who(r)}</span>
                    {!r.active && (
                      <span className="ml-2 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[12px] text-[#64748b]">Inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.treatmentType ? TREATMENT_LABELS[r.treatmentType] : "All"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{COMMISSION_BASIS_LABEL[r.basis]}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{describeRate(r.basis, r.rate)}</td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatDateInput(r.effectiveFrom)}</td>
                  <td className="px-6 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Edit rule"
                        onClick={() => {
                          setEditing(r);
                          setDialogOpen(true);
                        }}
                        className="h-7 gap-1 rounded-md border-[#e5edf5] px-2 text-[12px]"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Delete rule"
                        disabled={busyId === r.id}
                        onClick={() => void remove(r)}
                        className="h-7 rounded-md border-[#e5edf5] px-2 text-[12px] text-[#DF1B41]"
                      >
                        {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" strokeWidth={1.75} />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CommissionRuleDialog
        open={dialogOpen}
        branchId={branchId}
        rule={editing}
        staff={staff}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          toast.success(editing ? "Rule saved" : "Rule added");
          void load();
        }}
      />
    </div>
  );
}

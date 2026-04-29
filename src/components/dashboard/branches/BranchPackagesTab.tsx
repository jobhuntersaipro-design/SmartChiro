"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Archive, RotateCcw, X, Loader2, Wallet } from "lucide-react";
import type { Package } from "@/types/package";

const inputClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all";
const textareaClass =
  "flex w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all resize-none";

interface Props {
  branchId: string;
  canManage: boolean;
}

export function BranchPackagesTab({ branchId, canManage }: Props) {
  const [data, setData] = useState<{ packages: Package[]; error: string | null } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(() => {
    setReloadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (showArchived) params.set("includeArchived", "true");
    fetch(`/api/branches/${branchId}/packages?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setData({ packages: [], error: "Failed to load packages" });
          return;
        }
        const json = await res.json();
        setData({ packages: json.packages ?? [], error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, showArchived, reloadCount]);

  const loading = data === null;
  const packages = data?.packages ?? [];
  const error = data?.error ?? null;

  async function handleArchive(pkg: Package) {
    const res = await fetch(`/api/packages/${pkg.id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function handleRestore(pkg: Package) {
    const res = await fetch(`/api/packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-medium text-[#061b31]">Treatment Packages</h3>
          <p className="text-[13px] text-[#64748d] mt-0.5">
            Pre-paid session bundles patients can purchase. Sessions are deducted as visits are recorded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-[#64748d] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-[#e5edf5] text-[#533afd]"
              style={{ accentColor: "#533afd" }}
            />
            Show archived
          </label>
          {canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4] text-[13px] h-8"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
              New Package
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-[6px] bg-[#e5edf5] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="py-8 text-center text-[14px] text-[#DF1B41]">{error}</div>
      ) : packages.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-[#e5edf5] bg-white py-12 text-center">
          <Wallet className="h-8 w-8 mx-auto text-[#c1c9d2] mb-2" strokeWidth={1.5} />
          <p className="text-[14px] text-[#64748d]">No packages yet.</p>
          {canManage && (
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              className="mt-3 rounded-[4px] border-[#e5edf5] text-[#533afd] text-[13px]"
            >
              Create your first package
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-[6px] border bg-white p-4 transition-all ${
                pkg.status === "ARCHIVED"
                  ? "border-[#e5edf5] opacity-60"
                  : "border-[#e5edf5] hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-[15px] font-medium text-[#061b31]">{pkg.name}</h4>
                  {pkg.description && (
                    <p className="text-[12px] text-[#64748d] mt-0.5">{pkg.description}</p>
                  )}
                </div>
                {pkg.status === "ARCHIVED" && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#F0F3F7] text-[#64748d]">
                    Archived
                  </span>
                )}
              </div>
              <div className="space-y-1 text-[13px] text-[#273951] tabular-nums">
                <div>
                  <span className="text-[#64748d]">Sessions: </span>
                  {pkg.sessionCount}
                </div>
                <div>
                  <span className="text-[#64748d]">Price: </span>
                  RM {pkg.price.toFixed(2)}
                </div>
                {pkg.validityDays != null && (
                  <div>
                    <span className="text-[#64748d]">Validity: </span>
                    {pkg.validityDays} days
                  </div>
                )}
                {pkg.patientCount != null && (
                  <div>
                    <span className="text-[#64748d]">Sold: </span>
                    {pkg.patientCount} patient{pkg.patientCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[#e5edf5]">
                  {pkg.status === "ACTIVE" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(pkg);
                          setDialogOpen(true);
                        }}
                        className="h-7 rounded-[4px] border-[#e5edf5] text-[#273951] text-[12px]"
                      >
                        <Pencil className="mr-1 h-3 w-3" strokeWidth={1.5} />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleArchive(pkg)}
                        className="h-7 rounded-[4px] border-[#e5edf5] text-[#64748d] text-[12px]"
                      >
                        <Archive className="mr-1 h-3 w-3" strokeWidth={1.5} />
                        Archive
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(pkg)}
                      className="h-7 rounded-[4px] border-[#e5edf5] text-[#533afd] text-[12px]"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" strokeWidth={1.5} />
                      Restore
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branchId={branchId}
        editing={editing}
        onSaved={() => {
          setDialogOpen(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function PackageDialog({
  open,
  onOpenChange,
  branchId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: string;
  editing: Package | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sessionCount, setSessionCount] = useState("");
  const [price, setPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setSessionCount(editing ? String(editing.sessionCount) : "");
    setPrice(editing ? String(editing.price) : "");
    setValidityDays(editing?.validityDays != null ? String(editing.validityDays) : "");
    setError(null);
  }, [open, editing]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        sessionCount: Number(sessionCount),
        price: Number(price),
        validityDays: validityDays === "" ? null : Number(validityDays),
      };
      const url = editing ? `/api/packages/${editing.id}` : `/api/branches/${branchId}/packages`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save package");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-[480px] rounded-[6px] border border-[#e5edf5] bg-white"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5edf5]">
          <h2 className="text-[18px] font-light text-[#061b31]">
            {editing ? "Edit Package" : "New Package"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="10-Visit Adjustment Plan"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional"
              className={textareaClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Sessions</label>
              <input
                type="number"
                min="1"
                step="1"
                value={sessionCount}
                onChange={(e) => setSessionCount(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Price (MYR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">
              Validity (days, optional)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
              placeholder="No expiry"
              className={inputClass}
            />
          </div>

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
              className="rounded-[4px] border-[#e5edf5] text-[#273951]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save Changes"
              ) : (
                "Create Package"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

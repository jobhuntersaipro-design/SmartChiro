"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { formatMYR, type AnyInvoiceStatus } from "@/lib/invoices";
import { billingAccess } from "@/lib/billing-access";
import { replaceUrl } from "@/lib/url-state";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import type { InvoiceListRow as InvoiceRow, InvoiceListSummary as Summary } from "@/types/invoice";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { NewInvoiceDialog } from "./NewInvoiceDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { BTN_PRIMARY } from "./form-styles";
import { AccountingExportButton } from "./AccountingExportButton";
import { can } from "@/lib/permissions";

type Filter = "all" | AnyInvoiceStatus;

interface InvoiceListViewProps {
  /** A branch id, or "all" for every branch the user bills for. */
  branchId: string;
  branchName: string | null;
  /** The user's branches and role in each (action visibility, New invoice branch picker). */
  branches: { id: string; name: string; role: string }[];
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "DRAFT", label: "Draft" },
  { id: "SENT", label: "Sent" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PARTIALLY_PAID", label: "Part paid" },
  { id: "PAID", label: "Paid" },
  { id: "CANCELLED", label: "Cancelled" },
];

const dateMY = (iso: string) =>
  new Date(iso).toLocaleDateString("en-MY", { timeZone: CLINIC_TIME_ZONE, day: "2-digit", month: "short", year: "numeric" });

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white p-4 shadow-(--shadow-card)">
      <p className="text-[14px] text-[#64748d]">{label}</p>
      <p className="mt-1 text-[23px] font-light tabular-nums text-[#061b31] whitespace-nowrap truncate" title={value}>{value}</p>
      {hint && <p className="mt-0.5 text-[13px] text-[#64748d]">{hint}</p>}
    </div>
  );
}

export function InvoiceListView({ branchId, branchName, branches }: InvoiceListViewProps) {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("status");
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.id === initialFilter) ? (initialFilter as Filter) : "all",
  );
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [query, setQuery] = useState(search);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // ?invoice=<id> deep link (e.g. a package sale) opens the drawer.
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(searchParams.get("invoice"));
  const [payRow, setPayRow] = useState<InvoiceRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const roles: Record<string, string> = Object.fromEntries(branches.map((b) => [b.id, b.role]));
  const roleFor = (id: string) => roles[id];
  const manageBranches = branches.filter((b) => billingAccess(b.role).manage);
  // Accounting exports (OWNER / ADMIN): any exportable branch in "All branches", else this one.
  const canExport =
    branchId === "all" ? branches.some((b) => can(b.role, "accounting.export")) : can(roleFor(branchId), "accounting.export");

  // Debounce typing into the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ branchId, status: filter, page: String(page) });
    if (query) params.set("search", query);
    const res = await fetch(`/api/invoices?${params}`);
    if (!res.ok) {
      toast.error("Couldn't load invoices.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.invoices);
    setTotal(data.total);
    setPageSize(data.pageSize);
    setSummary(data.summary);
    setLoading(false);
  }, [branchId, filter, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (query) params.set("search", query);
    if (openInvoiceId) params.set("invoice", openInvoiceId);
    replaceUrl(`/dashboard/invoices${params.size ? `?${params}` : ""}`);
  }, [filter, query, openInvoiceId]);

  async function markSent(row: InvoiceRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/invoices/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SENT" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${row.invoiceNumber} marked sent`);
      await load();
    } catch {
      toast.error("Couldn't update the invoice.");
    } finally {
      setBusyId(null);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-light tracking-[-0.18px] text-[#061b31]">Invoices</h1>
          <p className="text-[15px] text-[#64748d]">{branchName ?? "Your branch"} · invoices, payments and receipts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && <AccountingExportButton branchId={branchId} scopeLabel={branchName ?? "Your branch"} />}
          {manageBranches.length > 0 && (
            <button type="button" className={BTN_PRIMARY} onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New invoice
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Outstanding" value={summary ? formatMYR(summary.outstanding) : "—"} hint="Unpaid balances" />
        <SummaryCard
          label="Overdue"
          value={summary ? formatMYR(summary.overdue) : "—"}
          hint={summary ? `${summary.overdueCount} invoice${summary.overdueCount === 1 ? "" : "s"}` : undefined}
        />
        <SummaryCard label="Paid this month" value={summary ? formatMYR(summary.paidThisMonth) : "—"} />
        <SummaryCard label="Drafts" value={summary ? String(summary.draftCount) : "—"} hint="Not sent yet" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setPage(1);
            }}
            aria-pressed={filter === f.id}
            className={`h-8 rounded-[4px] border px-3 text-[14px] transition-colors ${
              filter === f.id
                ? "border-[#533afd] bg-[#f0eeff] text-[#533afd]"
                : "border-[#e5edf5] bg-white text-[#425466] hover:bg-[#f6f9fc]"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748d]" strokeWidth={2} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice no. or patient"
            aria-label="Search invoices"
            className="h-8 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] pl-8 pr-2 text-[15px] focus:border-[#533afd] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#533afd]"
          />
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-[6px] border border-[#e5edf5] bg-white shadow-(--shadow-card)">
        <table className="w-full min-w-230">
          <thead>
            <tr className="border-b border-[#e5edf5] text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d] whitespace-nowrap">
              <th className="py-2.5 pl-4 pr-3">Invoice</th>
              <th className="px-3 py-2.5">Patient</th>
              <th className="px-3 py-2.5">Issued</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5 text-right">Paid</th>
              <th className="px-3 py-2.5 text-right">Balance</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#64748d]">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" strokeWidth={1.5} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <FileText className="mx-auto mb-2 h-7 w-7 text-[#c1c9d2]" strokeWidth={1.25} />
                  <p className="text-[15px] text-[#425466]">No invoices {filter === "all" && !query ? "yet" : "match"}</p>
                  {filter === "all" && !query && (
                    <p className="mt-1 text-[14px] text-[#64748d]">
                      Create one with New invoice, or issue one from a patient&apos;s History → Appointments tab.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const payable = row.status !== "CANCELLED" && row.status !== "DRAFT" && row.balance > 0;
                const open = row.status !== "CANCELLED" && row.status !== "PAID";
                return (
                  <tr
                    key={row.id}
                    onClick={(e) => {
                      // Row click opens the drawer; links and buttons inside keep their own action.
                      if (!(e.target as HTMLElement).closest("a,button")) setOpenInvoiceId(row.id);
                    }}
                    className="cursor-pointer border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc]"
                  >
                    <td className="py-3 pl-4 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setOpenInvoiceId(row.id)}
                        className="font-mono text-[14px] text-[#061b31] hover:text-[#533afd] hover:underline"
                      >
                        {row.invoiceNumber}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[15px] whitespace-nowrap">
                      <Link
                        href={`/dashboard/patients/${row.patient.id}/details?tab=billing`}
                        className="text-[#273951] hover:text-[#533afd] hover:underline"
                      >
                        {row.patient.firstName} {row.patient.lastName}
                      </Link>
                      {branchId === "all" && row.branch && (
                        <span className="block text-[13px] text-[#64748d]">{row.branch.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[14px] tabular-nums text-[#425466] whitespace-nowrap">
                      {dateMY(row.createdAt)}
                      <span className="block text-[13px] text-[#64748d]">
                        {row.status === "PAID" && row.paidAt ? `Paid ${dateMY(row.paidAt)}` : row.dueDate && open ? `Due ${dateMY(row.dueDate)}` : "\u00a0"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] tabular-nums text-[#061b31] whitespace-nowrap">{formatMYR(row.amount)}</td>
                    <td className="px-3 py-3 text-right text-[15px] tabular-nums text-[#425466] whitespace-nowrap">
                      {row.amountPaid ? formatMYR(row.amountPaid) : "—"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right text-[15px] tabular-nums whitespace-nowrap ${
                        open && row.balance > 0 ? "font-medium text-[#061b31]" : "text-[#64748d]"
                      }`}
                    >
                      {open ? formatMYR(row.balance) : "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <InvoiceStatusBadge status={row.status} />
                    </td>
                    <td className="py-2 pl-3 pr-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {row.status === "DRAFT" && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void markSent(row)}
                            className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[13px] font-medium text-[#533afd] transition-colors hover:bg-[#f0eeff] disabled:opacity-60"
                          >
                            Mark sent
                          </button>
                        )}
                        {payable && (
                          <button
                            type="button"
                            onClick={() => setPayRow(row)}
                            className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[13px] font-medium text-[#108c3d] transition-colors hover:bg-[#ecfbf0]"
                          >
                            Record payment
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-[14px] text-[#64748d]">
          <span>
            {total} invoice{total === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-8 rounded-[4px] border border-[#e5edf5] bg-white px-3 disabled:opacity-50"
            >
              Previous
            </button>
            Page {page} of {pages}
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 rounded-[4px] border border-[#e5edf5] bg-white px-3 disabled:opacity-50"
            >
              Next
            </button>
          </span>
        </div>
      )}

      <InvoiceDrawer
        invoiceId={openInvoiceId}
        onClose={() => setOpenInvoiceId(null)}
        roleFor={roleFor}
        onChanged={() => void load()}
      />
      {payRow && (
        <RecordPaymentDialog
          mode="payment"
          open
          invoice={{ id: payRow.id, invoiceNumber: payRow.invoiceNumber, balance: payRow.balance, amountPaid: payRow.amountPaid }}
          onOpenChange={(o) => !o && setPayRow(null)}
          onRecorded={() => void load()}
        />
      )}
      <NewInvoiceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        branches={manageBranches}
        defaultBranchId={branchId === "all" ? null : branchId}
        onCreated={(invoice) => {
          toast.success(`${invoice.invoiceNumber} created`);
          void load();
          setOpenInvoiceId(invoice.id);
        }}
      />
    </div>
  );
}

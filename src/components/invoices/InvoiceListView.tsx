"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Search } from "lucide-react";
import { allowedInvoiceTransitions, formatMYR, type InvoiceStatus } from "@/lib/invoices";
import { replaceUrl } from "@/lib/url-state";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string };
  branch?: { name: string };
}

interface Summary {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  paidThisMonth: number;
  draftCount: number;
}

type Filter = "all" | InvoiceStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "DRAFT", label: "Draft" },
  { id: "SENT", label: "Sent" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PAID", label: "Paid" },
  { id: "CANCELLED", label: "Cancelled" },
];

const STATUS_STYLE: Record<InvoiceStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-[#f0f3f7] text-[#425466]" },
  SENT: { label: "Sent", className: "bg-[#e6f0fc] text-[#0570DE]" },
  OVERDUE: { label: "Overdue", className: "bg-[#fef3e2] text-[#9b6829]" },
  PAID: { label: "Paid", className: "bg-[#e6f9ee] text-[#108c3d]" },
  CANCELLED: { label: "Cancelled", className: "bg-[#fdecef] text-[#b41a36]" },
};

const ACTION_LABEL: Partial<Record<InvoiceStatus, string>> = {
  SENT: "Mark sent",
  PAID: "Mark paid",
  CANCELLED: "Cancel",
};

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

export function InvoiceListView({ branchId, branchName }: { branchId: string; branchName: string | null }) {
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
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (query) params.set("search", query);
    replaceUrl(`/dashboard/invoices${params.size ? `?${params}` : ""}`);
  }, [load, filter, query]);

  async function changeStatus(row: InvoiceRow, next: InvoiceStatus) {
    if (next === "CANCELLED" && !window.confirm(`Cancel invoice ${row.invoiceNumber}? This can't be undone.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/invoices/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next === "PAID" ? `${row.invoiceNumber} marked paid — receipt ready` : `${row.invoiceNumber} ${next === "SENT" ? "marked sent" : "cancelled"}`,
      );
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
      <div>
        <h1 className="text-[23px] font-light tracking-[-0.18px] text-[#061b31]">Invoices</h1>
        <p className="text-[15px] text-[#64748d]">{branchName ?? "Your branch"} · issue from a completed appointment</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Outstanding" value={summary ? formatMYR(summary.outstanding) : "—"} hint="Sent, not yet paid" />
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
        <table className="w-full min-w-180">
          <thead>
            <tr className="border-b border-[#e5edf5] text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d] whitespace-nowrap">
              <th className="px-4 py-2.5">Invoice</th>
              <th className="px-4 py-2.5">Patient</th>
              <th className="px-4 py-2.5">Issued</th>
              <th className="px-4 py-2.5">Due</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 min-w-56"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#64748d]">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" strokeWidth={1.5} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <FileText className="mx-auto mb-2 h-7 w-7 text-[#c1c9d2]" strokeWidth={1.25} />
                  <p className="text-[15px] text-[#425466]">No invoices {filter === "all" && !query ? "yet" : "match"}</p>
                  {filter === "all" && !query && (
                    <p className="mt-1 text-[14px] text-[#64748d]">
                      Issue one from a patient&apos;s History → Appointments tab once a visit is completed.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const style = STATUS_STYLE[row.status];
                return (
                  <tr key={row.id} className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc]">
                    <td className="px-4 py-3 font-mono text-[14px] text-[#061b31] whitespace-nowrap">{row.invoiceNumber}</td>
                    <td className="px-4 py-3 text-[15px] whitespace-nowrap">
                      <Link
                        href={`/dashboard/patients/${row.patient.id}/details?tab=history&sub=appointments`}
                        className="text-[#273951] hover:text-[#533afd] hover:underline"
                      >
                        {row.patient.firstName} {row.patient.lastName}
                      </Link>
                      {branchId === "all" && row.branch && (
                        <span className="block text-[13px] text-[#64748d]">{row.branch.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[14px] tabular-nums text-[#425466] whitespace-nowrap">{dateMY(row.createdAt)}</td>
                    <td className="px-4 py-3 text-[14px] tabular-nums text-[#425466] whitespace-nowrap">
                      {row.status === "PAID" && row.paidAt ? `Paid ${dateMY(row.paidAt)}` : row.dueDate ? dateMY(row.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-[15px] tabular-nums text-[#061b31] whitespace-nowrap">{formatMYR(row.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[13px] font-medium ${style.className}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {allowedInvoiceTransitions(row.status).map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void changeStatus(row, next)}
                            className={`h-7 rounded-md border border-[#e5edf5] bg-white px-2 text-[12px] font-medium transition-colors disabled:opacity-60 ${
                              next === "CANCELLED" ? "text-[#DF1B41] hover:bg-[#fff0f3]" : next === "PAID" ? "text-[#108c3d] hover:bg-[#ecfbf0]" : "text-[#533afd] hover:bg-[#f0eeff]"
                            }`}
                          >
                            {ACTION_LABEL[next]}
                          </button>
                        ))}
                        <a
                          href={`/api/invoices/${row.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-7 rounded-md border border-[#e5edf5] bg-white px-2 text-[12px] font-medium leading-7 text-[#425466] hover:bg-[#f6f9fc]"
                        >
                          {row.status === "PAID" ? "Receipt" : "PDF"}
                        </a>
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
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BranchAuditEntry } from "@/types/branch";
import {
  formatFieldName,
  formatFieldValue,
  actionStyle,
  formatRelativeTime,
} from "./audit-log-format";

interface BranchActivityLogProps {
  branchId: string;
}

export function BranchActivityLog({ branchId }: BranchActivityLogProps) {
  const [entries, setEntries] = useState<BranchAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const url = new URL(`/api/branches/${branchId}/audit-log`, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load activity log");
      }
      return (await res.json()) as { entries: BranchAuditEntry[]; nextCursor: string | null };
    },
    [branchId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries);
        setNextCursor(data.nextCursor);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(nextCursor);
      setEntries((prev) => [...prev, ...data.entries]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <h3 className="text-[15px] font-medium text-[#061b31]">Activity Log</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-[4px] bg-[#F6F9FC] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <h3 className="text-[15px] font-medium text-[#061b31]">Activity Log</h3>
        </div>
        <p className="text-[14px] text-[#64748d]">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[#e5edf5]">
        <Activity className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
        <h3 className="text-[15px] font-medium text-[#061b31]">Activity Log</h3>
        <span className="text-[13px] text-[#64748d] ml-auto">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <Activity className="h-8 w-8 text-[#a3acb9] mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-[14px] text-[#64748d]">No activity yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#e5edf5]">
          {entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="px-6 py-3 border-t border-[#e5edf5] flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="h-8 px-4 rounded-[4px] border-[#e5edf5] text-[13px] text-[#061b31] cursor-pointer hover:bg-[#F6F9FC] transition-colors duration-200"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" strokeWidth={1.5} />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: BranchAuditEntry }) {
  const style = actionStyle(entry.action);
  const initials = (entry.actorName ?? entry.actorEmail ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const absoluteTime = new Date(entry.createdAt).toLocaleString();
  const relativeTime = formatRelativeTime(entry.createdAt);

  return (
    <div className="px-6 py-4 hover:bg-[#F6F9FC] transition-colors duration-200">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#ededfc] text-[#533afd] flex items-center justify-center text-[12px] font-medium">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] text-[#061b31] font-medium">
              {entry.actorName ?? entry.actorEmail ?? "Unknown"}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${style.bg.split(" ")[0]} ${style.text}`}
            >
              {style.label}
            </span>
            <span className="text-[12px] text-[#64748d]" title={absoluteTime}>
              {relativeTime}
            </span>
          </div>
          <ChangeSummary entry={entry} />
        </div>
      </div>
    </div>
  );
}

function ChangeSummary({ entry }: { entry: BranchAuditEntry }) {
  if (entry.action === "CREATE") {
    return (
      <p className="text-[13px] text-[#64748d] mt-1">
        Created branch <span className="text-[#061b31]">{entry.branchNameAtEvent}</span>
      </p>
    );
  }
  if (entry.action === "DELETE") {
    return (
      <p className="text-[13px] text-[#64748d] mt-1">
        Deleted branch <span className="text-[#061b31]">{entry.branchNameAtEvent}</span>
      </p>
    );
  }
  // UPDATE
  const changes = entry.changes as { before: Record<string, unknown>; after: Record<string, unknown> };
  const fields = Object.keys(changes.before);
  if (fields.length === 0) return null;
  return (
    <ul className="text-[13px] text-[#64748d] mt-1 space-y-0.5">
      {fields.map((f) => (
        <li key={f}>
          <span className="text-[#273951]">{formatFieldName(f)}:</span>{" "}
          <span className="line-through opacity-70">{formatFieldValue(changes.before[f])}</span>{" "}
          → <span className="text-[#061b31]">{formatFieldValue(changes.after[f])}</span>
        </li>
      ))}
    </ul>
  );
}

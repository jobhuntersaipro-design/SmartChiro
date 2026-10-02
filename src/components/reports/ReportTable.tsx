"use client";

import type { ReactNode } from "react";
import { toCsv, type CsvCell } from "@/lib/reports/csv";
import { cn } from "@/lib/utils";

/**
 * One column definition drives both the on-screen table and its CSV, so an
 * export always carries exactly what the card shows (totals included).
 */
export interface ReportColumn<T> {
  header: string;
  /** CSV header when it should differ (e.g. "Collected (MYR)"). */
  csvHeader?: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  csv: (row: T) => CsvCell;
  /** Extra classes for body cells (e.g. a min width). */
  className?: string;
}

export function tableCsv<T>(columns: ReportColumn<T>[], rows: T[], footer?: T): string {
  const body = [...rows, ...(footer ? [footer] : [])].map((row) => columns.map((c) => c.csv(row)));
  return toCsv(columns.map((c) => c.csvHeader ?? c.header), body);
}

interface ReportTableProps<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  footer?: T;
  rowKey: (row: T) => string;
  empty: string;
  caption: string;
}

export function ReportTable<T>({ columns, rows, footer, rowKey, empty, caption }: ReportTableProps<T>) {
  const align = (c: ReportColumn<T>) => (c.align === "right" ? "text-right" : "text-left");
  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[13px] font-medium text-fg-secondary">
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", align(c))}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-[14px] text-fg-secondary">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface-muted">
                {columns.map((c) => (
                  <td key={c.header} className={cn("px-3 py-2 text-foreground tabular-nums", align(c), c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-border bg-surface-muted font-medium text-foreground">
              {columns.map((c) => (
                <td key={c.header} className={cn("px-3 py-2 tabular-nums whitespace-nowrap", align(c))}>
                  {c.render(footer)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

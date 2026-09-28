"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  open: boolean;
  title: string;
  description?: string;
  /** Ignored while `busy` so an in-flight save isn't abandoned. */
  onClose: () => void;
  busy?: boolean;
  /** Tailwind width class for the panel. */
  widthClass?: string;
  /** Stack above another open modal. */
  elevated?: boolean;
  role?: "dialog" | "alertdialog";
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** Open ModalShells, newest last — only the top one answers Escape. */
const openStack: string[] = [];

/** Centered modal in the app's dialog style (header, scrolling body, footer bar). */
export function ModalShell({
  open,
  title,
  description,
  onClose,
  busy = false,
  widthClass = "max-w-lg",
  elevated = false,
  role = "dialog",
  footer,
  children,
}: ModalShellProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    openStack.push(titleId);
    return () => {
      const i = openStack.lastIndexOf(titleId);
      if (i >= 0) openStack.splice(i, 1);
    };
  }, [open, titleId]);

  useEffect(() => {
    if (!open) return;
    // Capture phase so a host dialog underneath doesn't also close on the same Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || openStack[openStack.length - 1] !== titleId) return;
      e.stopPropagation();
      if (!busy) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onClose, titleId]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/40 p-4 ${elevated ? "z-60" : "z-50"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      // May render inside another dialog's overlay — keep clicks from reaching it.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl border border-[#e5edf5] bg-white shadow-[0_12px_40px_rgba(18,42,66,0.15)]`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5edf5] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-[#061b31]">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-[#64748d]">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="shrink-0 text-[#94a3b8] transition-colors hover:text-[#061b31]"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e5edf5] bg-[#fafbfd] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const FIELD_CLASS =
  "w-full h-9 rounded-md border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[14px] text-[#061b31] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white disabled:opacity-60";

export const LABEL_CLASS = "mb-1 block text-[13px] font-medium text-[#273951]";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-[#fcd0db] bg-[#fef2f5] px-3 py-2 text-[13px] text-[#DF1B41]">
      {message}
    </div>
  );
}

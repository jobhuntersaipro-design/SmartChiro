"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Pencil, X, Trash2 } from "lucide-react";

interface Props {
  canEdit: boolean;
  canDelete: boolean; // OWNER/ADMIN only — gates the Delete option
  onEdit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function AppointmentActionsMenu({ canEdit, canDelete, onEdit, onCancel, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!canEdit) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31] transition-colors"
        aria-label="Appointment actions"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-30 w-[180px] rounded-[6px] border border-[#e5edf5] bg-white py-1"
          style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#273951] hover:bg-[#f6f9fc] transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Edit appointment
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onCancel();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#9b6829] hover:bg-[#FFF8E1] transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} /> Cancel appointment
          </button>
          {canDelete && onDelete && (
            <>
              <div className="my-1 h-px bg-[#e5edf5]" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[#DF1B41] hover:bg-[#FDE8EC] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Delete permanently
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

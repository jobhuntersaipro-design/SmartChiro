"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2, Check } from "lucide-react";

interface BranchPickerProps {
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  onBranchChange: (branchId: string | null) => void;
}

export function BranchPicker({
  branches,
  selectedBranchId,
  onBranchChange,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const label = selectedBranch?.name ?? "All Branches";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={label}
        className="flex max-w-full items-center gap-2 h-9 px-3 rounded-md border border-border bg-white text-[15px] font-medium text-foreground whitespace-nowrap hover:bg-surface-muted transition-all duration-200 cursor-pointer hover:border-border-strong active:scale-[0.98]"
      >
        <Building2 className="h-4 w-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-fg-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-panel border border-border bg-white py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <button
            onClick={() => {
              onBranchChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-foreground hover:bg-surface-muted transition-all duration-200 cursor-pointer hover:translate-x-0.5"
          >
            <div className="w-4 flex justify-center">
              {selectedBranchId === null && (
                <Check className="h-3.5 w-3.5 text-brand" strokeWidth={1.5} />
              )}
            </div>
            All Branches
          </button>

          {branches.length > 0 && (
            <div className="mx-3 my-1 border-t border-border" />
          )}

          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => {
                onBranchChange(branch.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-foreground hover:bg-surface-muted transition-all duration-200 cursor-pointer hover:translate-x-0.5"
            >
              <div className="w-4 flex justify-center">
                {selectedBranchId === branch.id && (
                  <Check className="h-3.5 w-3.5 text-brand" strokeWidth={1.5} />
                )}
              </div>
              {branch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

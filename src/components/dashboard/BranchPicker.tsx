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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-9 px-3 rounded-[4px] border border-[#e5edf5] bg-white text-[15px] font-medium text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer hover:border-[#c1c9d2] active:scale-[0.98]"
      >
        <Building2 className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 text-[#64748d] transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.5} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-[6px] border border-[#e5edf5] bg-white py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{
            boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
          }}
        >
          <button
            onClick={() => {
              onBranchChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer hover:translate-x-0.5"
          >
            <div className="w-4 flex justify-center">
              {selectedBranchId === null && (
                <Check className="h-3.5 w-3.5 text-[#533afd]" strokeWidth={1.5} />
              )}
            </div>
            All Branches
          </button>

          {branches.length > 0 && (
            <div className="mx-3 my-1 border-t border-[#e5edf5]" />
          )}

          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => {
                onBranchChange(branch.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[14px] text-[#061b31] hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer hover:translate-x-0.5"
            >
              <div className="w-4 flex justify-center">
                {selectedBranchId === branch.id && (
                  <Check className="h-3.5 w-3.5 text-[#533afd]" strokeWidth={1.5} />
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

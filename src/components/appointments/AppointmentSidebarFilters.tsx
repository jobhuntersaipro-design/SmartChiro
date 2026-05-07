"use client";

import { Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { doctorColor } from "@/components/calendar/doctor-color";

interface BranchOption {
  id: string;
  name: string;
  doctors: { id: string; name: string; image: string | null }[];
}

interface Props {
  branches: BranchOption[];
  branchId: string;
  doctorIds: string[];
  selectedDate: Date;
  showCancelled: boolean;
  showNoShow: boolean;
  /** Date strings (YYYY-MM-DD) that should display a dot indicator. */
  markerDates: string[];
  onBranchChange: (id: string) => void;
  onDoctorIdsChange: (ids: string[]) => void;
  onDateChange: (date: Date) => void;
  onShowCancelledChange: (v: boolean) => void;
  onShowNoShowChange: (v: boolean) => void;
  onClearFilters: () => void;
  filtersDirty: boolean;
}

export function AppointmentSidebarFilters({
  branches,
  branchId,
  doctorIds,
  selectedDate,
  showCancelled,
  showNoShow,
  markerDates,
  onBranchChange,
  onDoctorIdsChange,
  onDateChange,
  onShowCancelledChange,
  onShowNoShowChange,
  onClearFilters,
  filtersDirty,
}: Props) {
  const branch = branches.find((b) => b.id === branchId);
  const doctors = branch?.doctors ?? [];

  function toggleDoctor(id: string) {
    if (doctorIds.includes(id)) {
      onDoctorIdsChange(doctorIds.filter((d) => d !== id));
    } else {
      onDoctorIdsChange([...doctorIds, id]);
    }
  }

  // react-day-picker accepts a Date[] modifier — convert YYYY-MM-DD strings.
  const markerDatesParsed = markerDates.map((s) => {
    const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d);
  });

  return (
    <aside
      aria-label="Appointment filters"
      className="hidden xl:flex w-[280px] shrink-0 flex-col gap-4 border-r border-[#e5edf5] bg-white p-4 overflow-y-auto"
    >
      {/* Branch */}
      {branches.length > 1 && (
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-1.5">
            Branch
          </label>
          <Select value={branchId} onValueChange={(v) => v && onBranchChange(v)}>
            <SelectTrigger className="h-9 w-full rounded-[4px] text-[13px]">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-[13px]">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Doctor multi-select */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-1.5">
          Doctor
        </label>
        <Popover>
          <PopoverTrigger className="inline-flex items-center w-full h-9 px-3 rounded-[4px] border border-[#e5edf5] bg-white text-[13px] text-[#061b31] hover:bg-[#fafbfd] transition-colors">
            <span className="truncate">
              {doctorIds.length === 0
                ? "All doctors"
                : doctorIds.length === 1
                ? doctors.find((d) => d.id === doctorIds[0])?.name ?? "1 doctor"
                : `${doctorIds.length} doctors`}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search doctor..." className="h-9" />
              <CommandList>
                <CommandEmpty>No doctor found.</CommandEmpty>
                <CommandGroup>
                  {doctors.map((d) => {
                    const selected = doctorIds.includes(d.id);
                    return (
                      <CommandItem
                        key={d.id}
                        value={d.name}
                        onSelect={() => toggleDoctor(d.id)}
                        className="text-[13px] cursor-pointer"
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full mr-2"
                          style={{ backgroundColor: doctorColor(d.id) }}
                          aria-hidden="true"
                        />
                        {d.name}
                        {selected && (
                          <Check
                            className="h-3.5 w-3.5 ml-auto opacity-70"
                            strokeWidth={2}
                          />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Mini calendar */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-1.5">
          Date
        </label>
        <div className="rounded-[6px] border border-[#e5edf5] bg-white">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && onDateChange(d)}
            weekStartsOn={1}
            modifiers={{ hasAppointment: markerDatesParsed }}
            modifiersClassNames={{
              hasAppointment:
                "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-[#635BFF]",
            }}
          />
        </div>
      </div>

      {/* Quick toggles */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-1.5">
          Show
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[13px] text-[#425466] cursor-pointer">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => onShowCancelledChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded-[3px] border-[#e5edf5] accent-[#635BFF]"
            />
            Show cancelled
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#425466] cursor-pointer">
            <input
              type="checkbox"
              checked={showNoShow}
              onChange={(e) => onShowNoShowChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded-[3px] border-[#e5edf5] accent-[#635BFF]"
            />
            Show no-show
          </label>
        </div>
      </div>

      {filtersDirty && (
        <button
          onClick={onClearFilters}
          className="text-[12px] text-[#635BFF] hover:underline self-start"
        >
          Clear filters
        </button>
      )}
    </aside>
  );
}

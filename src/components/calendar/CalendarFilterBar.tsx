"use client";

import { useState } from "react";
import { Views, type View } from "react-big-calendar";
import { format } from "date-fns/format";
import { Check, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { doctorColor } from "./doctor-color";

interface BranchOption {
  id: string;
  name: string;
  role: string;
  doctors: { id: string; name: string; image: string | null }[];
}

interface Props {
  branches: BranchOption[];
  branchId: string;
  doctorIds: string[];
  view: View;
  date: Date;
  onBranchChange: (id: string) => void;
  onDoctorIdsChange: (ids: string[]) => void;
  onViewChange: (v: View) => void;
  onDateChange: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const VIEW_LABELS: Record<View, string> = {
  [Views.DAY]: "Day",
  [Views.WEEK]: "Week",
  [Views.MONTH]: "Month",
  [Views.AGENDA]: "Agenda",
  [Views.WORK_WEEK]: "Work Week",
};

export function CalendarFilterBar({
  branches,
  branchId,
  doctorIds,
  view,
  date,
  onBranchChange,
  onDoctorIdsChange,
  onViewChange,
  onDateChange,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const [doctorPickerOpen, setDoctorPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const branch = branches.find((b) => b.id === branchId);
  const doctors = branch?.doctors ?? [];

  function toggleDoctor(id: string) {
    if (doctorIds.includes(id)) {
      onDoctorIdsChange(doctorIds.filter((d) => d !== id));
    } else {
      onDoctorIdsChange([...doctorIds, id]);
    }
  }

  const dateLabel =
    view === Views.MONTH
      ? format(date, "MMMM yyyy")
      : view === Views.DAY
      ? format(date, "EEE, d MMM yyyy")
      : `Week of ${format(date, "d MMM yyyy")}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          className="h-8 rounded-[4px] border-[#e5edf5] text-[13px]"
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onPrev}
          aria-label="Previous"
          className="h-8 w-8 rounded-[4px] border-[#e5edf5]"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          aria-label="Next"
          className="h-8 w-8 rounded-[4px] border-[#e5edf5]"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Button>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger
            className="inline-flex items-center h-8 px-3 rounded-[4px] border border-[#e5edf5] bg-white text-[13px] font-medium text-[#061b31] gap-1.5 min-w-[170px] hover:bg-[#fafbfd] transition-colors"
          >
            {dateLabel}
            <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50" strokeWidth={2} />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  setDatePickerOpen(false);
                }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* View switcher */}
        <div className="inline-flex rounded-[4px] border border-[#e5edf5] overflow-hidden">
          {([Views.DAY, Views.WEEK, Views.MONTH] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`h-8 px-3 text-[13px] font-medium border-r border-[#e5edf5] last:border-r-0 transition-colors ${
                v === view
                  ? "bg-[#ededfc] text-[#635BFF]"
                  : "bg-white text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Branch select */}
        {branches.length > 1 && (
          <Select value={branchId} onValueChange={(v) => v && onBranchChange(v)}>
            <SelectTrigger className="h-8 w-[200px] rounded-[4px] text-[13px]">
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
        )}

        {/* Doctor multi-select */}
        <Popover open={doctorPickerOpen} onOpenChange={setDoctorPickerOpen}>
          <PopoverTrigger
            className="inline-flex items-center h-8 px-3 rounded-[4px] border border-[#e5edf5] bg-white text-[13px] gap-1.5 min-w-[160px] hover:bg-[#fafbfd] transition-colors"
          >
            {doctorIds.length === 0
              ? "All doctors"
              : doctorIds.length === 1
              ? doctors.find((d) => d.id === doctorIds[0])?.name ?? "1 doctor"
              : `${doctorIds.length} doctors`}
            <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50" strokeWidth={2} />
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="end">
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
                        />
                        {d.name}
                        {selected && <Check className="h-3.5 w-3.5 ml-auto opacity-70" strokeWidth={2} />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COMMON_NATIONALITIES, allCountries, countryName, nationalityLabel } from "@/lib/nationality";
import { cn } from "@/lib/utils";

interface NationalitySelectProps {
  /** ISO 3166-1 alpha-2, or null for not recorded. */
  value: string | null;
  onChange: (code: string | null) => void;
  /** Shown under the field, e.g. why Malaysia was filled in. */
  hint?: string | null;
  className?: string;
  id?: string;
}

/** Searchable country picker for a patient's nationality (common countries first, then every ISO country). */
export function NationalitySelect({ value, onChange, hint, className, id }: NationalitySelectProps) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => allCountries(), []);
  const common = COMMON_NATIONALITIES.map((code) => ({ code, name: countryName(code) }));

  function pick(code: string | null) {
    onChange(code);
    setOpen(false);
  }

  const item = (c: { code: string; name: string }, group: string) => (
    <CommandItem key={`${group}-${c.code}`} value={`${c.name} ${c.code} ${group}`} onSelect={() => pick(c.code)}>
      <span className="flex-1 truncate">{c.name}</span>
      <span className="font-mono text-[12px] text-fg-secondary">{c.code}</span>
      {value === c.code && <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2} />}
    </CommandItem>
  );

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 text-left text-[15px] text-foreground transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-fg-disabled")}>{nationalityLabel(value) ?? "Select country…"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-secondary" strokeWidth={1.75} />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country or code…" className="h-9" />
            <CommandList className="max-h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup heading="Common">
                {common.map((c) => item(c, "common"))}
              </CommandGroup>
              <CommandGroup heading="All countries">
                {all.map((c) => item(c, "all"))}
              </CommandGroup>
              {value && (
                <CommandGroup>
                  <CommandItem value="not recorded clear" onSelect={() => pick(null)}>
                    <span className="text-fg-secondary">Not recorded</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint && <p className="mt-1 text-[12px] text-fg-secondary">{hint}</p>}
    </div>
  );
}

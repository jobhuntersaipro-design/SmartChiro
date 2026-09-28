"use client";

import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  dateFromIso,
  formatDateInput,
  isoFromDate,
  validateDateInput,
} from "@/lib/date-input";

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
>;

export interface DateInputProps extends NativeInputProps {
  /** "YYYY-MM-DD", or "" when empty. */
  value: string;
  /** Called with "YYYY-MM-DD", or "" while the typed text is empty, incomplete or invalid. */
  onChange: (iso: string) => void;
  /** Earliest allowed "YYYY-MM-DD" (inclusive). */
  min?: string;
  /** Latest allowed "YYYY-MM-DD" (inclusive). */
  max?: string;
  /** Reports the current validation message (null when empty or valid) so a form can block Next/Save. */
  onErrorChange?: (error: string | null) => void;
  /** Classes for the wrapper. */
  className?: string;
  /** Classes merged onto the text input, e.g. a dialog's own input style. */
  inputClassName?: string;
  /** Render the validation message under the input (default true). */
  showError?: boolean;
}

const BASE_INPUT =
  "flex h-9 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 text-[15px] text-[#0A2540] tabular-nums placeholder:text-[#A3ACB9] transition-colors focus:outline-none focus:ring-1 focus:ring-[#635BFF] focus:border-[#635BFF] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60";
const INVALID_INPUT = "border-[#DF1B41]/60 focus:ring-[#DF1B41] focus:border-[#DF1B41]";

/**
 * Date field that shows and accepts dd/mm/yyyy (also d/m/yyyy, dd-mm-yyyy,
 * ddmmyyyy) with a calendar popover; the value stays ISO "YYYY-MM-DD".
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  onErrorChange,
  className,
  inputClassName,
  showError = true,
  placeholder = "dd/mm/yyyy",
  disabled,
  id,
  onBlur,
  ...rest
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  const [text, setText] = useState(() => formatDateInput(value));
  // The last value this field emitted/received; a different `value` prop is an outside change.
  const [synced, setSynced] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);

  if (value !== synced) {
    setSynced(value);
    setText(formatDateInput(value));
    setError(null);
    setTouched(false);
  }

  function emit(iso: string, nextError: string | null) {
    if (iso !== synced) {
      setSynced(iso);
      onChange(iso);
    }
    if (nextError !== error) {
      setError(nextError);
      onErrorChange?.(nextError);
    }
  }

  function handleType(next: string) {
    setText(next);
    const result = validateDateInput(next, { min, max });
    // Complete-looking text shows its error straight away; otherwise wait for blur.
    if (next.trim().length >= 10) setTouched(true);
    emit(result.iso, result.error);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setTouched(true);
    const result = validateDateInput(text, { min, max });
    if (result.iso) setText(formatDateInput(result.iso));
    onBlur?.(e);
  }

  function handlePick(date: Date | undefined) {
    if (!date) return;
    const iso = isoFromDate(date);
    setText(formatDateInput(iso));
    setTouched(false);
    emit(iso, null);
    setOpen(false);
  }

  const selected = dateFromIso(value);
  const minDate = dateFromIso(min);
  const maxDate = dateFromIso(max);
  const now = new Date();
  const visibleError = showError && touched ? error : null;
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type="text"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => handleType(e.target.value)}
          onBlur={handleBlur}
          aria-invalid={touched && error ? true : rest["aria-invalid"]}
          aria-describedby={
            visibleError ? cn(rest["aria-describedby"], errorId) : rest["aria-describedby"]
          }
          className={cn(BASE_INPUT, inputClassName, "pr-9", touched && error && INVALID_INPUT)}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={disabled}
            aria-label="Choose date from calendar"
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-[4px] text-[#697386] transition-colors hover:bg-[#F0F3F7] hover:text-[#0A2540] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF] disabled:pointer-events-none disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="end"
            onKeyDown={(e) => {
              // Esc closes the calendar only, not the dialog around it.
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handlePick}
              defaultMonth={selected ?? (maxDate && maxDate < now ? maxDate : minDate && minDate > now ? minDate : undefined)}
              disabled={disabledDays}
              captionLayout="dropdown"
              startMonth={minDate ?? new Date(1900, 0)}
              endMonth={maxDate ?? new Date(now.getFullYear() + 10, 11)}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {visibleError && (
        <p id={errorId} role="alert" className="mt-1 text-[12px] text-[#DF1B41]">
          {visibleError}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CalendarCheck, Check, MessageCircle } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/** Landing-page loop of the public booking page on a phone, ending with the reminder and calendar entry. */

const TITLES = ["What would you like to book?", "Who would you like to see?", "Pick a date", "Pick a time", "Your details"];
const BOOKED = TITLES.length;

export function BookingDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [step, setStep] = useState(0);
  const shown = reduced ? BOOKED : step;

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % (BOOKED + 1)), step === BOOKED ? 4500 : 2200);
    return () => window.clearTimeout(id);
  }, [step, reduced, inView]);

  return (
    <div ref={ref} className="relative mx-auto w-fit py-6" role="img" aria-label="Animated demo of a patient booking an appointment online on a phone">
      <div className="w-72 rounded-surface border-8 border-foreground bg-surface-subtle shadow-(--shadow-floating)" aria-hidden>
        <div className="flex h-136 flex-col overflow-hidden rounded-panel">
          <div className="flex items-center justify-between px-5 pt-2.5 text-[11px] font-medium text-foreground">
            <span>9:41</span>
            <span className="h-4 w-16 rounded-full bg-foreground" />
            <span>5G</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-[13px] font-semibold text-brand">SW</span>
            <div className="min-w-0">
              <p className="text-[11px] text-fg-muted">Book an appointment</p>
              <p className="truncate text-[14px] font-semibold text-foreground">Spine & Wellness Clinic</p>
            </div>
          </div>

          <div className="m-3 flex-1 rounded-panel border border-border bg-surface p-3.5 shadow-(--shadow-card)">
            <div className="mb-3 flex gap-1">
              {TITLES.map((title, i) => (
                <span key={title} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i < shown + 1 ? "bg-brand" : "bg-border")} />
              ))}
            </div>
            <div key={shown} className="landing-fade">
              {shown < BOOKED && <p className="mb-2.5 text-[14px] font-semibold text-foreground">{TITLES[shown]}</p>}
              <Screen step={shown} />
            </div>
          </div>
        </div>
      </div>

      {shown === BOOKED && (
        <>
          <Toast className="-left-10 top-10 sm:-left-28" icon={<CalendarCheck className="size-4 text-brand" />} title="New online booking">
            Sarah Lim · Thu 8, 10:30 AM — added to Dr. Aisyah&apos;s calendar
          </Toast>
          <Toast className="-right-10 bottom-16 sm:-right-28" icon={<MessageCircle className="size-4 text-success" />} title="WhatsApp reminder" delay>
            Hi Sarah, see you tomorrow at 10:30 AM at Spine & Wellness Clinic.
          </Toast>
        </>
      )}
    </div>
  );
}

function Screen({ step }: { step: number }) {
  switch (step) {
    case 0:
      return (
        <Options
          items={[
            ["Initial consultation", "45 min"],
            ["Chiropractic adjustment", "30 min"],
            ["Follow-up visit", "20 min"],
          ]}
          selected={1}
        />
      );
    case 1:
      return (
        <Options
          items={[
            ["Any doctor", "First available"],
            ["Dr. Aisyah Rahman", "Chiropractor"],
            ["Dr. Daniel Tan", "Chiropractor"],
          ]}
          selected={1}
          avatars
        />
      );
    case 2:
      return (
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="py-1 text-fg-muted">
              {d}
            </span>
          ))}
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <span
              key={d}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full",
                d === 8 ? "bg-brand font-semibold text-white" : d < 5 ? "text-fg-disabled" : "text-foreground",
              )}
            >
              {d}
            </span>
          ))}
        </div>
      );
    case 3:
      return (
        <div className="space-y-2.5">
          <p className="text-[11px] text-fg-muted">Thursday 8 · Dr. Aisyah Rahman</p>
          {[
            ["Morning", ["9:00 AM", "9:30 AM", "10:30 AM"]],
            ["Afternoon", ["2:00 PM", "3:30 PM", "4:30 PM"]],
          ].map(([part, times]) => (
            <div key={part as string}>
              <p className="mb-1.5 text-[11px] font-medium text-fg-secondary">{part}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(times as string[]).map((time) => (
                  <span
                    key={time}
                    className={cn(
                      "rounded-control border py-1.5 text-center text-[11px]",
                      time === "10:30 AM" ? "border-brand bg-brand-subtle font-medium text-brand" : "border-border text-foreground",
                    )}
                  >
                    {time}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case 4:
      return (
        <div className="space-y-2.5">
          {[
            ["Full name", "Sarah Lim"],
            ["Mobile number", "+60 12-000 0000"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="mb-1 text-[11px] text-fg-secondary">{label}</p>
              <p className="rounded-control bg-surface-muted px-3 py-2 text-[12px] text-foreground">{value}</p>
            </div>
          ))}
          <p className="mt-4 rounded-control bg-primary py-2.5 text-center text-[12px] font-medium text-primary-foreground">Confirm booking</p>
        </div>
      );
    default:
      return (
        <div className="flex flex-col items-center pt-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success">
            <Check className="size-7" strokeWidth={2.5} />
          </span>
          <p className="mt-3 text-[16px] font-semibold text-foreground">You&apos;re booked!</p>
          <div className="mt-4 w-full rounded-panel bg-surface-muted p-3 text-left text-[12px] leading-relaxed text-fg-secondary">
            <p className="font-medium text-foreground">Chiropractic adjustment</p>
            <p>Thursday 8 · 10:30 AM</p>
            <p>Dr. Aisyah Rahman</p>
          </div>
          <p className="mt-3 text-[11px] text-fg-muted">We&apos;ll remind you on WhatsApp before your visit.</p>
        </div>
      );
  }
}

function Options({ items, selected, avatars }: { items: [string, string][]; selected: number; avatars?: boolean }) {
  return (
    <div className="space-y-2">
      {items.map(([title, sub], i) => (
        <div
          key={title}
          className={cn(
            "flex items-center gap-2.5 rounded-panel border px-3 py-2",
            i === selected ? "border-brand bg-brand-subtle" : "border-border",
          )}
        >
          {avatars && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-fg-secondary">
              {title === "Any doctor" ? "★" : title.replace("Dr. ", "").split(" ").map((w) => w[0]).join("")}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium text-foreground">{title}</span>
            <span className="block text-[11px] text-fg-muted">{sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Toast({ className, icon, title, delay, children }: { className: string; icon: ReactNode; title: string; delay?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "landing-fade absolute w-52 rounded-panel border border-border bg-surface p-3 shadow-(--shadow-floating) sm:w-60",
        delay && "[animation-delay:700ms]",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-fg-secondary">{children}</p>
    </div>
  );
}

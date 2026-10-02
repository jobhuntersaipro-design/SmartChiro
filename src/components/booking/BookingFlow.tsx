"use client";

import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { PublicBookingConfig, PublicBookingConfirmation, PublicSlot } from "@/types/booking";
import { longDateLabel } from "@/lib/booking/date-keys";
import { BookingHeader, ChoiceSummary, InlineAlert, Initials, OptionButton, StepCard } from "./BookingParts";
import { DatePickerStep } from "./DatePickerStep";
import { TimeSlotStep } from "./TimeSlotStep";
import { BookingDetailsForm, EMPTY_DETAILS, type DetailsValues } from "./BookingDetailsForm";
import { BookingSuccess } from "./BookingSuccess";
import { useSlots } from "./use-booking-data";

type Step = "treatment" | "doctor" | "date" | "time" | "details";

const TITLES: Record<Step, string> = {
  treatment: "What would you like to book?",
  doctor: "Who would you like to see?",
  date: "Pick a date",
  time: "Pick a time",
  details: "Your details",
};

const BOOK_ERRORS: Record<string, string> = {
  daily_limit: "This phone number already has two online bookings today. Please call or WhatsApp the clinic to book more.",
  rate_limited: "Too many attempts from this device. Please wait a few minutes and try again.",
  validation: "Please check your details and try again.",
  not_found: "Online booking isn't available at the moment. Please contact the clinic.",
  outside_window: "That date can no longer be booked online. Please pick another date.",
  treatment_not_offered: "That treatment can no longer be booked online. Please start again.",
  doctor_not_bookable: "That doctor can no longer be booked online. Please start again.",
};

export function BookingFlow({ config }: { config: PublicBookingConfig }) {
  const singleTreatment = config.treatments.length === 1 ? config.treatments[0].value : null;
  const singleDoctor = config.doctors.length === 1 ? config.doctors[0].id : null;
  const steps: Step[] = [
    ...(singleTreatment ? [] : (["treatment"] as Step[])),
    ...(singleDoctor ? [] : (["doctor"] as Step[])),
    "date",
    "time",
    "details",
  ];

  const [step, setStep] = useState<Step>(steps[0]);
  const [treatment, setTreatment] = useState<string | null>(singleTreatment);
  const [doctorId, setDoctorId] = useState<string | null>(singleDoctor);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [details, setDetails] = useState<DetailsValues>(EMPTY_DETAILS);
  const [slotsReload, setSlotsReload] = useState(0);
  const [timeNotice, setTimeNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const slots = useSlots({ slug: config.slug, treatment, doctorId }, step === "time" || step === "details" ? date : null, slotsReload);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  if (config.treatments.length === 0 || config.doctors.length === 0) {
    return (
      <div className="space-y-5">
        <BookingHeader branch={config.branch} />
        <InlineAlert>Online booking isn&apos;t available at the moment. Please contact the clinic to book.</InlineAlert>
      </div>
    );
  }

  const treatmentOption = config.treatments.find((t) => t.value === treatment) ?? null;
  const doctorLabel = doctorId === "any" ? "Any available doctor" : (config.doctors.find((d) => d.id === doctorId)?.name ?? "");
  const index = steps.indexOf(step);
  const goBack = index > 0 ? () => setStep(steps[index - 1]) : undefined;

  function resetFrom(next: Step) {
    if (next === "treatment" || next === "doctor") {
      setDate(null);
      setSlot(null);
    }
    if (next === "date") setSlot(null);
    setTimeNotice(null);
    setStep(next);
  }

  async function book() {
    if (!treatment || !doctorId || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/booking/${config.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatment, doctorId, dateTime: slot.start, ...details }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfirmation(body.booking as PublicBookingConfirmation);
        window.scrollTo({ top: 0 });
        return;
      }
      if (body.error === "slot_taken") {
        setSlot(null);
        setSlotsReload((n) => n + 1);
        setTimeNotice("Sorry — that time was just taken. Please pick another.");
        setStep("time");
        return;
      }
      setSubmitError(BOOK_ERRORS[body.error as string] ?? "Something went wrong. Please try again.");
    } catch {
      setSubmitError("Couldn't reach the clinic. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className="space-y-5">
        <BookingHeader branch={config.branch} />
        <BookingSuccess
          booking={confirmation}
          timeZoneLabel={config.timeZoneLabel}
          onBookAnother={() => {
            setConfirmation(null);
            setDate(null);
            setSlot(null);
            setDetails({ ...EMPTY_DETAILS, name: details.name, phone: details.phone, email: details.email });
            setStep(steps[0]);
          }}
        />
      </div>
    );
  }

  const summary = [
    ...(treatmentOption && !singleTreatment && index > steps.indexOf("treatment")
      ? [{ label: "Treatment", value: `${treatmentOption.label} · ${treatmentOption.durationMin} min`, onChange: () => resetFrom("treatment") }]
      : []),
    ...(doctorId && !singleDoctor && index > steps.indexOf("doctor")
      ? [{ label: "Doctor", value: doctorLabel, onChange: () => resetFrom("doctor") }]
      : []),
    ...(date && index > steps.indexOf("date") ? [{ label: "Date", value: longDateLabel(date), onChange: () => resetFrom("date") }] : []),
    ...(slot && index > steps.indexOf("time")
      ? [{ label: "Time", value: `${slot.label} (${config.timeZoneLabel})`, onChange: () => resetFrom("time") }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <BookingHeader branch={config.branch} />
      {config.note && index === 0 && (
        <p className="rounded-panel border border-border bg-white px-3 py-2.5 text-[14px] whitespace-pre-line text-fg-secondary">
          {config.note}
        </p>
      )}

      <StepCard step={index + 1} total={steps.length} title={TITLES[step]} onBack={goBack} headingRef={headingRef}>
        <ChoiceSummary rows={summary} />

        {step === "treatment" && (
          <div className="space-y-2">
            {config.treatments.map((t) => (
              <OptionButton
                key={t.value}
                selected={treatment === t.value}
                title={t.label}
                subtitle={`${t.durationMin} minutes`}
                onClick={() => {
                  if (treatment !== t.value) {
                    setDate(null);
                    setSlot(null);
                  }
                  setTreatment(t.value);
                  setStep(steps[index + 1]);
                }}
              />
            ))}
          </div>
        )}

        {step === "doctor" && (
          <div className="space-y-2">
            <OptionButton
              selected={doctorId === "any"}
              title="Any available doctor"
              subtitle="Shows the most times"
              leading={
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-fg-secondary">
                  <Users className="h-4 w-4" strokeWidth={1.5} />
                </span>
              }
              onClick={() => {
                if (doctorId !== "any") {
                  setDate(null);
                  setSlot(null);
                }
                setDoctorId("any");
                setStep(steps[index + 1]);
              }}
            />
            {config.doctors.map((d) => (
              <OptionButton
                key={d.id}
                selected={doctorId === d.id}
                title={d.name}
                leading={<Initials name={d.name} />}
                onClick={() => {
                  if (doctorId !== d.id) {
                    setDate(null);
                    setSlot(null);
                  }
                  setDoctorId(d.id);
                  setStep(steps[index + 1]);
                }}
              />
            ))}
          </div>
        )}

        {step === "date" && treatment && doctorId && (
          <DatePickerStep
            slug={config.slug}
            treatment={treatment}
            doctorId={doctorId}
            firstDay={config.firstDay}
            lastDay={config.lastDay}
            selected={date}
            onSelect={(key) => {
              if (key !== date) setSlot(null);
              setDate(key);
              setTimeNotice(null);
              setStep("time");
            }}
          />
        )}

        {step === "time" && (
          <>
            {timeNotice && <InlineAlert>{timeNotice}</InlineAlert>}
            <TimeSlotStep
              slots={slots.data}
              loading={slots.loading}
              error={slots.error}
              selected={slot?.start ?? null}
              timeZoneLabel={config.timeZoneLabel}
              onSelect={(s) => {
                setSlot(s);
                setTimeNotice(null);
                setStep("details");
              }}
            />
          </>
        )}

        {step === "details" && treatment && doctorId && slot && (
          <BookingDetailsForm
            branchName={config.branch.name}
            values={details}
            onChange={setDetails}
            submitting={submitting}
            error={submitError}
            base={{ treatment, doctorId, dateTime: slot.start }}
            onSubmit={book}
          />
        )}
      </StepCard>
    </div>
  );
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";
import { normalizePhoneDigits, displayDoctorName } from "@/lib/format";
import { defaultReminderChannel } from "@/lib/reminder-channel";
import { logAppointmentEvent } from "@/lib/appointment-audit";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import { effectiveTreatments } from "@/lib/booking/config";
import { slotsFor } from "@/lib/booking/slots";
import { splitName, type BookingRequest } from "@/lib/booking/schema";
import { loadBookableDoctors, loadBookingAvailability, type BookingBranch } from "@/lib/booking/availability";
import { notifyOnlineBooking } from "@/lib/booking/notify";

/** Online bookings one phone number may make per clinic day, per branch. */
export const MAX_ONLINE_BOOKINGS_PER_PHONE_PER_DAY = 2;

export type BookingError =
  | "treatment_not_offered"
  | "doctor_not_bookable"
  | "outside_window"
  | "slot_taken"
  | "daily_limit";

export interface BookingResult {
  appointmentId: string;
  dateTime: Date;
  duration: number;
  treatment: string;
  doctorName: string;
  firstName: string;
  isNewPatient: boolean;
}

class BookingFailure extends Error {
  constructor(public code: BookingError) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;

interface PatientMatch {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  icNumber: string | null;
  phone: string | null;
  marketingConsent: boolean;
}

/** Postgres expression equal to `normalizePhoneDigits(phone)`. */
const NORMALIZED_PHONE_SQL = Prisma.sql`(CASE WHEN regexp_replace(phone, '\\D', '', 'g') LIKE '0%'
  THEN '60' || substr(regexp_replace(phone, '\\D', '', 'g'), 2)
  ELSE regexp_replace(phone, '\\D', '', 'g') END)`;

/** Patients of the branch whose phone normalises to `digits`, oldest first. */
export async function findPatientsByPhone(branchId: string, digits: string, db: Tx | typeof prisma = prisma) {
  return db.$queryRaw<PatientMatch[]>`
    SELECT id, "firstName", "lastName", email, "icNumber", phone, "marketingConsent"
    FROM "Patient"
    WHERE "branchId" = ${branchId} AND phone IS NOT NULL AND ${NORMALIZED_PHONE_SQL} = ${digits}
    ORDER BY "createdAt" ASC`;
}

/** Transaction-scoped advisory lock (released on commit / rollback). */
async function lock(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

const nameKey = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Reuse an existing patient only when both phone and name match. A phone
 * number alone isn't proof of identity (family members share one, and anyone
 * can type it), so otherwise the booking gets a new patient for the clinic to
 * merge.
 */
function pickPatient(matches: PatientMatch[], firstName: string, lastName: string): PatientMatch | null {
  const full = nameKey(firstName, lastName);
  return matches.find((m) => nameKey(m.firstName, m.lastName) === full) ?? null;
}

/**
 * Book from the public page. Re-runs the slot engine inside a transaction that
 * holds advisory locks on the phone number and the candidate doctors, so two
 * requests for the same slot can't both succeed.
 */
export async function createOnlineBooking(
  branch: BookingBranch,
  input: BookingRequest,
  now: Date = new Date(),
): Promise<{ ok: true; booking: BookingResult } | { ok: false; error: BookingError }> {
  if (!effectiveTreatments(branch.bookingTreatments).includes(input.treatment)) {
    return { ok: false, error: "treatment_not_offered" };
  }
  const doctors = await loadBookableDoctors(branch);
  const candidates = input.doctorId === "any" ? doctors : doctors.filter((d) => d.id === input.doctorId);
  if (candidates.length === 0) return { ok: false, error: "doctor_not_bookable" };

  const start = new Date(input.dateTime);
  const dateKey = clinicDateKey(start);
  const phoneDigits = normalizePhoneDigits(input.phone);
  const { firstName, lastName } = splitName(input.name);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await lock(tx, `booking-phone:${branch.id}:${phoneDigits}`);
        for (const id of candidates.map((d) => d.id).sort()) await lock(tx, `booking-doctor:${id}`);

        const availability = await loadBookingAvailability({
          branch,
          doctors: candidates,
          fromKey: dateKey,
          toKey: dateKey,
          treatment: input.treatment,
          now,
          db: tx,
        });
        if (dateKey < availability.window.first || dateKey > availability.window.last) {
          throw new BookingFailure("outside_window");
        }
        const slot = slotsFor(availability.doctors, input.doctorId === "any" ? "any" : input.doctorId, dateKey, availability.rules)
          .find((s) => s.start.getTime() === start.getTime());
        if (!slot) throw new BookingFailure("slot_taken");

        const matches = await findPatientsByPhone(branch.id, phoneDigits, tx);
        if (matches.length > 0) {
          const today = clinicDayBounds(clinicDateKey(now));
          const recent = await tx.appointment.count({
            where: {
              branchId: branch.id,
              source: "ONLINE",
              patientId: { in: matches.map((m) => m.id) },
              createdAt: { gte: today.start, lt: today.end },
            },
          });
          if (recent >= MAX_ONLINE_BOOKINGS_PER_PHONE_PER_DAY) throw new BookingFailure("daily_limit");
        }

        // Email and IC are unique across all patients — only store ones nobody else has.
        const [emailOwner, icOwner] = await Promise.all([
          input.email ? tx.patient.findUnique({ where: { email: input.email }, select: { id: true } }) : null,
          input.icNumber ? tx.patient.findUnique({ where: { icNumber: input.icNumber }, select: { id: true } }) : null,
        ]);
        const extraNotes: string[] = [];

        let patient = pickPatient(matches, firstName, lastName);
        const isNewPatient = !patient;
        if (patient) {
          // Never change an existing patient's email or IC from the public
          // page: the email is their portal sign-in. Staff see it in the notes.
          const fill: Prisma.PatientUpdateInput = {};
          if (input.email && input.email.toLowerCase() !== patient.email?.toLowerCase()) extraNotes.push(`Email given: ${input.email}`);
          if (input.icNumber && input.icNumber !== patient.icNumber) extraNotes.push(`IC given: ${input.icNumber}`);
          // Opting in online grants consent; leaving the box unticked never
          // withdraws consent given at the clinic.
          if (input.consentMarketing === true && !patient.marketingConsent) {
            fill.marketingConsent = true;
            fill.marketingConsentAt = new Date();
          }
          if (Object.keys(fill).length > 0) await tx.patient.update({ where: { id: patient.id }, data: fill });
        } else {
          const email = input.email && !emailOwner ? input.email : null;
          const icNumber = input.icNumber && !icOwner ? input.icNumber : null;
          if (input.email && !email) extraNotes.push(`Email given: ${input.email}`);
          if (input.icNumber && !icNumber) extraNotes.push(`IC given: ${input.icNumber}`);
          const consent = input.consentMarketing === true;
          patient = await tx.patient.create({
            data: {
              firstName,
              lastName,
              phone: input.phone,
              email,
              icNumber,
              // "active" like any registered patient — the rest of the app
              // (filters, counts, recall) only knows active/inactive/discharged.
              status: "active",
              referralSource: "Online booking",
              marketingConsent: consent,
              marketingConsentAt: consent ? new Date() : null,
              reminderChannel: defaultReminderChannel({ phone: input.phone, email }),
              branchId: branch.id,
              doctorId: slot.doctorId,
            },
            select: { id: true, firstName: true, lastName: true, email: true, icNumber: true, phone: true, marketingConsent: true },
          });
        }

        const notes = [input.notes, ...extraNotes].filter(Boolean).join("\n") || null;
        const appointment = await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: slot.doctorId,
            branchId: branch.id,
            dateTime: slot.start,
            duration: availability.rules.durationMin,
            status: "SCHEDULED",
            treatmentType: input.treatment,
            notes,
            source: "ONLINE",
          },
          select: { id: true, dateTime: true, duration: true, doctorId: true },
        });

        const patientName = `${patient.firstName} ${patient.lastName}`.trim();
        await logAppointmentEvent({
          client: tx,
          appointmentId: appointment.id,
          action: "CREATE",
          actor: { id: null, email: "online-booking", name: "Online booking" },
          snapshot: { patientName, dateTime: appointment.dateTime },
          changes: {
            dateTime: { from: null, to: appointment.dateTime.toISOString() },
            doctorId: { from: null, to: appointment.doctorId },
            duration: { from: null, to: appointment.duration },
            status: { from: null, to: "SCHEDULED" },
            treatmentType: { from: null, to: input.treatment },
            source: { from: null, to: "ONLINE" },
            consentData: { from: null, to: true },
            consentMarketing: { from: null, to: input.consentMarketing === true },
            newPatient: { from: null, to: isNewPatient },
          },
        });

        return { appointment, patientName, isNewPatient };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );

    const doctor = doctors.find((d) => d.id === result.appointment.doctorId)!;
    const doctorUser = await prisma.user.findUnique({
      where: { id: doctor.id },
      select: { id: true, name: true, email: true },
    });
    void notifyOnlineBooking({
      appointmentId: result.appointment.id,
      branchId: branch.id,
      branchName: branch.name,
      doctor: { id: doctor.id, name: doctorUser?.name ?? null, email: doctorUser?.email ?? null },
      patientName: result.patientName,
      patientPhone: input.phone,
      dateTime: result.appointment.dateTime,
      duration: result.appointment.duration,
      treatmentLabel: treatmentLabelFor(input.treatment),
      isNewPatient: result.isNewPatient,
    }).catch((e) => console.error("online booking notification failed", e));

    return {
      ok: true,
      booking: {
        appointmentId: result.appointment.id,
        dateTime: result.appointment.dateTime,
        duration: result.appointment.duration,
        treatment: treatmentLabelFor(input.treatment),
        doctorName: displayDoctorName(doctorUser?.name, doctor.name),
        firstName,
        isNewPatient: result.isNewPatient,
      },
    };
  } catch (e) {
    if (e instanceof BookingFailure) return { ok: false, error: e.code };
    throw e;
  }
}

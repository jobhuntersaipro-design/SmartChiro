import type {
  ReminderChannel,
  ReminderStatus,
  WaSessionStatus,
} from "@prisma/client";

export type { ReminderChannel, ReminderStatus, WaSessionStatus };

/** The shape of `BranchReminderSettings.templates` (Json column). */
export type Templates = {
  whatsapp: { en: string; ms: string };
  email: { en: string; ms: string; htmlEn: string; htmlMs: string };
};

/** Allowed offsets in minutes (minutes before appointment.dateTime). */
export const ALLOWED_OFFSETS_MIN = [10080, 2880, 1440, 240, 120, 30] as const;
export type AllowedOffset = (typeof ALLOWED_OFFSETS_MIN)[number];

/** Inputs for rendering a template. */
export type TemplateContext = {
  patientName: string;
  firstName: string;
  lastName: string;
  date: string;
  time: string;
  dayOfWeek: string;
  doctorName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

/** Result of a worker /send call. */
export type WorkerSendResult =
  | { ok: true; msgId: string }
  | { ok: false; code: WorkerErrorCode; message: string };

export type WorkerErrorCode =
  | "not_on_whatsapp"
  | "invalid_e164"
  | "session_disconnected"
  | "session_logged_out"
  | "rate_limited"
  | "unknown";

/** Webhook events posted by the worker back to the app. */
export type WaSessionEvent =
  | { type: "qr"; branchId: string; qrPayload: string }
  | { type: "connected"; branchId: string; phoneNumber: string }
  | { type: "disconnected"; branchId: string; reason: string }
  | { type: "logged_out"; branchId: string; reason: string }
  | {
      type: "ack";
      branchId: string;
      msgId: string;
      ack: "sent" | "delivered" | "read" | "failed";
    };

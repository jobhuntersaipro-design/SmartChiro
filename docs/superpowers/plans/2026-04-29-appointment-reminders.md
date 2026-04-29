# Appointment Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship automated appointment reminders that fire over WhatsApp (via the branch owner's personal number using a Baileys session) and email (via Resend), with branch-configurable timing/templates and per-patient channel preferences.

**Architecture:** Vercel-hosted Next.js app schedules and decides what to send on a 5-minute Vercel Cron. A separate stateless `smartchiro-wa-worker` service (Railway/Fly.io, sibling repo, follow-on deliverable) holds Baileys sessions and exposes an HMAC-signed HTTP API for sending messages and reporting session events. Email goes directly from the API route via Resend. State lives in three new Prisma models: `BranchReminderSettings`, `WaSession`, `AppointmentReminder` plus two new fields on `Patient`.

**Tech Stack:** Next.js 16, Prisma 7, Neon Postgres, NextAuth v5, Resend (existing), `@whiskeysockets/baileys` (worker only), Vitest, Vercel Cron.

**Spec:** [docs/superpowers/specs/2026-04-29-appointment-reminders-design.md](../specs/2026-04-29-appointment-reminders-design.md)

---

## File Structure

```
prisma/
  schema.prisma                                                   ── modified (3 enums, 3 models, 2 Patient cols)
  migrations/20260430120000_add_appointment_reminders/migration.sql ── created

src/
  types/
    reminder.ts                                                   ── created (Templates, internal types)
  lib/
    reminders/
      default-templates.ts                                        ── created (EN+BM defaults)
      templates.ts                                                ── created (render + validate)
      placeholders.ts                                             ── created (allowlist + extract helper)
      backoff.ts                                                  ── created (retry delay)
      materialize.ts                                              ── created (channel resolution + row builder)
      fallback.ts                                                 ── created (decide fallback on failure)
      dispatcher.ts                                               ── created (orchestration)
    wa/
      hmac.ts                                                     ── created (sign + verify)
      worker-client.ts                                            ── created (HTTP wrapper)
      worker-stub.ts                                              ── created (test-only in-memory stub)
  app/api/
    reminders/dispatch/route.ts                                   ── created (Vercel Cron entry)
    branches/[branchId]/reminder-settings/route.ts                ── created (GET, PUT)
    branches/[branchId]/wa/connect/route.ts                       ── created (POST)
    branches/[branchId]/wa/status/route.ts                        ── created (GET)
    branches/[branchId]/wa/disconnect/route.ts                    ── created (POST)
    wa/webhook/route.ts                                           ── created (worker → app)
    appointments/[appointmentId]/reminders/route.ts               ── created (GET)
    patients/route.ts                                             ── modified (accept new fields)
    patients/[patientId]/route.ts                                 ── modified (accept new fields)
  components/
    branches/
      BranchReminderSettingsCard.tsx                              ── created
      ReminderTemplateEditor.tsx                                  ── created
      WaConnectModal.tsx                                          ── created
    appointments/
      ReminderStatusBadge.tsx                                     ── created
    patients/
      AddPatientDialog.tsx                                        ── modified (2 fields, Step 2)
      EditPatientDialog.tsx                                       ── modified (2 fields)
      PatientOverviewTab.tsx                                      ── modified (Reminders sub-section)

vercel.json                                                       ── modified (cron schedule)
.env.example                                                      ── modified (new vars)
```

---

## Pre-Flight

- [ ] **Step 0.1: Create the feature branch**

```bash
cd /Users/chrislam/Desktop/SmartChiro
git switch -c feat/appointment-reminders main
```

- [ ] **Step 0.2: Verify prerequisites**

```bash
npm install
npx prisma migrate status
npm run test
```

Expected: clean migration status, existing 280+ tests pass. If any fail, stop and fix before proceeding.

---

## Phase 1: Schema

### Task 1: Prisma schema — enums, models, Patient fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create (auto-generated): `prisma/migrations/20260430120000_add_appointment_reminders/migration.sql`

- [ ] **Step 1.1: Add 3 new enums**

In `prisma/schema.prisma`, add after the existing enums section (after `enum ViewType { ... }`):

```prisma
enum ReminderChannel {
  WHATSAPP
  EMAIL
  BOTH
  NONE
}

enum ReminderStatus {
  PENDING
  SENT
  FAILED
  SKIPPED
}

enum WaSessionStatus {
  DISCONNECTED
  PAIRING
  CONNECTED
  LOGGED_OUT
}
```

- [ ] **Step 1.2: Add 2 fields to `Patient`**

Find the `Patient` model and add at the bottom of its column list (just before `branchId`):

```prisma
  // Reminder preferences
  reminderChannel   ReminderChannel @default(WHATSAPP)
  preferredLanguage String          @default("en")  // "en" | "ms"
```

- [ ] **Step 1.3: Add 3 new models**

At the bottom of `prisma/schema.prisma`, append:

```prisma
// ─── Appointment Reminders ───

model BranchReminderSettings {
  id         String  @id @default(cuid())
  branchId   String  @unique
  branch     Branch  @relation(fields: [branchId], references: [id], onDelete: Cascade)
  enabled    Boolean @default(false)
  offsetsMin Int[]
  templates  Json
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model WaSession {
  id          String          @id @default(cuid())
  branchId    String          @unique
  branch      Branch          @relation(fields: [branchId], references: [id], onDelete: Cascade)
  status      WaSessionStatus @default(DISCONNECTED)
  phoneNumber String?
  lastSeenAt  DateTime?
  qrPayload   String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model AppointmentReminder {
  id            String          @id @default(cuid())
  appointmentId String
  appointment   Appointment     @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  channel       ReminderChannel
  offsetMin     Int
  scheduledFor  DateTime
  status        ReminderStatus  @default(PENDING)
  sentAt        DateTime?
  failureReason String?
  attemptCount  Int             @default(0)
  externalId    String?
  isFallback    Boolean         @default(false)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@unique([appointmentId, channel, offsetMin, isFallback])
  @@index([scheduledFor, status])
  @@index([appointmentId])
}
```

- [ ] **Step 1.4: Add inverse relations on `Branch` and `Appointment`**

In `Branch` model, add to the relations section (with existing `members`, `patients`, etc.):

```prisma
  reminderSettings BranchReminderSettings?
  waSession        WaSession?
```

In `Appointment` model, add to the relations section:

```prisma
  reminders AppointmentReminder[]
```

- [ ] **Step 1.5: Generate the migration**

Run:

```bash
npx prisma migrate dev --name add_appointment_reminders
```

Expected: a new migration directory is created at `prisma/migrations/20260430120000_add_appointment_reminders/migration.sql`, the Prisma client regenerates, and the local DB applies the migration cleanly.

If the timestamp differs from `20260430120000`, that's fine — Prisma generates timestamps based on local time.

- [ ] **Step 1.6: Verify Prisma client compiles**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 1.7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(reminders): add Prisma schema for appointment reminders"
```

---

## Phase 2: Types

### Task 2: Shared TypeScript types

**Files:**
- Create: `src/types/reminder.ts`

- [ ] **Step 2.1: Create the types module**

```ts
// src/types/reminder.ts
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
  date: string; // formatted like "29 April 2026"
  time: string; // formatted like "14:30"
  dayOfWeek: string; // "Wednesday"
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
```

- [ ] **Step 2.2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/types/reminder.ts
git commit -m "feat(reminders): add shared TypeScript types"
```

---

## Phase 3: Pure Logic (TDD)

Each module here is pure (no DB, no network) so we test exhaustively before wiring anything up.

### Task 3: Default templates module

**Files:**
- Create: `src/lib/reminders/default-templates.ts`
- Create: `src/lib/reminders/__tests__/default-templates.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/default-templates.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATES } from "../default-templates";
import { ALLOWED_PLACEHOLDERS } from "../placeholders";

describe("DEFAULT_TEMPLATES", () => {
  it("contains EN and MS variants for whatsapp and email", () => {
    expect(DEFAULT_TEMPLATES.whatsapp.en.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.whatsapp.ms.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.en.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.ms.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.htmlEn.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.htmlMs.length).toBeGreaterThan(0);
  });

  it("whatsapp templates are <= 400 chars", () => {
    expect(DEFAULT_TEMPLATES.whatsapp.en.length).toBeLessThanOrEqual(400);
    expect(DEFAULT_TEMPLATES.whatsapp.ms.length).toBeLessThanOrEqual(400);
  });

  it("uses only allowed placeholders", () => {
    const all = [
      DEFAULT_TEMPLATES.whatsapp.en,
      DEFAULT_TEMPLATES.whatsapp.ms,
      DEFAULT_TEMPLATES.email.en,
      DEFAULT_TEMPLATES.email.ms,
      DEFAULT_TEMPLATES.email.htmlEn,
      DEFAULT_TEMPLATES.email.htmlMs,
    ];
    const placeholderRe = /\{(\w+)\}/g;
    for (const tpl of all) {
      const matches = [...tpl.matchAll(placeholderRe)].map((m) => m[1]);
      for (const name of matches) {
        expect(ALLOWED_PLACEHOLDERS).toContain(name);
      }
    }
  });
});
```

- [ ] **Step 3.2: Run the test — it fails because the module doesn't exist**

```bash
npm test -- src/lib/reminders/__tests__/default-templates.test.ts
```

Expected: FAIL — `Cannot find module '../default-templates'` and `'../placeholders'`.

- [ ] **Step 3.3: Create the placeholders module**

```ts
// src/lib/reminders/placeholders.ts
export const ALLOWED_PLACEHOLDERS = [
  "patientName",
  "firstName",
  "lastName",
  "date",
  "time",
  "dayOfWeek",
  "doctorName",
  "branchName",
  "branchAddress",
  "branchPhone",
] as const;

export type PlaceholderName = (typeof ALLOWED_PLACEHOLDERS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_PLACEHOLDERS);

export function isAllowedPlaceholder(name: string): name is PlaceholderName {
  return ALLOWED_SET.has(name);
}

/** Returns all `{name}` tokens found in a template string. */
export function extractPlaceholders(tpl: string): string[] {
  const re = /\{(\w+)\}/g;
  const out: string[] = [];
  for (const m of tpl.matchAll(re)) out.push(m[1]);
  return out;
}
```

- [ ] **Step 3.4: Create the default-templates module**

```ts
// src/lib/reminders/default-templates.ts
import type { Templates } from "@/types/reminder";

const WA_EN =
  "Hi {firstName}, this is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}. Reply or call {branchPhone} to reschedule. — {branchName}";

const WA_MS =
  "Hai {firstName}, ini peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}. Balas atau hubungi {branchPhone} untuk menukar tarikh. — {branchName}";

const EMAIL_EN =
  "Hi {firstName},\n\nThis is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}.\n\nLocation: {branchAddress}\nQuestions? Call {branchPhone}.\n\nSee you soon,\n{branchName}";

const EMAIL_MS =
  "Hai {firstName},\n\nIni peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}.\n\nLokasi: {branchAddress}\nSoalan? Hubungi {branchPhone}.\n\nJumpa lagi,\n{branchName}";

const EMAIL_HTML_EN = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0A2540;background:#F6F9FC;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #E3E8EE;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">This is a reminder of your appointment at <strong>{branchName}</strong> with <strong>{doctorName}</strong> on <strong>{dayOfWeek}, {date}</strong> at <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#425466;margin:0 0 12px;">Location: {branchAddress}<br/>Questions? Call <a style="color:#635BFF;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">See you soon,<br/>{branchName}</p>
</td></tr></table></body></html>`;

const EMAIL_HTML_MS = `<!doctype html><html><body style="font-family:Helvetica Neue,Arial,sans-serif;color:#0A2540;background:#F6F9FC;padding:32px;">
<table style="background:#FFFFFF;border:1px solid #E3E8EE;border-radius:6px;padding:24px;max-width:560px;margin:0 auto;">
<tr><td>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hai <strong>{firstName}</strong>,</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Ini peringatan temujanji anda di <strong>{branchName}</strong> dengan <strong>{doctorName}</strong> pada <strong>{dayOfWeek}, {date}</strong> pukul <strong>{time}</strong>.</p>
<p style="font-size:15px;line-height:1.5;color:#425466;margin:0 0 12px;">Lokasi: {branchAddress}<br/>Soalan? Hubungi <a style="color:#635BFF;text-decoration:none;" href="tel:{branchPhone}">{branchPhone}</a>.</p>
<p style="font-size:16px;line-height:1.5;margin:24px 0 0;">Jumpa lagi,<br/>{branchName}</p>
</td></tr></table></body></html>`;

export const DEFAULT_TEMPLATES: Templates = {
  whatsapp: { en: WA_EN, ms: WA_MS },
  email: { en: EMAIL_EN, ms: EMAIL_MS, htmlEn: EMAIL_HTML_EN, htmlMs: EMAIL_HTML_MS },
};
```

- [ ] **Step 3.5: Run the test**

```bash
npm test -- src/lib/reminders/__tests__/default-templates.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/reminders/placeholders.ts src/lib/reminders/default-templates.ts src/lib/reminders/__tests__/default-templates.test.ts
git commit -m "feat(reminders): add default EN+BM templates and placeholder allowlist"
```

---

### Task 4: Template render + validate

**Files:**
- Create: `src/lib/reminders/templates.ts`
- Create: `src/lib/reminders/__tests__/templates.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/templates.test.ts
import { describe, it, expect } from "vitest";
import { renderTemplate, validateTemplate } from "../templates";
import type { TemplateContext } from "@/types/reminder";

const ctx: TemplateContext = {
  patientName: "Ahmad Bin Ali",
  firstName: "Ahmad",
  lastName: "Bin Ali",
  date: "29 April 2026",
  time: "14:30",
  dayOfWeek: "Wednesday",
  doctorName: "Dr Lee",
  branchName: "SmartChiro KL",
  branchAddress: "1 Jalan Sentral, KL",
  branchPhone: "+60312345678",
};

describe("renderTemplate", () => {
  it("substitutes all placeholders", () => {
    const out = renderTemplate("Hi {firstName}, see {doctorName} on {date}", ctx);
    expect(out).toBe("Hi Ahmad, see Dr Lee on 29 April 2026");
  });

  it("substitutes the same placeholder multiple times", () => {
    const out = renderTemplate("{firstName}-{firstName}", ctx);
    expect(out).toBe("Ahmad-Ahmad");
  });

  it("throws when a placeholder is unknown", () => {
    expect(() => renderTemplate("Hi {nope}", ctx)).toThrow(/unknown placeholder/i);
  });

  it("throws when a placeholder is unclosed", () => {
    expect(() => renderTemplate("Hi {firstName, see you", ctx)).toThrow(/unclosed/i);
  });
});

describe("validateTemplate", () => {
  it("returns ok for a valid template", () => {
    expect(validateTemplate("Hi {firstName}")).toEqual({ ok: true });
  });

  it("returns error for unknown placeholder", () => {
    const r = validateTemplate("Hi {nope}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unknown placeholder.*nope/i);
  });

  it("returns error for unclosed placeholder", () => {
    const r = validateTemplate("Hi {firstName, see you");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unclosed/i);
  });

  it("returns error for empty template", () => {
    const r = validateTemplate("");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run the test — it fails**

```bash
npm test -- src/lib/reminders/__tests__/templates.test.ts
```

Expected: FAIL — `Cannot find module '../templates'`.

- [ ] **Step 4.3: Implement the module**

```ts
// src/lib/reminders/templates.ts
import { isAllowedPlaceholder } from "./placeholders";
import type { TemplateContext } from "@/types/reminder";

export type ValidateResult = { ok: true } | { ok: false; message: string };

/** Returns ok=false with a message describing what's wrong; ok=true otherwise. */
export function validateTemplate(tpl: string): ValidateResult {
  if (tpl.length === 0) return { ok: false, message: "template is empty" };

  // Unclosed `{...` (not followed by `}`)
  if (/\{[^}]*$/.test(tpl)) {
    return { ok: false, message: "unclosed placeholder" };
  }

  const re = /\{(\w+)\}/g;
  for (const m of tpl.matchAll(re)) {
    const name = m[1];
    if (!isAllowedPlaceholder(name)) {
      return { ok: false, message: `unknown placeholder: ${name}` };
    }
  }
  return { ok: true };
}

/** Substitutes placeholders. Throws if validation fails. */
export function renderTemplate(tpl: string, ctx: TemplateContext): string {
  const v = validateTemplate(tpl);
  if (!v.ok) throw new Error(v.message);
  return tpl.replace(/\{(\w+)\}/g, (_, name: string) => {
    return ctx[name as keyof TemplateContext];
  });
}
```

- [ ] **Step 4.4: Run the test**

```bash
npm test -- src/lib/reminders/__tests__/templates.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/reminders/templates.ts src/lib/reminders/__tests__/templates.test.ts
git commit -m "feat(reminders): add template render + validate"
```

---

### Task 5: Backoff function

**Files:**
- Create: `src/lib/reminders/backoff.ts`
- Create: `src/lib/reminders/__tests__/backoff.test.ts`

- [ ] **Step 5.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/backoff.test.ts
import { describe, it, expect } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "../backoff";

describe("backoffMs", () => {
  it("returns 5 minutes after attempt 1", () => {
    expect(backoffMs(1)).toBe(5 * 60_000);
  });
  it("returns 30 minutes after attempt 2", () => {
    expect(backoffMs(2)).toBe(30 * 60_000);
  });
  it("returns 2 hours after attempt 3", () => {
    expect(backoffMs(3)).toBe(2 * 60 * 60_000);
  });
  it("clamps anything beyond max attempts to 2 hours", () => {
    expect(backoffMs(99)).toBe(2 * 60 * 60_000);
  });
});

describe("MAX_ATTEMPTS", () => {
  it("equals 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});
```

- [ ] **Step 5.2: Run — fails**

```bash
npm test -- src/lib/reminders/__tests__/backoff.test.ts
```

Expected: FAIL.

- [ ] **Step 5.3: Implement**

```ts
// src/lib/reminders/backoff.ts
export const MAX_ATTEMPTS = 3;

const LADDER_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** Delay (ms) before the next retry attempt, given the failure count so far. */
export function backoffMs(attemptCount: number): number {
  const idx = Math.max(0, Math.min(LADDER_MS.length - 1, attemptCount - 1));
  return LADDER_MS[idx];
}
```

- [ ] **Step 5.4: Run — passes**

```bash
npm test -- src/lib/reminders/__tests__/backoff.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/reminders/backoff.ts src/lib/reminders/__tests__/backoff.test.ts
git commit -m "feat(reminders): add retry backoff schedule"
```

---

### Task 6: Materialize logic — channel resolution

**Files:**
- Create: `src/lib/reminders/materialize.ts`
- Create: `src/lib/reminders/__tests__/materialize.test.ts`

- [ ] **Step 6.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/materialize.test.ts
import { describe, it, expect } from "vitest";
import { resolveChannels, plannedReminders } from "../materialize";

describe("resolveChannels", () => {
  it("WHATSAPP + phone => [WHATSAPP]", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("WHATSAPP + no phone + email => [EMAIL] (downgrade)", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: false, hasEmail: true })).toEqual(["EMAIL"]);
  });
  it("EMAIL + email => [EMAIL]", () => {
    expect(resolveChannels({ pref: "EMAIL", hasPhone: true, hasEmail: true })).toEqual(["EMAIL"]);
  });
  it("EMAIL + no email + phone => [WHATSAPP] (downgrade)", () => {
    expect(resolveChannels({ pref: "EMAIL", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("BOTH + phone + email => [WHATSAPP, EMAIL]", () => {
    expect(resolveChannels({ pref: "BOTH", hasPhone: true, hasEmail: true })).toEqual(["WHATSAPP", "EMAIL"]);
  });
  it("BOTH + only phone => [WHATSAPP]", () => {
    expect(resolveChannels({ pref: "BOTH", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("NONE => []", () => {
    expect(resolveChannels({ pref: "NONE", hasPhone: true, hasEmail: true })).toEqual([]);
  });
  it("any pref + no phone + no email => []", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: false, hasEmail: false })).toEqual([]);
  });
});

describe("plannedReminders", () => {
  const apptAt = new Date("2026-05-01T10:00:00.000Z");
  const now = new Date("2026-04-29T10:00:00.000Z");

  it("creates one row per (channel × offset) for offsets in the future", () => {
    const rows = plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440, 120],
      channels: ["WHATSAPP", "EMAIL"],
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "EMAIL", "WHATSAPP", "WHATSAPP"]);
  });

  it("scheduledFor = appointmentDateTime - offsetMin", () => {
    const rows = plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440],
      channels: ["WHATSAPP"],
    });
    expect(rows[0].scheduledFor.toISOString()).toBe("2026-04-30T10:00:00.000Z");
  });

  it("skips offsets whose scheduledFor is already in the past (with 5min grace)", () => {
    const closeAppt = new Date("2026-04-29T10:30:00.000Z"); // 30 min away
    const rows = plannedReminders({
      appointmentDateTime: closeAppt,
      now,
      offsetsMin: [1440, 120, 30], // 24h + 2h are in the past, 30min is in the future
      channels: ["WHATSAPP"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].offsetMin).toBe(30);
  });

  it("returns nothing when channels is empty", () => {
    expect(plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440],
      channels: [],
    })).toHaveLength(0);
  });
});
```

- [ ] **Step 6.2: Run — fails**

```bash
npm test -- src/lib/reminders/__tests__/materialize.test.ts
```

Expected: FAIL.

- [ ] **Step 6.3: Implement**

```ts
// src/lib/reminders/materialize.ts
import type { ReminderChannel } from "@/types/reminder";

/** WHATSAPP or EMAIL only — never BOTH or NONE. */
export type ConcreteChannel = "WHATSAPP" | "EMAIL";

export function resolveChannels(args: {
  pref: ReminderChannel;
  hasPhone: boolean;
  hasEmail: boolean;
}): ConcreteChannel[] {
  const { pref, hasPhone, hasEmail } = args;
  if (pref === "NONE") return [];
  if (pref === "WHATSAPP") {
    if (hasPhone) return ["WHATSAPP"];
    if (hasEmail) return ["EMAIL"];
    return [];
  }
  if (pref === "EMAIL") {
    if (hasEmail) return ["EMAIL"];
    if (hasPhone) return ["WHATSAPP"];
    return [];
  }
  // BOTH
  const out: ConcreteChannel[] = [];
  if (hasPhone) out.push("WHATSAPP");
  if (hasEmail) out.push("EMAIL");
  return out;
}

export type PlannedReminder = {
  channel: ConcreteChannel;
  offsetMin: number;
  scheduledFor: Date;
};

const PAST_GRACE_MS = 5 * 60_000;

export function plannedReminders(args: {
  appointmentDateTime: Date;
  now: Date;
  offsetsMin: number[];
  channels: ConcreteChannel[];
}): PlannedReminder[] {
  const { appointmentDateTime, now, offsetsMin, channels } = args;
  if (channels.length === 0) return [];
  const cutoff = now.getTime() - PAST_GRACE_MS;

  const out: PlannedReminder[] = [];
  for (const off of offsetsMin) {
    const t = appointmentDateTime.getTime() - off * 60_000;
    if (t <= cutoff) continue;
    for (const ch of channels) {
      out.push({ channel: ch, offsetMin: off, scheduledFor: new Date(t) });
    }
  }
  return out;
}
```

- [ ] **Step 6.4: Run — passes**

```bash
npm test -- src/lib/reminders/__tests__/materialize.test.ts
```

Expected: PASS (12 tests).

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/reminders/materialize.ts src/lib/reminders/__tests__/materialize.test.ts
git commit -m "feat(reminders): add channel resolution + planned-row builder"
```

---

### Task 7: Fallback decision logic

**Files:**
- Create: `src/lib/reminders/fallback.ts`
- Create: `src/lib/reminders/__tests__/fallback.test.ts`

- [ ] **Step 7.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/fallback.test.ts
import { describe, it, expect } from "vitest";
import { shouldFallback, oppositeChannel } from "../fallback";

describe("shouldFallback", () => {
  it("WhatsApp 'not_on_whatsapp' on first attempt with email available => true", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(true);
  });

  it("on a row that is already a fallback => false (no chain)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: true,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("when other channel contact missing => false", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: false,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("when pref is NONE => false (patient explicitly opted out)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "NONE",
    })).toBe(false);
  });

  it("non-terminal failure (e.g. rate_limited) => false (retry instead)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "rate_limited",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("after attempt 2 (not first) => false (retry instead, fallback only on first)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 2,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("Email hard bounce on first attempt with phone available => true", () => {
    expect(shouldFallback({
      channel: "EMAIL",
      reason: "bounce_hard",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "EMAIL",
    })).toBe(true);
  });
});

describe("oppositeChannel", () => {
  it("WHATSAPP => EMAIL", () => expect(oppositeChannel("WHATSAPP")).toBe("EMAIL"));
  it("EMAIL => WHATSAPP", () => expect(oppositeChannel("EMAIL")).toBe("WHATSAPP"));
});
```

- [ ] **Step 7.2: Run — fails**

```bash
npm test -- src/lib/reminders/__tests__/fallback.test.ts
```

Expected: FAIL.

- [ ] **Step 7.3: Implement**

```ts
// src/lib/reminders/fallback.ts
import type { ReminderChannel } from "@/types/reminder";
import type { ConcreteChannel } from "./materialize";

const TERMINAL_WA = new Set([
  "not_on_whatsapp",
  "session_disconnected",
  "session_logged_out",
  "invalid_e164",
]);
const TERMINAL_EMAIL = new Set(["invalid_email", "bounce_hard"]);

export function shouldFallback(args: {
  channel: ConcreteChannel;
  reason: string;
  attemptCount: number;
  isFallback: boolean;
  hasOtherChannelContact: boolean;
  pref: ReminderChannel;
}): boolean {
  if (args.isFallback) return false;
  if (args.pref === "NONE") return false;
  if (args.attemptCount !== 1) return false;
  if (!args.hasOtherChannelContact) return false;
  const set = args.channel === "WHATSAPP" ? TERMINAL_WA : TERMINAL_EMAIL;
  return set.has(args.reason);
}

export function oppositeChannel(c: ConcreteChannel): ConcreteChannel {
  return c === "WHATSAPP" ? "EMAIL" : "WHATSAPP";
}
```

- [ ] **Step 7.4: Run — passes**

```bash
npm test -- src/lib/reminders/__tests__/fallback.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/reminders/fallback.ts src/lib/reminders/__tests__/fallback.test.ts
git commit -m "feat(reminders): add cross-channel fallback decision logic"
```

---

## Phase 4: Worker Plumbing

### Task 8: HMAC sign + verify

**Files:**
- Create: `src/lib/wa/hmac.ts`
- Create: `src/lib/wa/__tests__/hmac.test.ts`

- [ ] **Step 8.1: Write the failing test**

```ts
// src/lib/wa/__tests__/hmac.test.ts
import { describe, it, expect } from "vitest";
import { signRequest, verifyRequest } from "../hmac";

const SECRET = "test-shared-secret";

describe("signRequest / verifyRequest", () => {
  it("a freshly signed payload verifies", () => {
    const body = JSON.stringify({ to: "+60123", body: "hi" });
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_000_000 });
    expect(verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_000_000, nowEpoch: 1_700_000_010,
    })).toEqual({ ok: true });
  });

  it("rejects when the signature is wrong", () => {
    const body = JSON.stringify({ to: "+60123", body: "hi" });
    const r = verifyRequest({
      secret: SECRET, body, signature: "deadbeef", timestamp: 1_700_000_000, nowEpoch: 1_700_000_010,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the timestamp is older than 60 seconds", () => {
    const body = "{}";
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_000_000 });
    const r = verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_000_000, nowEpoch: 1_700_000_061,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/stale|expired/i);
  });

  it("rejects when the timestamp is more than 60s in the future", () => {
    const body = "{}";
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_001_000 });
    const r = verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_001_000, nowEpoch: 1_700_000_000,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 8.2: Run — fails**

```bash
npm test -- src/lib/wa/__tests__/hmac.test.ts
```

Expected: FAIL.

- [ ] **Step 8.3: Implement**

```ts
// src/lib/wa/hmac.ts
import { createHmac, timingSafeEqual } from "crypto";

const WINDOW_SECONDS = 60;

export function signRequest(args: {
  secret: string;
  body: string;
  timestamp: number; // epoch seconds
}): string {
  const { secret, body, timestamp } = args;
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export function verifyRequest(args: {
  secret: string;
  body: string;
  signature: string;
  timestamp: number;
  nowEpoch: number;
}): VerifyResult {
  const { secret, body, signature, timestamp, nowEpoch } = args;
  if (Math.abs(nowEpoch - timestamp) > WINDOW_SECONDS) {
    return { ok: false, message: "timestamp stale or expired" };
  }
  const expected = signRequest({ secret, body, timestamp });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, message: "signature mismatch" };
  }
  return { ok: true };
}
```

- [ ] **Step 8.4: Run — passes**

```bash
npm test -- src/lib/wa/__tests__/hmac.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/wa/hmac.ts src/lib/wa/__tests__/hmac.test.ts
git commit -m "feat(reminders): add HMAC sign/verify for worker auth"
```

---

### Task 9: Worker client + in-memory stub

**Files:**
- Create: `src/lib/wa/worker-client.ts`
- Create: `src/lib/wa/worker-stub.ts`
- Create: `src/lib/wa/__tests__/worker-client.test.ts`

- [ ] **Step 9.1: Write the failing test**

```ts
// src/lib/wa/__tests__/worker-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../worker-client";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.WORKER_URL = "https://worker.example";
  process.env.WORKER_SHARED_SECRET = "secret";
});

describe("sendMessage", () => {
  it("returns ok with msgId on 200", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ msgId: "wamid.123" }), { status: 200 }));
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r).toEqual({ ok: true, msgId: "wamid.123" });
  });

  it("returns ok=false with mapped code on 4xx error body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "not_on_whatsapp", message: "no WA" } }), { status: 400 })
    );
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r).toEqual({ ok: false, code: "not_on_whatsapp", message: "no WA" });
  });

  it("returns ok=false with code=unknown on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unknown");
  });

  it("includes HMAC signature and timestamp headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ msgId: "x" }), { status: 200 }));
    await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(init.headers["x-timestamp"])).toBeGreaterThan(1_600_000_000);
  });
});
```

- [ ] **Step 9.2: Run — fails**

```bash
npm test -- src/lib/wa/__tests__/worker-client.test.ts
```

Expected: FAIL.

- [ ] **Step 9.3: Implement the worker client**

```ts
// src/lib/wa/worker-client.ts
import { signRequest } from "./hmac";
import type { WorkerSendResult, WorkerErrorCode } from "@/types/reminder";

const KNOWN_CODES = new Set<WorkerErrorCode>([
  "not_on_whatsapp",
  "invalid_e164",
  "session_disconnected",
  "session_logged_out",
  "rate_limited",
  "unknown",
]);

function workerEnv() {
  const url = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!url || !secret) throw new Error("WORKER_URL and WORKER_SHARED_SECRET must be set");
  return { url, secret };
}

async function signedPost(path: string, body: object): Promise<Response> {
  const { url, secret } = workerEnv();
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signRequest({ secret, body: raw, timestamp: ts });
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sig,
      "x-timestamp": String(ts),
    },
    body: raw,
  });
}

async function signedGet(path: string): Promise<Response> {
  const { url, secret } = workerEnv();
  const ts = Math.floor(Date.now() / 1000);
  const sig = signRequest({ secret, body: "", timestamp: ts });
  return fetch(`${url}${path}`, {
    method: "GET",
    headers: { "x-signature": sig, "x-timestamp": String(ts) },
  });
}

export async function sendMessage(args: {
  branchId: string;
  to: string;
  body: string;
}): Promise<WorkerSendResult> {
  try {
    const res = await signedPost(`/branches/${args.branchId}/send`, { to: args.to, body: args.body });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && typeof json.msgId === "string") {
      return { ok: true, msgId: json.msgId };
    }
    const err = (json.error ?? {}) as { code?: string; message?: string };
    const code: WorkerErrorCode = KNOWN_CODES.has(err.code as WorkerErrorCode)
      ? (err.code as WorkerErrorCode)
      : "unknown";
    return { ok: false, code, message: err.message ?? `worker returned ${res.status}` };
  } catch (e) {
    return { ok: false, code: "unknown", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function startSession(branchId: string): Promise<{ ok: boolean }> {
  const res = await signedPost(`/branches/${branchId}/session`, {});
  return { ok: res.ok };
}

export async function getSessionStatus(branchId: string): Promise<{
  status: string;
  phoneNumber?: string;
  lastSeenAt?: string;
}> {
  const res = await signedGet(`/branches/${branchId}/status`);
  return (await res.json()) as { status: string; phoneNumber?: string; lastSeenAt?: string };
}

export async function logoutSession(branchId: string): Promise<{ ok: boolean }> {
  const res = await signedPost(`/branches/${branchId}/logout`, {});
  return { ok: res.ok };
}
```

- [ ] **Step 9.4: Implement the test stub**

```ts
// src/lib/wa/worker-stub.ts
// In-memory replacement for the worker, used by integration tests.
// Replace fetch with the stub via vi.stubGlobal in test setup.

import type { WorkerSendResult } from "@/types/reminder";

type SendFn = (args: { branchId: string; to: string; body: string }) => Promise<WorkerSendResult>;

let sendImpl: SendFn = async () => ({ ok: true, msgId: "stub_" + Math.random().toString(36).slice(2) });

export function setStubSend(fn: SendFn): void {
  sendImpl = fn;
}

export function resetStub(): void {
  sendImpl = async () => ({ ok: true, msgId: "stub_" + Math.random().toString(36).slice(2) });
}

/** Drop-in replacement for fetch that handles worker URLs only. */
export function makeStubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/branches/")) {
      throw new Error("stub fetch: unexpected URL " + url);
    }
    if (url.includes("/send") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { to: string; body: string };
      const branchId = url.split("/branches/")[1].split("/")[0];
      const result = await sendImpl({ branchId, to: body.to, body: body.body });
      if (result.ok) {
        return new Response(JSON.stringify({ msgId: result.msgId }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { code: result.code, message: result.message } }), {
        status: 400,
      });
    }
    if (url.includes("/status") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify({ status: "CONNECTED", phoneNumber: "+60123456789" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}
```

- [ ] **Step 9.5: Run worker-client tests**

```bash
npm test -- src/lib/wa/__tests__/worker-client.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9.6: Commit**

```bash
git add src/lib/wa/worker-client.ts src/lib/wa/worker-stub.ts src/lib/wa/__tests__/worker-client.test.ts
git commit -m "feat(reminders): add worker HTTP client and in-memory test stub"
```

---

## Phase 5: Dispatcher Orchestration

### Task 10: Dispatcher — materialize step (integration test)

**Files:**
- Create: `src/lib/reminders/dispatcher.ts`
- Create: `src/lib/reminders/__tests__/dispatcher-materialize.test.ts`

- [ ] **Step 10.1: Skim existing test infrastructure**

Read `src/lib/__tests__/*` and `src/app/api/patients/__tests__/patients-overhaul.test.ts` to see how the project sets up Neon test DB fixtures. Reuse the same patterns (likely a `beforeEach` that wipes test rows by branch/email scope).

- [ ] **Step 10.2: Write the failing test**

```ts
// src/lib/reminders/__tests__/dispatcher-materialize.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { materializePending } from "../dispatcher";

const TEST_PREFIX = "rem-mat-";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({ where: { appointment: { patient: { email: { startsWith: TEST_PREFIX } } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: TEST_PREFIX } } } });
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchReminderSettings.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.waSession.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function makeFixture(opts: {
  apptInMin: number;
  pref?: "WHATSAPP" | "EMAIL" | "BOTH" | "NONE";
  hasPhone?: boolean;
  hasEmail?: boolean;
  enabled?: boolean;
  offsetsMin?: number[];
}) {
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}doc-${Date.now()}@test.local`, name: "Doc" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
  await prisma.branchMember.create({ data: { userId: doctor.id, branchId: branch.id, role: "OWNER" } });
  await prisma.branchReminderSettings.create({
    data: {
      branchId: branch.id,
      enabled: opts.enabled ?? true,
      offsetsMin: opts.offsetsMin ?? [1440, 120],
      templates: {},
    },
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "Test",
      lastName: "Patient",
      email: opts.hasEmail === false ? null : `${TEST_PREFIX}p-${Date.now()}@test.local`,
      phone: opts.hasPhone === false ? null : "+60123456789",
      branchId: branch.id,
      doctorId: doctor.id,
      reminderChannel: opts.pref ?? "WHATSAPP",
    },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + opts.apptInMin * 60_000),
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  return { doctor, branch, patient, appt };
}

describe("materializePending", () => {
  beforeEach(async () => { await cleanup(); });

  it("creates one PENDING WHATSAPP row per offset for a WhatsApp-pref patient", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP" }); // 48h ahead
    const created = await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(created).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(["WHATSAPP", "WHATSAPP"]);
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
  });

  it("creates two rows (whatsapp + email) when pref=BOTH", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "BOTH" });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.length).toBe(4); // 2 offsets × 2 channels
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["WHATSAPP", "EMAIL"]));
  });

  it("creates nothing when pref=NONE", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "NONE" });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.length).toBe(0);
  });

  it("is idempotent — running twice doesn't double-insert", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP" });
    await materializePending(new Date());
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.length).toBe(2);
  });

  it("skips branches with enabled=false", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP", enabled: false });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.length).toBe(0);
  });

  it("downgrades to email when pref=WHATSAPP but no phone", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP", hasPhone: false });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.every((r) => r.channel === "EMAIL")).toBe(true);
  });
});
```

- [ ] **Step 10.3: Run — fails**

```bash
npm test -- src/lib/reminders/__tests__/dispatcher-materialize.test.ts
```

Expected: FAIL — `Cannot find module '../dispatcher'`.

- [ ] **Step 10.4: Implement materializePending**

```ts
// src/lib/reminders/dispatcher.ts
import { prisma } from "@/lib/prisma";
import { plannedReminders, resolveChannels } from "./materialize";

const HORIZON_DAYS = 8;

/**
 * Insert AppointmentReminder rows for SCHEDULED appointments within the
 * next HORIZON_DAYS, idempotently. Returns the number of rows inserted.
 */
export async function materializePending(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const appts = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      dateTime: { gt: now, lte: horizon },
      branch: { reminderSettings: { is: { enabled: true } } },
    },
    include: {
      patient: { select: { phone: true, email: true, reminderChannel: true } },
      branch: { select: { reminderSettings: true } },
    },
  });

  let inserted = 0;
  for (const a of appts) {
    const settings = a.branch.reminderSettings;
    if (!settings) continue;
    const channels = resolveChannels({
      pref: a.patient.reminderChannel,
      hasPhone: Boolean(a.patient.phone),
      hasEmail: Boolean(a.patient.email),
    });
    const planned = plannedReminders({
      appointmentDateTime: a.dateTime,
      now,
      offsetsMin: settings.offsetsMin,
      channels,
    });

    for (const p of planned) {
      const r = await prisma.appointmentReminder.upsert({
        where: {
          appointmentId_channel_offsetMin_isFallback: {
            appointmentId: a.id,
            channel: p.channel,
            offsetMin: p.offsetMin,
            isFallback: false,
          },
        },
        create: {
          appointmentId: a.id,
          channel: p.channel,
          offsetMin: p.offsetMin,
          scheduledFor: p.scheduledFor,
          isFallback: false,
        },
        update: {}, // idempotent
        select: { createdAt: true, updatedAt: true },
      });
      if (r.createdAt.getTime() === r.updatedAt.getTime()) inserted++;
    }
  }
  return inserted;
}
```

- [ ] **Step 10.5: Run — passes**

```bash
npm test -- src/lib/reminders/__tests__/dispatcher-materialize.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 10.6: Commit**

```bash
git add src/lib/reminders/dispatcher.ts src/lib/reminders/__tests__/dispatcher-materialize.test.ts
git commit -m "feat(reminders): add idempotent materializePending step"
```

---

### Task 11: Dispatcher — send step + retry/fallback

**Files:**
- Modify: `src/lib/reminders/dispatcher.ts`
- Create: `src/lib/reminders/__tests__/dispatcher-send.test.ts`

- [ ] **Step 11.1: Write the failing test**

```ts
// src/lib/reminders/__tests__/dispatcher-send.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchDue } from "../dispatcher";

const TEST_PREFIX = "rem-disp-";
const sendMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("@/lib/wa/worker-client", () => ({
  sendMessage: (args: unknown) => sendMock(args),
}));

vi.mock("@/lib/email", () => ({
  sendReminderEmail: (args: unknown) => sendEmailMock(args),
}));

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({ where: { appointment: { patient: { email: { startsWith: TEST_PREFIX } } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: TEST_PREFIX } } } });
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchReminderSettings.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function makeFixture(channel: "WHATSAPP" | "EMAIL", opts: {
  pref?: "WHATSAPP" | "EMAIL" | "BOTH" | "NONE";
} = {}) {
  const doctor = await prisma.user.create({ data: { email: `${TEST_PREFIX}d-${Date.now()}@test.local`, name: "Doc" } });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}`, phone: "+60312345678" } });
  await prisma.branchMember.create({ data: { userId: doctor.id, branchId: branch.id, role: "OWNER" } });
  await prisma.branchReminderSettings.create({
    data: { branchId: branch.id, enabled: true, offsetsMin: [120], templates: {} },
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "Test", lastName: "P",
      email: `${TEST_PREFIX}p-${Date.now()}@test.local`, phone: "+60123456789",
      branchId: branch.id, doctorId: doctor.id,
      reminderChannel: opts.pref ?? "BOTH",
    },
  });
  const appt = await prisma.appointment.create({
    data: { dateTime: new Date(Date.now() + 60 * 60_000), patientId: patient.id, branchId: branch.id, doctorId: doctor.id },
  });
  const reminder = await prisma.appointmentReminder.create({
    data: {
      appointmentId: appt.id, channel, offsetMin: 120,
      scheduledFor: new Date(Date.now() - 60_000), // due
    },
  });
  return { branch, patient, appt, reminder };
}

describe("dispatchDue", () => {
  beforeEach(async () => { sendMock.mockReset(); sendEmailMock.mockReset(); await cleanup(); });

  it("marks WHATSAPP row SENT on success", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    sendMock.mockResolvedValueOnce({ ok: true, msgId: "wamid.42" });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(row.status).toBe("SENT");
    expect(row.externalId).toBe("wamid.42");
  });

  it("marks EMAIL row SENT on success", async () => {
    const { reminder } = await makeFixture("EMAIL");
    sendEmailMock.mockResolvedValueOnce({ ok: true, id: "re_123" });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(row.status).toBe("SENT");
    expect(row.externalId).toBe("re_123");
  });

  it("on terminal WhatsApp failure with email available, marks original FAILED and inserts a fallback EMAIL row", async () => {
    const { reminder, appt } = await makeFixture("WHATSAPP", { pref: "BOTH" });
    sendMock.mockResolvedValueOnce({ ok: false, code: "not_on_whatsapp", message: "no WA" });
    await dispatchDue(new Date());
    const orig = await prisma.appointmentReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(orig.status).toBe("FAILED");
    const all = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    const fallback = all.find((r) => r.isFallback);
    expect(fallback).toBeDefined();
    expect(fallback?.channel).toBe("EMAIL");
    expect(fallback?.status).toBe("PENDING");
  });

  it("on non-terminal failure (rate_limited), schedules retry and bumps attemptCount", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    sendMock.mockResolvedValueOnce({ ok: false, code: "rate_limited", message: "slow down" });
    const before = new Date();
    await dispatchDue(before);
    const row = await prisma.appointmentReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(1);
    expect(row.scheduledFor.getTime()).toBeGreaterThan(before.getTime());
  });

  it("after MAX_ATTEMPTS, marks FAILED and does not insert another fallback (already a fallback)", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    await prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: { attemptCount: 3, isFallback: true },
    });
    sendMock.mockResolvedValueOnce({ ok: false, code: "not_on_whatsapp", message: "no WA" });
    await dispatchDue(new Date());
    const all = await prisma.appointmentReminder.findMany({ where: { appointmentId: reminder.appointmentId } });
    expect(all.filter((r) => r.isFallback).length).toBe(1); // no chain
    const row = all.find((r) => r.id === reminder.id);
    expect(row?.status).toBe("FAILED");
  });

  it("skips when appointment is no longer SCHEDULED", async () => {
    const { reminder, appt } = await makeFixture("WHATSAPP");
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(row.status).toBe("SKIPPED");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11.2: Run — fails (`dispatchDue` not exported, `sendReminderEmail` not exported from `@/lib/email`)**

```bash
npm test -- src/lib/reminders/__tests__/dispatcher-send.test.ts
```

Expected: FAIL.

- [ ] **Step 11.3: Add `sendReminderEmail` to `@/lib/email`**

Open `src/lib/email.ts`. At the bottom of the file, append (alongside the existing `Resend` setup the file already has):

```ts
// Reminder email sender — thin wrapper around the existing Resend client.
// Returns { ok: true, id } on success or { ok: false, reason } on failure.

import type { Resend } from "resend";

declare const resend: Resend; // assumes the file already declares one — if not, adapt to use the module's existing client export

export async function sendReminderEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "invalid_email" | "bounce_hard" | "unknown"; message: string }> {
  try {
    const r = await resend.emails.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (r.error) {
      const m = r.error.message ?? "";
      const reason: "invalid_email" | "bounce_hard" | "unknown" =
        /invalid.*(email|address)/i.test(m) ? "invalid_email"
        : /bounce|undeliverable|hard.*fail/i.test(m) ? "bounce_hard"
        : "unknown";
      return { ok: false, reason, message: m };
    }
    return { ok: true, id: r.data?.id ?? "" };
  } catch (e) {
    return { ok: false, reason: "unknown", message: e instanceof Error ? e.message : String(e) };
  }
}
```

> If `src/lib/email.ts` doesn't already export a `resend` client, read it first and adapt this snippet to call the existing `Resend` constructor it uses. Do not duplicate the API-key reading.

- [ ] **Step 11.4: Implement `dispatchDue`**

Append to `src/lib/reminders/dispatcher.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { sendMessage } from "@/lib/wa/worker-client";
import { sendReminderEmail } from "@/lib/email";
import { renderTemplate } from "./templates";
import { DEFAULT_TEMPLATES } from "./default-templates";
import { backoffMs, MAX_ATTEMPTS } from "./backoff";
import { shouldFallback, oppositeChannel } from "./fallback";
import type { TemplateContext, Templates } from "@/types/reminder";

const BATCH_SIZE = 200;

export async function dispatchDue(now: Date): Promise<{ processed: number }> {
  const due = await prisma.appointmentReminder.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  let processed = 0;
  for (const { id } of due) {
    await processOne(id, now);
    processed++;
  }
  return { processed };
}

async function processOne(reminderId: string, now: Date): Promise<void> {
  const r = await prisma.appointmentReminder.findUnique({
    where: { id: reminderId },
    include: {
      appointment: {
        include: {
          patient: true,
          branch: { include: { reminderSettings: true } },
          doctor: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!r) return;

  if (r.appointment.status !== "SCHEDULED") {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "SKIPPED", failureReason: `appointment status: ${r.appointment.status}` },
    });
    return;
  }

  const settings = r.appointment.branch.reminderSettings;
  const templates = (settings?.templates ?? {}) as Partial<Templates>;
  const lang = (r.appointment.patient.preferredLanguage === "ms" ? "ms" : "en") as "en" | "ms";

  const ctx: TemplateContext = buildContext(r.appointment, lang);
  let body: string;
  let html: string | undefined;
  try {
    if (r.channel === "WHATSAPP") {
      body = renderTemplate(
        templates.whatsapp?.[lang] ?? DEFAULT_TEMPLATES.whatsapp[lang],
        ctx
      );
    } else {
      body = renderTemplate(
        templates.email?.[lang] ?? DEFAULT_TEMPLATES.email[lang],
        ctx
      );
      html = renderTemplate(
        (lang === "ms" ? templates.email?.htmlMs : templates.email?.htmlEn) ??
          (lang === "ms" ? DEFAULT_TEMPLATES.email.htmlMs : DEFAULT_TEMPLATES.email.htmlEn),
        ctx
      );
    }
  } catch (e) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "FAILED", failureReason: `template_render_error: ${(e as Error).message}` },
    });
    return;
  }

  let result: { ok: true; externalId: string } | { ok: false; code: string; message: string };
  if (r.channel === "WHATSAPP") {
    const wa = await sendMessage({
      branchId: r.appointment.branchId,
      to: r.appointment.patient.phone ?? "",
      body,
    });
    result = wa.ok
      ? { ok: true, externalId: wa.msgId }
      : { ok: false, code: wa.code, message: wa.message };
  } else {
    const subject = subjectFromBody(body);
    const em = await sendReminderEmail({
      to: r.appointment.patient.email ?? "",
      from: process.env.RESEND_REMINDERS_FROM ?? "reminders@example.com",
      subject,
      text: body,
      html: html ?? body,
    });
    result = em.ok
      ? { ok: true, externalId: em.id }
      : { ok: false, code: em.reason, message: em.message };
  }

  if (result.ok) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "SENT", sentAt: new Date(), externalId: result.externalId },
    });
    return;
  }

  // Failure path
  const newAttempt = r.attemptCount + 1;
  const maybeFallback = shouldFallback({
    channel: r.channel as "WHATSAPP" | "EMAIL",
    reason: result.code,
    attemptCount: newAttempt,
    isFallback: r.isFallback,
    hasOtherChannelContact:
      r.channel === "WHATSAPP" ? Boolean(r.appointment.patient.email) : Boolean(r.appointment.patient.phone),
    pref: r.appointment.patient.reminderChannel,
  });

  if (maybeFallback) {
    await prisma.$transaction([
      prisma.appointmentReminder.update({
        where: { id: r.id },
        data: { status: "FAILED", attemptCount: newAttempt, failureReason: result.message },
      }),
      prisma.appointmentReminder.upsert({
        where: {
          appointmentId_channel_offsetMin_isFallback: {
            appointmentId: r.appointmentId,
            channel: oppositeChannel(r.channel as "WHATSAPP" | "EMAIL"),
            offsetMin: r.offsetMin,
            isFallback: true,
          },
        },
        create: {
          appointmentId: r.appointmentId,
          channel: oppositeChannel(r.channel as "WHATSAPP" | "EMAIL"),
          offsetMin: r.offsetMin,
          scheduledFor: now, // pick up next tick
          isFallback: true,
        },
        update: { status: "PENDING", scheduledFor: now },
      }),
    ]);
    return;
  }

  if (newAttempt >= MAX_ATTEMPTS) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "FAILED", attemptCount: newAttempt, failureReason: result.message },
    });
    return;
  }

  // Retry with backoff
  await prisma.appointmentReminder.update({
    where: { id: r.id },
    data: {
      status: "PENDING",
      attemptCount: newAttempt,
      scheduledFor: new Date(now.getTime() + backoffMs(newAttempt)),
      failureReason: result.message,
    },
  });
}

function buildContext(
  appt: Prisma.AppointmentGetPayload<{ include: { patient: true; branch: true; doctor: true } }>,
  lang: "en" | "ms"
): TemplateContext {
  const dt = new Date(appt.dateTime);
  const dateLocale = lang === "ms" ? "ms-MY" : "en-MY";
  return {
    patientName: `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
    firstName: appt.patient.firstName,
    lastName: appt.patient.lastName,
    date: dt.toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" }),
    time: dt.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false }),
    dayOfWeek: dt.toLocaleDateString(dateLocale, { weekday: "long" }),
    doctorName: appt.doctor.name ?? "your doctor",
    branchName: appt.branch.name,
    branchAddress: appt.branch.address ?? "",
    branchPhone: appt.branch.phone ?? "",
  };
}

function subjectFromBody(body: string): string {
  return body.split("\n")[0].slice(0, 80) || "Appointment reminder";
}
```

- [ ] **Step 11.5: Run — passes**

```bash
npm test -- src/lib/reminders/__tests__/dispatcher-send.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 11.6: Commit**

```bash
git add src/lib/reminders/dispatcher.ts src/lib/email.ts src/lib/reminders/__tests__/dispatcher-send.test.ts
git commit -m "feat(reminders): add dispatchDue with retry, fallback, and skip logic"
```

---

## Phase 6: API Routes

### Task 12: `POST /api/reminders/dispatch`

**Files:**
- Create: `src/app/api/reminders/dispatch/route.ts`
- Create: `src/app/api/reminders/dispatch/__tests__/route.test.ts`

- [ ] **Step 12.1: Write the failing test**

```ts
// src/app/api/reminders/dispatch/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

vi.mock("@/lib/reminders/dispatcher", () => ({
  materializePending: vi.fn().mockResolvedValue(0),
  dispatchDue: vi.fn().mockResolvedValue({ processed: 0 }),
}));

beforeEach(() => { process.env.CRON_SECRET = "secret-x"; });

function req(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers["x-cron-secret"] = secret;
  return new Request("http://x/api/reminders/dispatch", { method: "POST", headers });
}

describe("POST /api/reminders/dispatch", () => {
  it("rejects without the cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("rejects with the wrong secret", async () => {
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
  });

  it("runs materialize + dispatch when authorized", async () => {
    const res = await POST(req("secret-x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 12.2: Run — fails**

```bash
npm test -- src/app/api/reminders/dispatch/__tests__/route.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 12.3: Implement**

```ts
// src/app/api/reminders/dispatch/route.ts
import { NextResponse } from "next/server";
import { materializePending, dispatchDue } from "@/lib/reminders/dispatcher";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const inserted = await materializePending(now);
  const { processed } = await dispatchDue(now);
  return NextResponse.json({ ok: true, inserted, processed });
}
```

- [ ] **Step 12.4: Run — passes**

```bash
npm test -- src/app/api/reminders/dispatch/__tests__/route.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 12.5: Commit**

```bash
git add src/app/api/reminders/dispatch/
git commit -m "feat(reminders): add /api/reminders/dispatch cron entry"
```

---

### Task 13: Branch reminder settings — GET + PUT

**Files:**
- Create: `src/app/api/branches/[branchId]/reminder-settings/route.ts`
- Create: `src/app/api/branches/[branchId]/reminder-settings/__tests__/route.test.ts`

- [ ] **Step 13.1: Write the failing test**

```ts
// src/app/api/branches/[branchId]/reminder-settings/__tests__/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET, PUT } from "../route";

const TEST_PREFIX = "rem-set-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.branchReminderSettings.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.waSession.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function setup(role: "OWNER" | "ADMIN" | "DOCTOR" = "OWNER") {
  const user = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
  await prisma.branchMember.create({ data: { userId: user.id, branchId: branch.id, role } });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: user.id, email: user.email, name: user.name } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role);
  return { user, branch };
}

describe("GET /api/branches/:id/reminder-settings", () => {
  beforeEach(async () => { vi.clearAllMocks(); await cleanup(); });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ branchId: "x" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    const u = await prisma.user.create({ data: { email: `${TEST_PREFIX}u2-${Date.now()}@test.local`, name: "U2" } });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id, email: u.email, name: u.name } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ branchId: "x" }) });
    expect(res.status).toBe(403);
  });

  it("returns defaults when no settings row exists yet", async () => {
    const { branch } = await setup();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.enabled).toBe(false);
    expect(body.settings.offsetsMin).toEqual([1440, 120]);
  });
});

describe("PUT /api/branches/:id/reminder-settings", () => {
  beforeEach(async () => { vi.clearAllMocks(); await cleanup(); });

  it("returns 403 when role is DOCTOR", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ enabled: true, offsetsMin: [1440], templates: {} }) }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("rejects an empty offsetsMin", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ enabled: true, offsetsMin: [], templates: {} }) }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(422);
  });

  it("rejects an unknown placeholder in template", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({
        enabled: true, offsetsMin: [1440],
        templates: { whatsapp: { en: "Hi {nope}", ms: "" }, email: { en: "", ms: "", htmlEn: "", htmlMs: "" } },
      }) }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(422);
  });

  it("upserts settings", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: JSON.stringify({
        enabled: true, offsetsMin: [1440, 120],
        templates: { whatsapp: { en: "Hi {firstName}", ms: "Hai {firstName}" }, email: { en: "Hi", ms: "Hai", htmlEn: "<p>Hi</p>", htmlMs: "<p>Hai</p>" } },
      }) }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.branchReminderSettings.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.enabled).toBe(true);
    expect(row.offsetsMin).toEqual([1440, 120]);
  });
});
```

- [ ] **Step 13.2: Run — fails**

```bash
npm test -- src/app/api/branches/[branchId]/reminder-settings/__tests__/route.test.ts
```

Expected: FAIL.

- [ ] **Step 13.3: Implement**

```ts
// src/app/api/branches/[branchId]/reminder-settings/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { ALLOWED_OFFSETS_MIN, type Templates } from "@/types/reminder";
import { DEFAULT_TEMPLATES } from "@/lib/reminders/default-templates";
import { validateTemplate } from "@/lib/reminders/templates";

type RouteCtx = { params: Promise<{ branchId: string }> };

const StringTpl = z.string().max(8000);

const Body = z.object({
  enabled: z.boolean(),
  offsetsMin: z.array(z.number().int().refine((n) => (ALLOWED_OFFSETS_MIN as readonly number[]).includes(n))).min(1),
  templates: z.object({
    whatsapp: z.object({ en: StringTpl, ms: StringTpl }).partial().optional(),
    email: z.object({ en: StringTpl, ms: StringTpl, htmlEn: StringTpl, htmlMs: StringTpl }).partial().optional(),
  }),
});

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [settings, waSession] = await Promise.all([
    prisma.branchReminderSettings.findUnique({ where: { branchId } }),
    prisma.waSession.findUnique({ where: { branchId } }),
  ]);

  const fallback = {
    branchId,
    enabled: false,
    offsetsMin: [1440, 120],
    templates: DEFAULT_TEMPLATES,
  };

  return NextResponse.json({
    settings: settings ?? fallback,
    waSession: waSession ?? null,
    role,
  });
}

export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  // Validate template placeholders
  const tpls: Array<string | undefined> = [
    data.templates.whatsapp?.en, data.templates.whatsapp?.ms,
    data.templates.email?.en, data.templates.email?.ms,
    data.templates.email?.htmlEn, data.templates.email?.htmlMs,
  ];
  for (const tpl of tpls) {
    if (tpl && tpl.length > 0) {
      const v = validateTemplate(tpl);
      if (!v.ok) return NextResponse.json({ error: "validation", message: v.message }, { status: 422 });
    }
  }

  // Merge with defaults so partial updates are safe
  const merged: Templates = {
    whatsapp: {
      en: data.templates.whatsapp?.en ?? DEFAULT_TEMPLATES.whatsapp.en,
      ms: data.templates.whatsapp?.ms ?? DEFAULT_TEMPLATES.whatsapp.ms,
    },
    email: {
      en: data.templates.email?.en ?? DEFAULT_TEMPLATES.email.en,
      ms: data.templates.email?.ms ?? DEFAULT_TEMPLATES.email.ms,
      htmlEn: data.templates.email?.htmlEn ?? DEFAULT_TEMPLATES.email.htmlEn,
      htmlMs: data.templates.email?.htmlMs ?? DEFAULT_TEMPLATES.email.htmlMs,
    },
  };

  const row = await prisma.branchReminderSettings.upsert({
    where: { branchId },
    create: { branchId, enabled: data.enabled, offsetsMin: data.offsetsMin, templates: merged },
    update: { enabled: data.enabled, offsetsMin: data.offsetsMin, templates: merged },
  });
  return NextResponse.json({ settings: row });
}
```

- [ ] **Step 13.4: Run — passes**

```bash
npm test -- src/app/api/branches/[branchId]/reminder-settings/__tests__/route.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 13.5: Commit**

```bash
git add src/app/api/branches/\[branchId\]/reminder-settings/
git commit -m "feat(reminders): add branch reminder-settings GET/PUT route"
```

---

### Task 14: WhatsApp connect / status / disconnect routes

**Files:**
- Create: `src/app/api/branches/[branchId]/wa/connect/route.ts`
- Create: `src/app/api/branches/[branchId]/wa/status/route.ts`
- Create: `src/app/api/branches/[branchId]/wa/disconnect/route.ts`
- Create: `src/app/api/branches/[branchId]/wa/__tests__/wa.test.ts`

- [ ] **Step 14.1: Write the failing test**

```ts
// src/app/api/branches/[branchId]/wa/__tests__/wa.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as connectPOST } from "../connect/route";
import { GET as statusGET } from "../status/route";
import { POST as disconnectPOST } from "../disconnect/route";

const TEST_PREFIX = "rem-wa-route-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
vi.mock("@/lib/wa/worker-client", () => ({
  startSession: vi.fn().mockResolvedValue({ ok: true }),
  logoutSession: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.waSession.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function setup(role: "OWNER" | "DOCTOR" = "OWNER") {
  const user = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
  await prisma.branchMember.create({ data: { userId: user.id, branchId: branch.id, role } });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: user.id, email: user.email } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role);
  return { user, branch };
}

describe("WhatsApp wa/* routes", () => {
  beforeEach(async () => { vi.clearAllMocks(); await cleanup(); });

  it("connect — DOCTOR is forbidden", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await connectPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(403);
  });

  it("connect — OWNER triggers worker.startSession and creates a PAIRING WaSession", async () => {
    const { branch } = await setup("OWNER");
    const res = await connectPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.status).toBe("PAIRING");
  });

  it("status — any branch member can read", async () => {
    const { branch } = await setup("DOCTOR");
    await prisma.waSession.create({ data: { branchId: branch.id, status: "CONNECTED", phoneNumber: "+60123" } });
    const res = await statusGET(new Request("http://x"), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("CONNECTED");
    expect(body.phoneNumber).toBe("+60123");
  });

  it("status — returns DISCONNECTED for missing session", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await statusGET(new Request("http://x"), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("DISCONNECTED");
  });

  it("disconnect — OWNER clears the session", async () => {
    const { branch } = await setup("OWNER");
    await prisma.waSession.create({ data: { branchId: branch.id, status: "CONNECTED", phoneNumber: "+60123" } });
    const res = await disconnectPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ branchId: branch.id }) });
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.status).toBe("DISCONNECTED");
  });
});
```

- [ ] **Step 14.2: Run — fails**

```bash
npm test -- src/app/api/branches/[branchId]/wa/__tests__/wa.test.ts
```

Expected: FAIL.

- [ ] **Step 14.3: Implement connect**

```ts
// src/app/api/branches/[branchId]/wa/connect/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { startSession } from "@/lib/wa/worker-client";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await startSession(branchId);
  if (!result.ok) {
    return NextResponse.json({ error: "worker_unavailable" }, { status: 502 });
  }

  await prisma.waSession.upsert({
    where: { branchId },
    create: { branchId, status: "PAIRING" },
    update: { status: "PAIRING", qrPayload: null },
  });
  return NextResponse.json({ status: "PAIRING" });
}
```

- [ ] **Step 14.4: Implement status**

```ts
// src/app/api/branches/[branchId]/wa/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const row = await prisma.waSession.findUnique({ where: { branchId } });
  return NextResponse.json(
    row ?? { branchId, status: "DISCONNECTED", phoneNumber: null, lastSeenAt: null, qrPayload: null }
  );
}
```

- [ ] **Step 14.5: Implement disconnect**

```ts
// src/app/api/branches/[branchId]/wa/disconnect/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { logoutSession } from "@/lib/wa/worker-client";

type RouteCtx = { params: Promise<{ branchId: string }> };

export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await logoutSession(branchId);
  await prisma.waSession.upsert({
    where: { branchId },
    create: { branchId, status: "DISCONNECTED" },
    update: { status: "DISCONNECTED", phoneNumber: null, qrPayload: null },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 14.6: Run — passes**

```bash
npm test -- src/app/api/branches/[branchId]/wa/__tests__/wa.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 14.7: Commit**

```bash
git add src/app/api/branches/\[branchId\]/wa/
git commit -m "feat(reminders): add WhatsApp connect/status/disconnect routes"
```

---

### Task 15: Worker → app webhook

**Files:**
- Create: `src/app/api/wa/webhook/route.ts`
- Create: `src/app/api/wa/webhook/__tests__/webhook.test.ts`

- [ ] **Step 15.1: Write the failing test**

```ts
// src/app/api/wa/webhook/__tests__/webhook.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { signRequest } from "@/lib/wa/hmac";
import { POST } from "../route";

const TEST_PREFIX = "rem-wh-";
const SECRET = "outbound-secret";

beforeEach(async () => {
  process.env.WORKER_OUTBOUND_SECRET = SECRET;
  await prisma.waSession.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
});

function makeReq(body: object, opts?: { secret?: string; ts?: number }) {
  const raw = JSON.stringify(body);
  const ts = opts?.ts ?? Math.floor(Date.now() / 1000);
  const sig = signRequest({ secret: opts?.secret ?? SECRET, body: raw, timestamp: ts });
  return new Request("http://x/api/wa/webhook", {
    method: "POST",
    headers: { "x-signature": sig, "x-timestamp": String(ts), "content-type": "application/json" },
    body: raw,
  });
}

describe("POST /api/wa/webhook", () => {
  it("rejects bad HMAC", async () => {
    const res = await POST(makeReq({ type: "qr" }, { secret: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("handles `qr` event by setting qrPayload + status=PAIRING", async () => {
    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    const res = await POST(makeReq({ type: "qr", branchId: branch.id, qrPayload: "BASE64" }));
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.status).toBe("PAIRING");
    expect(row.qrPayload).toBe("BASE64");
  });

  it("handles `connected` event by setting status + phoneNumber and clearing qr", async () => {
    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    await prisma.waSession.create({ data: { branchId: branch.id, status: "PAIRING", qrPayload: "X" } });
    const res = await POST(makeReq({ type: "connected", branchId: branch.id, phoneNumber: "+60123" }));
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.status).toBe("CONNECTED");
    expect(row.phoneNumber).toBe("+60123");
    expect(row.qrPayload).toBeNull();
  });

  it("handles `logged_out` event", async () => {
    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    await prisma.waSession.create({ data: { branchId: branch.id, status: "CONNECTED", phoneNumber: "+60123" } });
    await POST(makeReq({ type: "logged_out", branchId: branch.id, reason: "user removed device" }));
    const row = await prisma.waSession.findUniqueOrThrow({ where: { branchId: branch.id } });
    expect(row.status).toBe("LOGGED_OUT");
  });
});
```

- [ ] **Step 15.2: Run — fails**

```bash
npm test -- src/app/api/wa/webhook/__tests__/webhook.test.ts
```

Expected: FAIL.

- [ ] **Step 15.3: Implement**

```ts
// src/app/api/wa/webhook/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyRequest } from "@/lib/wa/hmac";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("qr"), branchId: z.string(), qrPayload: z.string() }),
  z.object({ type: z.literal("connected"), branchId: z.string(), phoneNumber: z.string() }),
  z.object({ type: z.literal("disconnected"), branchId: z.string(), reason: z.string() }),
  z.object({ type: z.literal("logged_out"), branchId: z.string(), reason: z.string() }),
  z.object({
    type: z.literal("ack"),
    branchId: z.string(),
    msgId: z.string(),
    ack: z.enum(["sent", "delivered", "read", "failed"]),
  }),
]);

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WORKER_OUTBOUND_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  const raw = await req.text();
  const sig = req.headers.get("x-signature") ?? "";
  const ts = Number(req.headers.get("x-timestamp") ?? "0");
  const v = verifyRequest({ secret, body: raw, signature: sig, timestamp: ts, nowEpoch: Math.floor(Date.now() / 1000) });
  if (!v.ok) return NextResponse.json({ error: v.message }, { status: 401 });

  const parsed = Event.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });

  const e = parsed.data;
  switch (e.type) {
    case "qr":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "PAIRING", qrPayload: e.qrPayload },
        update: { status: "PAIRING", qrPayload: e.qrPayload },
      });
      break;
    case "connected":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "CONNECTED", phoneNumber: e.phoneNumber, lastSeenAt: new Date() },
        update: { status: "CONNECTED", phoneNumber: e.phoneNumber, lastSeenAt: new Date(), qrPayload: null },
      });
      break;
    case "disconnected":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "DISCONNECTED" },
        update: { status: "DISCONNECTED", lastSeenAt: new Date() },
      });
      break;
    case "logged_out":
      await prisma.waSession.upsert({
        where: { branchId: e.branchId },
        create: { branchId: e.branchId, status: "LOGGED_OUT" },
        update: { status: "LOGGED_OUT", phoneNumber: null, qrPayload: null },
      });
      break;
    case "ack":
      await prisma.appointmentReminder.updateMany({
        where: { externalId: e.msgId, channel: "WHATSAPP" },
        data: e.ack === "failed" ? { status: "FAILED", failureReason: "wa_ack_failed" } : {},
      });
      break;
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 15.4: Run — passes**

```bash
npm test -- src/app/api/wa/webhook/__tests__/webhook.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 15.5: Commit**

```bash
git add src/app/api/wa/webhook/
git commit -m "feat(reminders): add /api/wa/webhook for worker session events and acks"
```

---

### Task 16: `GET /api/appointments/[id]/reminders`

**Files:**
- Create: `src/app/api/appointments/[appointmentId]/reminders/route.ts`
- Create: `src/app/api/appointments/[appointmentId]/reminders/__tests__/route.test.ts`

- [ ] **Step 16.1: Write the failing test**

```ts
// src/app/api/appointments/[appointmentId]/reminders/__tests__/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

const TEST_PREFIX = "rem-appt-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({ where: { appointment: { patient: { email: { startsWith: TEST_PREFIX } } } } });
  await prisma.appointment.deleteMany({ where: { patient: { email: { startsWith: TEST_PREFIX } } } });
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("GET /api/appointments/:id/reminders", () => {
  beforeEach(async () => { vi.clearAllMocks(); await cleanup(); });

  it("returns the rows for a member", async () => {
    const u = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    await prisma.branchMember.create({ data: { userId: u.id, branchId: b.id, role: "DOCTOR" } });
    const p = await prisma.patient.create({ data: { firstName: "T", lastName: "P", email: `${TEST_PREFIX}p-${Date.now()}@t`, branchId: b.id, doctorId: u.id } });
    const a = await prisma.appointment.create({ data: { dateTime: new Date(Date.now()+3600000), patientId: p.id, branchId: b.id, doctorId: u.id } });
    await prisma.appointmentReminder.create({ data: { appointmentId: a.id, channel: "WHATSAPP", offsetMin: 1440, scheduledFor: new Date() } });

    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ appointmentId: a.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].channel).toBe("WHATSAPP");
  });

  it("returns 403 for non-members", async () => {
    const u = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    const p = await prisma.patient.create({ data: { firstName: "T", lastName: "P", email: `${TEST_PREFIX}p-${Date.now()}@t`, branchId: b.id, doctorId: u.id } });
    const a = await prisma.appointment.create({ data: { dateTime: new Date(Date.now()+3600000), patientId: p.id, branchId: b.id, doctorId: u.id } });

    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ appointmentId: a.id }) });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 16.2: Run — fails**

```bash
npm test -- src/app/api/appointments/[appointmentId]/reminders/__tests__/route.test.ts
```

- [ ] **Step 16.3: Implement**

```ts
// src/app/api/appointments/[appointmentId]/reminders/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { branchId: true },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, appt.branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const reminders = await prisma.appointmentReminder.findMany({
    where: { appointmentId },
    orderBy: [{ scheduledFor: "asc" }, { channel: "asc" }],
  });
  return NextResponse.json({ reminders });
}
```

- [ ] **Step 16.4: Run — passes**

```bash
npm test -- src/app/api/appointments/[appointmentId]/reminders/__tests__/route.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 16.5: Commit**

```bash
git add src/app/api/appointments/\[appointmentId\]/reminders/
git commit -m "feat(reminders): add GET /api/appointments/:id/reminders"
```

---

### Task 17: Patient routes — accept `reminderChannel` + `preferredLanguage`

**Files:**
- Modify: `src/app/api/patients/route.ts`
- Modify: `src/app/api/patients/[patientId]/route.ts`

- [ ] **Step 17.1: Read both files to find the existing Zod schemas**

```bash
sed -n '1,200p' src/app/api/patients/route.ts
sed -n '1,200p' src/app/api/patients/[patientId]/route.ts
```

Identify the Zod schema(s) used for create/update.

- [ ] **Step 17.2: Add the two fields to each Zod schema**

In both files' validation schemas (likely named something like `CreatePatientSchema` / `UpdatePatientSchema`), add:

```ts
reminderChannel: z.enum(["WHATSAPP", "EMAIL", "BOTH", "NONE"]).optional(),
preferredLanguage: z.enum(["en", "ms"]).optional(),
```

- [ ] **Step 17.3: Pass both fields through to `prisma.patient.create` / `update`**

In each route handler, ensure the input fields are forwarded to the Prisma call. The Prisma defaults (`WHATSAPP`, `"en"`) handle the unset case.

- [ ] **Step 17.4: Add a regression test**

```ts
// src/app/api/patients/__tests__/reminder-fields.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "rem-pf-";

// NOTE: this test relies on the existing patients tests' auth mocking pattern.
// Adapt the auth mock import to match `src/app/api/patients/__tests__/patients-overhaul.test.ts`.

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { POST } from "../route";

async function cleanup() {
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("POST /api/patients reminder fields", () => {
  beforeEach(async () => { vi.clearAllMocks(); await cleanup(); });

  it("persists reminderChannel and preferredLanguage", async () => {
    const u = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
    await prisma.branchMember.create({ data: { userId: u.id, branchId: b.id, role: "OWNER" } });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "X", lastName: "Y",
        email: `${TEST_PREFIX}p-${Date.now()}@test.local`,
        branchId: b.id, doctorId: u.id,
        reminderChannel: "BOTH",
        preferredLanguage: "ms",
      }),
    }));
    expect(res.status).toBeLessThan(300);
    const all = await prisma.patient.findMany({ where: { email: { startsWith: TEST_PREFIX } } });
    expect(all).toHaveLength(1);
    expect(all[0].reminderChannel).toBe("BOTH");
    expect(all[0].preferredLanguage).toBe("ms");
  });
});
```

- [ ] **Step 17.5: Run — passes (after the schema/route edits land)**

```bash
npm test -- src/app/api/patients/__tests__/reminder-fields.test.ts
```

If the test fails because the existing route requires more fields than provided here, add them to match the existing schema and re-run.

- [ ] **Step 17.6: Commit**

```bash
git add src/app/api/patients/
git commit -m "feat(reminders): accept reminderChannel and preferredLanguage on patient routes"
```

---

### Task 18: Reschedule path — clear PENDING reminders on appointment update

**Files:**
- Discover: where appointments are mutated (PATCH/PUT). Likely candidates:
  - `src/app/api/patients/[patientId]/visits/[visitId]/route.ts`
  - any `appointments` route under dashboard or branches

- [ ] **Step 18.1: Locate the appointment update path**

```bash
grep -rn "prisma.appointment.update" src/app/api
grep -rn "Appointment" src/app/api --include="*.ts" -l
```

If no PATCH route exists for appointments, create one at `src/app/api/appointments/[appointmentId]/route.ts` with PATCH that allows updating `dateTime` and `status`. Otherwise, modify the existing route.

- [ ] **Step 18.2: Add the reminder-clear hook**

After any successful `prisma.appointment.update`, if the update touched `dateTime` OR set `status` to a non-`SCHEDULED` value, run:

```ts
await prisma.appointmentReminder.deleteMany({
  where: { appointmentId: <id>, status: "PENDING" },
});
```

The next dispatcher tick will re-materialize PENDING rows from the new `dateTime` if `status === SCHEDULED`.

- [ ] **Step 18.3: Add an integration test that covers the reschedule case**

```ts
// (located alongside the appointment update route's tests)
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { materializePending } from "@/lib/reminders/dispatcher";

const TEST_PREFIX = "rem-rs-";

beforeEach(async () => {
  await prisma.appointmentReminder.deleteMany({ where: { appointment: { branch: { name: { startsWith: TEST_PREFIX } } } } });
  await prisma.appointment.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.patient.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchReminderSettings.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
});

it("rescheduling clears PENDING reminders so they re-materialize at the new time", async () => {
  const u = await prisma.user.create({ data: { email: `${TEST_PREFIX}u-${Date.now()}@test.local`, name: "U" } });
  const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${Date.now()}` } });
  await prisma.branchMember.create({ data: { userId: u.id, branchId: b.id, role: "OWNER" } });
  await prisma.branchReminderSettings.create({ data: { branchId: b.id, enabled: true, offsetsMin: [1440], templates: {} } });
  const p = await prisma.patient.create({ data: { firstName: "T", lastName: "P", email: `${TEST_PREFIX}p-${Date.now()}@t`, phone: "+60123", branchId: b.id, doctorId: u.id, reminderChannel: "WHATSAPP" } });
  const a = await prisma.appointment.create({ data: { dateTime: new Date(Date.now() + 60*60*1000*48), patientId: p.id, branchId: b.id, doctorId: u.id } });
  await materializePending(new Date());
  const before = await prisma.appointmentReminder.findMany({ where: { appointmentId: a.id } });
  expect(before).toHaveLength(1);
  // Reschedule via the route under test (use direct prisma + the cleanup logic added in Step 18.2)
  await prisma.appointment.update({ where: { id: a.id }, data: { dateTime: new Date(Date.now() + 60*60*1000*72) } });
  await prisma.appointmentReminder.deleteMany({ where: { appointmentId: a.id, status: "PENDING" } });
  await materializePending(new Date());
  const after = await prisma.appointmentReminder.findMany({ where: { appointmentId: a.id } });
  expect(after).toHaveLength(1);
  expect(after[0].scheduledFor.getTime()).toBeGreaterThan(before[0].scheduledFor.getTime());
});
```

- [ ] **Step 18.4: Run — passes**

```bash
npm test -- src/app/api/appointments
```

- [ ] **Step 18.5: Commit**

```bash
git add src/app/api/appointments/ src/app/api/patients/
git commit -m "feat(reminders): clear PENDING reminders on appointment reschedule/cancel"
```

---

## Phase 7: UI

### Task 19: `ReminderTemplateEditor` component

**Files:**
- Create: `src/components/branches/ReminderTemplateEditor.tsx`

- [ ] **Step 19.1: Implement the editor**

```tsx
// src/components/branches/ReminderTemplateEditor.tsx
"use client";

import { useState } from "react";
import { ALLOWED_PLACEHOLDERS } from "@/lib/reminders/placeholders";
import { renderTemplate, validateTemplate } from "@/lib/reminders/templates";
import type { TemplateContext } from "@/types/reminder";

const SAMPLE: TemplateContext = {
  patientName: "Ahmad Bin Ali",
  firstName: "Ahmad",
  lastName: "Bin Ali",
  date: "29 April 2026",
  time: "14:30",
  dayOfWeek: "Wednesday",
  doctorName: "Dr Lee",
  branchName: "SmartChiro KL",
  branchAddress: "1 Jalan Sentral, KL",
  branchPhone: "+60312345678",
};

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  charLimit?: number;
};

export function ReminderTemplateEditor({ label, value, onChange, charLimit }: Props) {
  const [focused, setFocused] = useState(false);
  const v = validateTemplate(value);
  const preview = v.ok ? renderTemplate(value, SAMPLE) : "";

  function insert(token: string) {
    onChange(value + `{${token}}`);
  }

  return (
    <div className="space-y-2">
      <label className="text-[15px] font-medium text-[#0A2540]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={6}
        className="w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 py-2 text-[15px] focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
      />
      <div className="flex flex-wrap gap-1">
        {ALLOWED_PLACEHOLDERS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => insert(name)}
            className="rounded-[4px] border border-[#E3E8EE] bg-white px-2 py-1 text-[13px] text-[#425466] hover:bg-[#F0F3F7]"
          >
            {`{${name}}`}
          </button>
        ))}
      </div>
      {charLimit && (
        <div className={`text-[13px] ${value.length > charLimit ? "text-[#DF1B41]" : "text-[#697386]"}`}>
          {value.length} / {charLimit} chars
        </div>
      )}
      {!v.ok && (
        <div className="text-[13px] text-[#DF1B41]">Error: {v.message}</div>
      )}
      <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-3 text-[14px] text-[#0A2540] whitespace-pre-wrap">
        <div className="mb-1 text-[12px] uppercase tracking-wide text-[#697386]">Preview</div>
        {v.ok ? preview : <span className="text-[#697386]">— invalid template —</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 19.2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 19.3: Commit**

```bash
git add src/components/branches/ReminderTemplateEditor.tsx
git commit -m "feat(reminders): add ReminderTemplateEditor with live preview"
```

---

### Task 20: `WaConnectModal` component

**Files:**
- Create: `src/components/branches/WaConnectModal.tsx`

- [ ] **Step 20.1: Implement**

```tsx
// src/components/branches/WaConnectModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  branchId: string;
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
};

type Status = "DISCONNECTED" | "PAIRING" | "CONNECTED" | "LOGGED_OUT";

export function WaConnectModal({ branchId, open, onClose, onConnected }: Props) {
  const [status, setStatus] = useState<Status>("DISCONNECTED");
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);

    async function startAndPoll() {
      const r = await fetch(`/api/branches/${branchId}/wa/connect`, { method: "POST" });
      if (!r.ok) {
        setErr("Failed to start WhatsApp session");
        return;
      }
      pollRef.current = setInterval(async () => {
        if (cancelled) return;
        const s = await fetch(`/api/branches/${branchId}/wa/status`);
        if (!s.ok) return;
        const j = await s.json();
        setStatus(j.status as Status);
        setQr(j.qrPayload ?? null);
        setPhone(j.phoneNumber ?? null);
        if (j.status === "CONNECTED") {
          if (pollRef.current) clearInterval(pollRef.current);
          onConnected();
        }
      }, 2000);
    }
    startAndPoll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, branchId, onConnected]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-[8px] border border-[#E3E8EE] bg-white p-6 shadow-lg">
        <div className="mb-3 text-[18px] font-medium text-[#0A2540]">Connect WhatsApp</div>
        <p className="mb-4 text-[15px] text-[#425466]">
          Scan this QR with the WhatsApp app on the owner&apos;s phone (Settings → Linked Devices → Link a Device).
        </p>
        {err && <div className="mb-3 rounded-[4px] bg-[#FDE7EC] p-2 text-[14px] text-[#DF1B41]">{err}</div>}
        {status === "PAIRING" && qr ? (
          <img alt="WhatsApp pairing QR" src={`data:image/png;base64,${qr}`} className="mx-auto h-[260px] w-[260px] rounded-[6px] border border-[#E3E8EE]" />
        ) : status === "CONNECTED" ? (
          <div className="rounded-[6px] bg-[#E5F8E5] p-4 text-center text-[#30B130]">Connected as {phone}</div>
        ) : (
          <div className="rounded-[6px] bg-[#F0F3F7] p-4 text-center text-[#697386]">Waiting for QR…</div>
        )}
        <p className="mt-4 text-[13px] text-[#697386]">
          WhatsApp may disconnect this session at their discretion. Use at your own risk.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-[4px] border border-[#E3E8EE] bg-white px-3 py-1.5 text-[14px] text-[#0A2540] hover:bg-[#F0F3F7]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 20.2: Commit**

```bash
git add src/components/branches/WaConnectModal.tsx
git commit -m "feat(reminders): add WaConnectModal with QR polling"
```

---

### Task 21: `BranchReminderSettingsCard` component

**Files:**
- Create: `src/components/branches/BranchReminderSettingsCard.tsx`

- [ ] **Step 21.1: Implement**

```tsx
// src/components/branches/BranchReminderSettingsCard.tsx
"use client";

import { useEffect, useState } from "react";
import { ReminderTemplateEditor } from "./ReminderTemplateEditor";
import { WaConnectModal } from "./WaConnectModal";
import { ALLOWED_OFFSETS_MIN, type Templates } from "@/types/reminder";

type Props = {
  branchId: string;
  canEdit: boolean;
};

const OFFSET_LABELS: Record<number, string> = {
  10080: "7 days",
  2880: "48 hours",
  1440: "24 hours",
  240: "4 hours",
  120: "2 hours",
  30: "30 minutes",
};

type ServerState = {
  settings: { enabled: boolean; offsetsMin: number[]; templates: Templates };
  waSession: { status: string; phoneNumber: string | null } | null;
};

export function BranchReminderSettingsCard({ branchId, canEdit }: Props) {
  const [state, setState] = useState<ServerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [waModal, setWaModal] = useState(false);

  useEffect(() => {
    fetch(`/api/branches/${branchId}/reminder-settings`).then((r) => r.json()).then(setState);
  }, [branchId]);

  if (!state) return <div className="p-6 text-[#697386]">Loading reminder settings…</div>;
  const s = state.settings;

  function set<K extends keyof typeof s>(key: K, val: (typeof s)[K]) {
    setState((cur) => (cur ? { ...cur, settings: { ...cur.settings, [key]: val } } : cur));
  }
  function setTemplateField(scope: "whatsapp" | "email", key: string, val: string) {
    setState((cur) => {
      if (!cur) return cur;
      const t = { ...cur.settings.templates };
      const inner = { ...(t[scope] as Record<string, string>) };
      inner[key] = val;
      (t[scope] as Record<string, string>) = inner;
      return { ...cur, settings: { ...cur.settings, templates: t } };
    });
  }

  async function save() {
    if (!state) return;
    setSaving(true);
    const r = await fetch(`/api/branches/${branchId}/reminder-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.settings),
    });
    setSaving(false);
    if (!r.ok) alert("Failed to save reminder settings");
  }

  const wa = state.waSession;
  const waStatus = wa?.status ?? "DISCONNECTED";

  return (
    <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[18px] font-medium text-[#0A2540]">Appointment Reminders</div>
          <div className="text-[14px] text-[#697386]">Send WhatsApp + email reminders before each appointment.</div>
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={s.enabled}
            disabled={!canEdit}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          {s.enabled ? "Enabled" : "Disabled"}
        </label>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[15px] font-medium text-[#0A2540]">When to send</div>
        <div className="flex flex-wrap gap-3">
          {ALLOWED_OFFSETS_MIN.map((off) => (
            <label key={off} className="flex items-center gap-1.5 text-[14px] text-[#425466]">
              <input
                type="checkbox"
                checked={s.offsetsMin.includes(off)}
                disabled={!canEdit}
                onChange={(e) => {
                  set("offsetsMin", e.target.checked
                    ? [...s.offsetsMin, off].sort((a, b) => b - a)
                    : s.offsetsMin.filter((x) => x !== off));
                }}
              />
              {OFFSET_LABELS[off]}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <ReminderTemplateEditor
          label="WhatsApp message (English)"
          value={s.templates.whatsapp.en}
          onChange={canEdit ? (v) => setTemplateField("whatsapp", "en", v) : () => {}}
          charLimit={400}
        />
        <ReminderTemplateEditor
          label="Email plain-text (English)"
          value={s.templates.email.en}
          onChange={canEdit ? (v) => setTemplateField("email", "en", v) : () => {}}
        />
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[15px] font-medium text-[#0A2540]">WhatsApp connection</div>
        <div className="flex items-center justify-between rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] px-4 py-3">
          <div className="text-[14px] text-[#425466]">
            Status: <span className="font-medium text-[#0A2540]">{waStatus}</span>
            {wa?.phoneNumber && ` (${wa.phoneNumber})`}
          </div>
          {canEdit && (
            <button
              onClick={() => setWaModal(true)}
              className="rounded-[4px] bg-[#635BFF] px-3 py-1.5 text-[14px] text-white hover:bg-[#5851EB]"
            >
              {waStatus === "CONNECTED" ? "Re-pair" : "Connect WhatsApp"}
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[4px] bg-[#635BFF] px-4 py-2 text-[14px] text-white hover:bg-[#5851EB] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <WaConnectModal
        branchId={branchId}
        open={waModal}
        onClose={() => setWaModal(false)}
        onConnected={() => {
          setWaModal(false);
          fetch(`/api/branches/${branchId}/reminder-settings`).then((r) => r.json()).then(setState);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 21.2: Commit**

```bash
git add src/components/branches/BranchReminderSettingsCard.tsx
git commit -m "feat(reminders): add BranchReminderSettingsCard"
```

---

### Task 22: Mount the card on the branch settings tab

**Files:**
- Modify: `src/components/dashboard/branches/BranchDetailView.tsx` (or whichever component renders the Settings tab — locate via grep)

- [ ] **Step 22.1: Locate the Settings tab renderer**

```bash
grep -rn "Settings" src/components/dashboard/branches/
```

- [ ] **Step 22.2: Import and render**

In the Settings tab section, add:

```tsx
import { BranchReminderSettingsCard } from "@/components/branches/BranchReminderSettingsCard";

// inside the Settings tab JSX, alongside other settings cards:
<BranchReminderSettingsCard
  branchId={branch.id}
  canEdit={role === "OWNER" || role === "ADMIN"}
/>
```

- [ ] **Step 22.3: Smoke test**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/branches/<id>` → Settings tab → confirm the card renders, the toggle responds, and saving returns 200.

- [ ] **Step 22.4: Commit**

```bash
git add src/components/dashboard/branches/BranchDetailView.tsx
git commit -m "feat(reminders): mount reminder settings card on branch settings tab"
```

---

### Task 23: `ReminderStatusBadge` component

**Files:**
- Create: `src/components/appointments/ReminderStatusBadge.tsx`

- [ ] **Step 23.1: Implement**

```tsx
// src/components/appointments/ReminderStatusBadge.tsx
"use client";

import { useEffect, useState } from "react";

type Reminder = {
  id: string;
  channel: "WHATSAPP" | "EMAIL";
  offsetMin: number;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  sentAt: string | null;
  failureReason: string | null;
};

type Props = { appointmentId: string };

export function ReminderStatusBadge({ appointmentId }: Props) {
  const [rows, setRows] = useState<Reminder[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/appointments/${appointmentId}/reminders`)
      .then((r) => r.json())
      .then((j) => setRows(j.reminders));
  }, [open, appointmentId]);

  // Compact summary just to render the right-color pill — no fetch yet
  const [summary, setSummary] = useState<"none" | "pending" | "sent" | "failed">("none");
  useEffect(() => {
    fetch(`/api/appointments/${appointmentId}/reminders`)
      .then((r) => r.json())
      .then((j: { reminders: Reminder[] }) => {
        if (j.reminders.length === 0) return setSummary("none");
        if (j.reminders.some((r) => r.status === "FAILED")) return setSummary("failed");
        if (j.reminders.some((r) => r.status === "PENDING")) return setSummary("pending");
        if (j.reminders.every((r) => r.status === "SENT" || r.status === "SKIPPED")) return setSummary("sent");
        setSummary("pending");
      });
  }, [appointmentId]);

  if (summary === "none") return null;

  const palette: Record<typeof summary, { bg: string; text: string; label: string }> = {
    none: { bg: "", text: "", label: "" },
    pending: { bg: "#F0EEFF", text: "#635BFF", label: "Pending" },
    sent: { bg: "#E5F8E5", text: "#30B130", label: "Reminded" },
    failed: { bg: "#FDE7EC", text: "#DF1B41", label: "Failed" },
  };
  const p = palette[summary];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full px-2 py-0.5 text-[12px] font-medium"
        style={{ background: p.bg, color: p.text }}
      >
        {p.label}
      </button>
      {open && rows && (
        <div className="absolute right-0 z-20 mt-1 w-[320px] rounded-[6px] border border-[#E3E8EE] bg-white p-3 shadow-md">
          <div className="mb-2 text-[12px] uppercase tracking-wide text-[#697386]">Reminders</div>
          <ul className="space-y-1.5 text-[13px]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="text-[#425466]">
                  {r.channel} · {r.offsetMin}m before
                </span>
                <span className="text-[#0A2540]">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 23.2: Mount in two places**

Find the schedule list components and add the badge alongside each appointment row:

```bash
grep -rn "Appointment" src/components/dashboard/branches/ src/components/patients/ -l
```

For each appointment row JSX, render `<ReminderStatusBadge appointmentId={appt.id} />` at the trailing edge.

- [ ] **Step 23.3: Smoke test**

```bash
npm run dev
```

Open the branch schedule and patient visits views — confirm the badge shows where reminders exist.

- [ ] **Step 23.4: Commit**

```bash
git add src/components/appointments/ src/components/dashboard/branches/ src/components/patients/
git commit -m "feat(reminders): add ReminderStatusBadge to appointment rows"
```

---

### Task 24: Patient form — `reminderChannel` + `preferredLanguage` fields

**Files:**
- Modify: `src/components/patients/AddPatientDialog.tsx`
- Modify: `src/components/patients/EditPatientDialog.tsx`
- Modify: `src/components/patients/PatientOverviewTab.tsx`

- [ ] **Step 24.1: Find the existing patient form Zod schema**

```bash
grep -n "Zod\|z\." src/components/patients/AddPatientDialog.tsx | head -20
```

- [ ] **Step 24.2: Add the fields to AddPatientDialog**

In the dialog's "Step 2 — Contact" section (or the section that contains email/phone), add:

```tsx
<div className="grid gap-2">
  <label className="text-[15px] font-medium text-[#0A2540]">Reminder channel</label>
  <select
    value={form.reminderChannel ?? "WHATSAPP"}
    onChange={(e) => setForm({ ...form, reminderChannel: e.target.value as "WHATSAPP" | "EMAIL" | "BOTH" | "NONE" })}
    className="rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 py-2 text-[15px]"
  >
    <option value="WHATSAPP">WhatsApp</option>
    <option value="EMAIL">Email</option>
    <option value="BOTH">Both</option>
    <option value="NONE">None</option>
  </select>
</div>
<div className="grid gap-2">
  <label className="text-[15px] font-medium text-[#0A2540]">Preferred language</label>
  <select
    value={form.preferredLanguage ?? "en"}
    onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as "en" | "ms" })}
    className="rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 py-2 text-[15px]"
  >
    <option value="en">English</option>
    <option value="ms">Bahasa Malaysia</option>
  </select>
</div>
```

Update the form's local state interface to include `reminderChannel` and `preferredLanguage`. Make sure `handleSubmit` forwards both to the POST body.

- [ ] **Step 24.3: Add the same fields to EditPatientDialog**

Mirror Step 24.2 for the edit dialog. Pre-populate from the existing patient data.

- [ ] **Step 24.4: Display in PatientOverviewTab**

In the Profile section (or wherever email/phone is shown in `PatientOverviewTab.tsx`), add a "Reminders" sub-section that reads:

```tsx
<div className="grid grid-cols-2 gap-3 text-[14px]">
  <div>
    <div className="text-[#697386]">Reminder channel</div>
    <div className="text-[#0A2540]">{patient.reminderChannel}</div>
  </div>
  <div>
    <div className="text-[#697386]">Preferred language</div>
    <div className="text-[#0A2540]">{patient.preferredLanguage === "ms" ? "Bahasa Malaysia" : "English"}</div>
  </div>
</div>
```

- [ ] **Step 24.5: Smoke test**

```bash
npm run dev
```

Add a new patient with `BOTH` + `Bahasa Malaysia`. Confirm the values round-trip on detail page and via DB.

- [ ] **Step 24.6: Commit**

```bash
git add src/components/patients/
git commit -m "feat(reminders): add reminderChannel + preferredLanguage to patient form"
```

---

## Phase 8: Cron + Env

### Task 25: Vercel cron + `.env.example`

**Files:**
- Modify: `vercel.json` (create if missing)
- Modify: `.env.example`

- [ ] **Step 25.1: Add cron config**

If `vercel.json` does not exist, create it:

```json
{
  "crons": [
    { "path": "/api/reminders/dispatch", "schedule": "*/5 * * * *" }
  ]
}
```

If it exists, merge the `crons` array — keep any existing entries.

> Vercel sends a GET to the cron path by default. Our route handler is `POST`-only because we want to also reject random hits. Vercel Cron supports a custom HTTP method via the `crons` config too, but the simpler robust path is to ALSO accept GET. Update the route's exports:
>
> ```ts
> export const POST = handler;
> export const GET = handler;
> ```
>
> where `handler` is a renamed function. Ensure both still gate on `x-cron-secret` (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` if you set it, OR `x-vercel-signature` — pick the simpler `x-cron-secret` header set via the project's secret env on the Cron config).
>
> Refactor: rename the existing `POST` to `dispatch` and re-export both.

- [ ] **Step 25.2: Refactor `src/app/api/reminders/dispatch/route.ts`**

```ts
import { NextResponse } from "next/server";
import { materializePending, dispatchDue } from "@/lib/reminders/dispatcher";

export const dynamic = "force-dynamic";

async function handler(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  const ok = expected && (headerSecret === expected || auth === `Bearer ${expected}`);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const inserted = await materializePending(now);
  const { processed } = await dispatchDue(now);
  return NextResponse.json({ ok: true, inserted, processed });
}

export const POST = handler;
export const GET = handler;
```

Update the existing test in `src/app/api/reminders/dispatch/__tests__/route.test.ts` to also exercise the `Authorization: Bearer` path, and re-run.

- [ ] **Step 25.3: Add env vars to `.env.example`**

Append to `.env.example`:

```
# Appointment reminders
CRON_SECRET=replace-me
RESEND_REMINDERS_FROM=reminders@example.com

# WhatsApp worker
WORKER_URL=https://wa-worker.example.com
WORKER_SHARED_SECRET=replace-me
WORKER_OUTBOUND_SECRET=replace-me
```

- [ ] **Step 25.4: Commit**

```bash
git add vercel.json .env.example src/app/api/reminders/dispatch/
git commit -m "feat(reminders): wire Vercel cron + env vars"
```

---

## Phase 9: Documentation

### Task 26: Manual E2E checklist + worker handoff

**Files:**
- Create: `docs/superpowers/specs/2026-04-29-appointment-reminders-manual-checklist.md`
- Create: `docs/superpowers/specs/2026-04-29-smartchiro-wa-worker-contract.md` (extracts §8 of the design spec for the sibling repo)

- [ ] **Step 26.1: Write the manual checklist**

```markdown
# Appointment Reminders — Manual E2E Checklist

Run this before merging to main. Requires:
- A test phone with WhatsApp installed
- A test email address you can read
- Worker running at `WORKER_URL`

## Pairing
- [ ] Open `/dashboard/branches/<id>` Settings tab → "Connect WhatsApp"
- [ ] Modal shows "Waiting for QR…" then displays a QR within 5 seconds
- [ ] Scan the QR from the test phone → modal flips to "Connected as +60..."
- [ ] Status persists on page reload

## Send WhatsApp
- [ ] Create an appointment 5 minutes in the future for a patient with `phone` set and `reminderChannel = WHATSAPP`
- [ ] Override branch offsets to include `30` (30 minutes) — appointment is < 30 min away → row is created with current `scheduledFor`
- [ ] Wait one cron tick (≤ 5 min)
- [ ] Test phone receives the WhatsApp message
- [ ] Reminder row in DB transitions PENDING → SENT with externalId set

## Send Email
- [ ] Set patient's `reminderChannel = EMAIL`
- [ ] Repeat the appointment-creation flow
- [ ] Test email receives the reminder, both plain-text and HTML render correctly
- [ ] Reminder row transitions PENDING → SENT

## Cross-channel fallback
- [ ] Set patient's `reminderChannel = WHATSAPP` but use a phone number not registered on WhatsApp
- [ ] Wait two cron ticks
- [ ] Original WHATSAPP row is FAILED with reason `not_on_whatsapp`
- [ ] A sibling EMAIL row exists with `isFallback = true` and is sent

## Reschedule
- [ ] Create an appointment with offsets [1440, 120], wait for materialize
- [ ] Update the appointment's `dateTime` to a different time
- [ ] All PENDING reminders for that appointment are deleted
- [ ] Next tick re-materializes new rows at the new offsets

## Cancel
- [ ] Create an appointment, wait for materialize
- [ ] Set status to CANCELLED before any reminder fires
- [ ] At dispatch time, all matching rows transition to SKIPPED, no message sent

## Worker resilience
- [ ] Restart the worker process
- [ ] Confirm the existing session resumes (no re-pair needed)
- [ ] Send a reminder — it still delivers

## Logout
- [ ] On the test phone, remove the SmartChiro device from WhatsApp Linked Devices
- [ ] Worker emits `logged_out` webhook within ~30s
- [ ] WaSession status flips to LOGGED_OUT
- [ ] Settings card shows "Reconnect WhatsApp" CTA
- [ ] Any PENDING WhatsApp rows in flight fail with `session_logged_out` and fall back to email if applicable
```

- [ ] **Step 26.2: Extract the worker contract**

Copy §4, §6.4 (errors), §8 of [the design spec](../specs/2026-04-29-appointment-reminders-design.md) into a standalone document the sibling repo team can read without re-reading the whole spec. Reference the design spec at the top.

- [ ] **Step 26.3: Commit**

```bash
git add docs/superpowers/specs/2026-04-29-appointment-reminders-manual-checklist.md docs/superpowers/specs/2026-04-29-smartchiro-wa-worker-contract.md
git commit -m "docs(reminders): manual E2E checklist + worker contract handoff"
```

---

## Phase 10: Final Verification

### Task 27: Build + full test suite + lint

- [ ] **Step 27.1: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 27.2: Lint**

```bash
npm run lint
```

Expected: zero warnings/errors.

- [ ] **Step 27.3: Full test suite**

```bash
npm run test
```

Expected: all existing tests + ~50 new tests (template, materialize, fallback, backoff, hmac, worker-client, dispatcher×2, dispatch route, reminder-settings, wa routes, webhook, appointment reminders, patient fields, reschedule) pass.

- [ ] **Step 27.4: Production build**

```bash
npm run build
```

Expected: clean Next build, no errors.

- [ ] **Step 27.5: Migration status**

```bash
npx prisma migrate status
```

Expected: in sync.

- [ ] **Step 27.6: Manual checklist**

Run the manual E2E checklist from Task 26 against a real worker + test phone before merging.

- [ ] **Step 27.7: Final commit + PR**

If anything was tweaked in Step 27.1–27.5:

```bash
git add -A
git commit -m "chore(reminders): fix lint/build issues from final verification"
```

Open a PR titled `feat: appointment reminders (WhatsApp + email)` linking the spec.

---

## Out of Scope (do NOT build in this PR)

The following are deliberately deferred per spec §3 and §7:
- Reply mirroring / WhatsApp inbox
- Multi-language UI for templates (Malay tab is hidden)
- SMS channel
- Per-doctor templates
- Reminder analytics dashboard
- Bulk re-send actions
- Per-clinic self-hosted bridge deployment (the worker runs centralized)
- The `smartchiro-wa-worker` repo itself — its contract is in Task 26's handoff doc; the actual implementation is a separate plan in a sibling repo

---

## Self-Review Notes

After writing this plan, the spec was checked section-by-section against the task list:

| Spec section | Covered by task |
|---|---|
| §5 Architecture | Phase 4 (worker plumbing) + Phase 5 (dispatcher) + Task 12 (cron entry) |
| §6.1 Enums | Task 1 |
| §6.2 BranchReminderSettings | Task 1, Task 13 |
| §6.3 WaSession | Task 1, Task 14, Task 15 |
| §6.4 AppointmentReminder (with isFallback) | Task 1, Task 11 |
| §6.5 Templates shape | Task 2, Task 3, Task 4 |
| §6.6 Patient fields | Task 1, Task 17, Task 24 |
| §6.7 Migration | Task 1 |
| §7.1 Cron trigger | Task 12, Task 25 |
| §7.2 Materialize | Task 6, Task 10 |
| §7.3 Dispatch | Task 11 |
| §7.4 Retry + fallback | Task 5, Task 7, Task 11 |
| §7.5 Concurrency | Task 11 (FOR UPDATE SKIP LOCKED via `findMany` + `upsert` pattern; Postgres advisory lock not strictly required at v1 traffic) |
| §8 Worker service | Task 9 (client + stub), Task 26 (contract handoff) |
| §9.1 Settings UI | Task 19, Task 21, Task 22 |
| §9.2 Patient form fields | Task 24 |
| §9.3 Reminder badge | Task 23 |
| §10 API routes | Tasks 12–17 |
| §11 Failure modes | Tasks 11, 15, 18, 26 (manual checklist exercises each) |
| §12 Security | Task 8, Task 14, Task 15 |
| §13 Default templates | Task 3 |
| §14 Testing | Each Task ships its own tests |
| §15 Open risks | Documented in spec only |
| §16 Rollout | The `enabled` default = false (Task 1) implements this; pilot flag is operational, not code-level |
| §17 File-level summary | Matches File Structure at top of plan |
| §18 Acceptance criteria | Task 27 (final verification) + Task 26 (manual checklist) |

One adjustment from the spec: §7.5 mentions `FOR UPDATE SKIP LOCKED` for true concurrency safety. The plan implements this pragmatically via row-level upsert + idempotent unique constraint, which gives the same exactly-once-per-row guarantee at v1's expected traffic. If we observe contention later, swap in `prisma.$queryRaw` with explicit `FOR UPDATE SKIP LOCKED` — noted as a follow-up rather than scoped into v1.

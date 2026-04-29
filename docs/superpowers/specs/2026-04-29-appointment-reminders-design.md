# Appointment Reminders (WhatsApp + Email) — Design

**Status:** Draft
**Date:** 2026-04-29
**Branch (proposed):** `feat/appointment-reminders`

---

## 1. Problem

Front desks at SmartChiro clinics manually call/message every patient the day before their appointment. No-shows still happen because reminders are inconsistent and depend on staff bandwidth. The roadmap's Phase 4 lists "SMS / email appointment reminders" but clinic owners want this earlier — and they specifically want the WhatsApp messages to come from their **own personal WhatsApp number**, not a generic "SmartChiro Clinic" sender, because:

- Patients trust messages from a number they recognize.
- Replies (reschedule requests, "running late", etc.) land in a chat the owner already manages.
- It feels like the clinic, not a SaaS.

This spec adds automated, schedulable reminders over **WhatsApp + email**, with WhatsApp delivered through an unofficial WhatsApp Web session bound to the branch owner's number.

## 2. Goals

- Send reminders automatically before each `SCHEDULED` appointment, using offsets configured per branch (default 24h + 2h).
- Deliver via WhatsApp using a Baileys session paired to the owner's actual number, with email fallback when WhatsApp is unavailable for a patient.
- Let each branch edit message templates with placeholders (`{patientName}`, `{date}`, etc.) and pick its reminder offsets.
- Keep replies out of scope — the owner handles them on their phone like any normal WhatsApp chat.
- Design the worker boundary so it can later be redeployed as a per-clinic self-hosted bridge with no web-app changes.

## 3. Non-Goals

- Reply mirroring / WhatsApp inbox inside SmartChiro.
- Multi-language UI in the template editor (schema is bilingual-ready; UI ships English-only).
- SMS channel.
- Per-doctor templates (templates are per-branch).
- Reminder analytics dashboard (delivered / read rates over time).
- Bulk reminder operations ("re-send to everyone today") — easy follow-up.
- Per-clinic self-hosted bridge deployment (API designed for it, not built in v1).
- Use of the official WhatsApp Cloud API. Owners want their personal number; we accept the operational risk of an unofficial session.

## 4. Decisions Locked During Brainstorming

| # | Decision | Why |
|---|---|---|
| 1 | **WhatsApp via Baileys / WhatsApp Web session** (not Cloud API) | Owner's personal number is non-negotiable. ToS / ban risk accepted. |
| 2 | **Centralized worker, bridge-ready API** | Lowest user-side friction now; per-clinic bridge later swaps in via config, no rewrite. |
| 3 | **Branch-configurable offsets, default 24h + 2h** | Industry sweet spot, but flexible for owners who disagree. |
| 4 | **Per-patient channel preference + cross-channel fallback** | Best UX + resilience. New `Patient.reminderChannel` field. |
| 5 | **Outbound-only** | Replies stay on the owner's phone. No inbox build, no privacy issues with the bridge reading personal chats. |
| 6 | **Branch-editable templates, EN-only UI v1, BM-ready schema** | Real differentiator vs generic EMRs; Malay variant drops in later without migration. |
| 7 | **Pull-based dispatch (Vercel Cron → API → Worker HTTP)** | Simplest, debuggable; keeps worker stateless so the bridge migration is clean. |

## 5. Architecture Overview

Two services, one queue-less pull loop.

```
                        ┌──────────────────────────┐
[ Vercel Cron / 5min ]──▶  /api/reminders/dispatch │
                        └──────────────────────────┘
                                  │
                  ┌───────────────┼────────────────┐
                  ▼               ▼                ▼
              materialize    pick due rows    render templates
                                  │
                  ┌───────────────┴────────────────┐
                  ▼                                ▼
              EMAIL                            WHATSAPP
            (Resend)                  (HMAC POST → worker /send)
                  │                                │
                  ▼                                ▼
           Patient inbox             smartchiro-wa-worker (Railway/Fly.io)
                                                   │
                                          one Baileys session per branchId
                                                   │
                                                   ▼
                                          Patient WhatsApp
```

- **Next.js app (Vercel)** owns scheduling, decisions, templates, retry logic. Stateless functions, all state in Postgres.
- **`smartchiro-wa-worker` (separate Node service)** owns Baileys sessions and one job: take a `{ branchId, e164, body }`, send it, return the WhatsApp message id or an error. It is **dumb** — no DB access, no scheduling logic, no template rendering.
- **Resend (already integrated)** sends emails directly from the API route.
- **Communication app ↔ worker:** signed HTTPS (HMAC of `body + timestamp`, 60s window). Worker also POSTs back to `/api/wa/webhook` for session status changes and message acks.

## 6. Data Model

### 6.1 New enums

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

### 6.2 New: `BranchReminderSettings`

One row per branch. Created lazily on first settings save (or first dispatch tick — whichever happens first). Defaults baked into the dispatcher so a branch with no settings row still works (disabled by default).

```prisma
model BranchReminderSettings {
  id         String  @id @default(cuid())
  branchId   String  @unique
  branch     Branch  @relation(fields: [branchId], references: [id], onDelete: Cascade)
  enabled    Boolean @default(false)
  offsetsMin Int[]                      // e.g. [1440, 120] for 24h + 2h. Allowed: [10080, 2880, 1440, 240, 120, 30]
  templates  Json                       // see §6.5
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### 6.3 New: `WaSession`

One row per branch tracks the *visible* status of the Baileys session. The auth files (`creds.json`, key state) live on the worker's persistent volume, not in Postgres. `qrPayload` is set briefly during pairing and cleared once `CONNECTED`.

```prisma
model WaSession {
  id          String          @id @default(cuid())
  branchId    String          @unique
  branch      Branch          @relation(fields: [branchId], references: [id], onDelete: Cascade)
  status      WaSessionStatus @default(DISCONNECTED)
  phoneNumber String?         // E.164, set after pairing
  lastSeenAt  DateTime?
  qrPayload   String?         // base64 PNG, set when status=PAIRING, cleared when CONNECTED
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}
```

### 6.4 New: `AppointmentReminder`

The audit-log + queue-row hybrid. One row per *concrete* delivery attempt (channel is concrete — `WHATSAPP` or `EMAIL`, never `BOTH`). The unique constraint makes duplicate sends impossible. Fallback rows are inserted at runtime.

```prisma
model AppointmentReminder {
  id              String          @id @default(cuid())
  appointmentId   String
  appointment     Appointment     @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  channel         ReminderChannel // WHATSAPP | EMAIL only — never BOTH or NONE here
  offsetMin       Int             // 1440, 120, etc.
  scheduledFor    DateTime        // appointment.dateTime - offsetMin
  status          ReminderStatus  @default(PENDING)
  sentAt          DateTime?
  failureReason   String?
  attemptCount    Int             @default(0)
  externalId      String?         // wa msg id or resend id
  isFallback      Boolean         @default(false)  // true = inserted as cross-channel fallback for a sibling row; never spawns its own fallback
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([appointmentId, channel, offsetMin, isFallback])
  @@index([scheduledFor, status])
  @@index([appointmentId])
}
```

### 6.5 `BranchReminderSettings.templates` shape

```ts
type Templates = {
  whatsapp: { en: string; ms: string };           // plain text, max 400 chars enforced server-side
  email:    { en: string; ms: string;             // plain text fallback
              htmlEn: string; htmlMs: string };   // styled HTML for Resend
};
```

Default values are seeded in code (`src/lib/reminders/default-templates.ts`) and used when a branch's templates lack a key. UI ships only the `en` and `htmlEn` editors in v1.

Allowed placeholders (validated on save):

```
{patientName}    {firstName}     {lastName}
{date}           {time}          {dayOfWeek}
{doctorName}     {branchName}    {branchAddress}
{branchPhone}
```

Unknown or unclosed placeholders → 422 on save.

### 6.6 `Patient` additions

```prisma
model Patient {
  // … existing fields …
  reminderChannel   ReminderChannel @default(WHATSAPP)
  preferredLanguage String          @default("en")  // "en" | "ms"
}
```

`reminderChannel` default = `WHATSAPP`; when `phone` is null at send time the dispatcher falls back to email (see §7.3).

### 6.7 Migration

Single migration `20260430120000_add_appointment_reminders`:
- Creates 4 new enums.
- Creates 3 new tables (`BranchReminderSettings`, `WaSession`, `AppointmentReminder`).
- Adds 2 columns to `Patient` with safe defaults — no backfill needed.
- Adds the necessary indexes.

## 7. Reminder Dispatch Flow

### 7.1 Trigger

Vercel Cron, configured in `vercel.json`:

```json
{ "crons": [{ "path": "/api/reminders/dispatch", "schedule": "*/5 * * * *" }] }
```

Endpoint: `POST /api/reminders/dispatch`. Auth: header `x-cron-secret` matching `CRON_SECRET` env. Rejects everything else with 401.

### 7.2 Materialize step (idempotent)

For every appointment where:
- `status = SCHEDULED`
- `dateTime > now()` AND `dateTime <= now() + 8 days` (covers max offset of 7 days + buffer)
- The branch's `BranchReminderSettings.enabled = true`

Insert one `AppointmentReminder` per active offset that:
- Doesn't already exist (`@@unique([appointmentId, channel, offsetMin])`)
- `scheduledFor > now() - 5min` (skip offsets already in the past — happens when an appointment is booked < offset away from its slot)

The channel chosen at materialization time = the patient's *primary* channel resolved from `reminderChannel` + actual contact info:

| `Patient.reminderChannel` | Has phone? | Has email? | Primary channel inserted |
|---|---|---|---|
| `WHATSAPP` | Y | * | `WHATSAPP` |
| `WHATSAPP` | N | Y | `EMAIL` (downgraded — flagged in row's `failureReason` style note? — see §7.4) |
| `EMAIL` | * | Y | `EMAIL` |
| `BOTH` | Y | Y | inserts **two** rows: `WHATSAPP` + `EMAIL` |
| `NONE` | * | * | nothing inserted |
| any | N | N | nothing inserted (skip silently) |

### 7.3 Dispatch step

```sql
SELECT id FROM AppointmentReminder
WHERE status = 'PENDING' AND scheduledFor <= now()
ORDER BY scheduledFor ASC
LIMIT 200
FOR UPDATE SKIP LOCKED;
```

For each row, in a try/catch:

1. **Re-check appointment.** Reload `appointment` + `patient` + `branch` + `doctor`. If `appointment.status != SCHEDULED` → mark `SKIPPED` with reason, done.
2. **Resolve template.** Pick `templates[channel][patient.preferredLanguage]` falling back to `en` then to default-templates module.
3. **Render.** Substitute placeholders; reject if any `{xxx}` remains.
4. **Send.**
   - `EMAIL` → `resend.emails.send({ from, to: patient.email, subject, html, text })`. `from` = `reminders@<configured-domain>`. `subject` = first line of email body or constant default.
   - `WHATSAPP` → POST to worker `${WORKER_URL}/branches/${branchId}/send` with `{ to: e164(patient.phone), body: rendered }` + HMAC auth. Worker returns `{ msgId }` or `{ error: { code, message } }`.
5. **Update row.** On success → `status=SENT`, `sentAt=now()`, `externalId=<id>`. On failure → see §7.4.

All steps inside a per-row transaction so a crash mid-loop doesn't lose state.

### 7.4 Retry & cross-channel fallback

On send failure:

```ts
attemptCount += 1
status = (attemptCount >= MAX_ATTEMPTS) ? 'FAILED' : 'PENDING'
scheduledFor = now() + backoff(attemptCount)   // 5min, 30min, 2h
failureReason = error.message
```

`MAX_ATTEMPTS = 3`.

**Cross-channel fallback** (in addition to retry):
Trigger when `attemptCount == 1` and the failure is one of these *terminal-on-this-channel* causes:
- WhatsApp: `not_on_whatsapp`, `session_disconnected`, `session_logged_out`, `invalid_e164`
- Email: `invalid_email`, `bounce_hard`

If the patient has a contact for the *other* channel **and** their `reminderChannel != NONE`, insert a sibling `AppointmentReminder` row for that channel with same `scheduledFor`, `attemptCount=0`, `status=PENDING`, **`isFallback=true`**. The fallback row is picked up on the next tick (≤5min later). The original row stays as `FAILED` for audit.

A fallback row's own failures never spawn another fallback — the dispatcher checks `if (row.isFallback) skip-fallback`. This prevents infinite ping-pong.

### 7.5 Concurrency

`FOR UPDATE SKIP LOCKED` (Postgres) prevents two concurrent dispatcher runs from picking the same row. Vercel Cron is at-least-once but every 5 minutes — collisions only matter if a tick takes longer than 5min, which shouldn't happen for ≤200 rows. Cap each tick at 200 rows; if more are due, the next tick picks them up.

## 8. Worker Service: `smartchiro-wa-worker`

### 8.1 Tech

- Node 20 + TypeScript, Express or Hono.
- `@whiskeysockets/baileys` (active, well-maintained Baileys fork) — pinned exact version.
- `qrcode` to render the QR PNG.
- Persistent volume mounted at `/data/sessions`. Each branch gets `/data/sessions/<branchId>/{creds.json,keys/}`.
- Deployed standalone (Railway / Fly.io). One process. Memory budget ~128MB per active session; v1 fine for tens of branches.

### 8.2 Endpoints

All routes require HMAC: `x-signature` = `hex(HMAC_SHA256(secret, timestamp + "." + rawBody))`, `x-timestamp` within 60s, replay-protected by an in-memory LRU of seen signatures.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/branches/:branchId/session` | `{}` | `202 { status: "PAIRING" }` and posts `WaSessionStatusEvent { status: "PAIRING", qrPayload: "<base64png>" }` to app webhook |
| `GET`  | `/branches/:branchId/status` | — | `{ status, phoneNumber?, lastSeenAt? }` |
| `POST` | `/branches/:branchId/send`   | `{ to: "+60123456789", body: "..." }` | `200 { msgId }` or `4xx { error: { code, message } }` |
| `POST` | `/branches/:branchId/logout` | `{}` | `200 { ok: true }` |
| `GET`  | `/healthz` | — | `200 { ok: true }` (no HMAC, for the platform) |

### 8.3 Session lifecycle events posted to app

`POST {APP_URL}/api/wa/webhook` with HMAC signed by the worker (separate `WORKER_OUTBOUND_SECRET` shared with the app). Event types:

```ts
type WaSessionEvent =
  | { type: "qr",          branchId: string; qrPayload: string }
  | { type: "connected",   branchId: string; phoneNumber: string }
  | { type: "disconnected",branchId: string; reason: string }
  | { type: "logged_out",  branchId: string; reason: string }
  | { type: "ack",         branchId: string; msgId: string; ack: "sent"|"delivered"|"read"|"failed" }
```

App handler updates `WaSession` and (for `ack`) the matching `AppointmentReminder.externalId`'s row.

### 8.4 Error codes returned by `/send`

```
not_on_whatsapp        — number didn't resolve on WA
invalid_e164           — phone format invalid
session_disconnected   — session not currently CONNECTED
session_logged_out     — pairing was revoked, needs re-scan
rate_limited           — Baileys self-throttled
unknown                — anything else, includes the underlying error message
```

These map to the cross-channel fallback rules in §7.4.

### 8.5 Deployment & secrets

- Repo path: a sibling repo `smartchiro-wa-worker` (not in this monorepo — it has different dependencies and a separate deployment lifecycle).
- Env: `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `APP_URL`, `PORT`, `SESSIONS_DIR=/data/sessions`.
- App-side env additions: `WORKER_URL`, `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `CRON_SECRET`, `RESEND_REMINDERS_FROM` (e.g. `reminders@smartchiro.org`).

> **Spec note:** the worker repo is a follow-on deliverable, but its API contract is fully specified here so the app can be built and tested against a stub.

## 9. UI Changes

### 9.1 Branch Settings — new "Appointment Reminders" card

Location: `/dashboard/branches/[branchId]` → Settings tab. New card under existing settings.

Sections:

1. **Master toggle** — `enabled` (Switch). Disabled = no materialization, no sends, existing `PENDING` rows skipped at dispatch with reason "branch disabled".
2. **Offsets** — checkbox group: `7 days`, `48 hours`, `24 hours`, `4 hours`, `2 hours`, `30 minutes`. Default: `24 hours`, `2 hours`. At least one must remain checked when `enabled = true`.
3. **Templates editor** — tabbed: `WhatsApp 24h`, `WhatsApp 2h`, `Email 24h`, `Email 2h`. Each tab has a textarea + a row of clickable placeholder pills that insert at cursor + a "Preview" panel rendering with a fake appointment. Whatsapp textareas show a live char count (target ≤ 400). Tabs only render for the offsets currently checked.
4. **WhatsApp Connection** — shows `WaSession.status` with appropriate UI:
   - `DISCONNECTED` / `LOGGED_OUT`: button **Connect WhatsApp** → opens modal that calls `POST /api/wa/connect`, polls `GET /api/wa/status` every 2s, displays QR PNG when received, transitions to "Connected as +60..." on success.
   - `PAIRING`: shows QR live (via existing modal or inline).
   - `CONNECTED`: shows "Connected as `+60XXXXXXXXX` — last seen 2 minutes ago" + **Disconnect** + **Reconnect (re-pair)** buttons.

Visibility: card is visible to `OWNER` and `ADMIN` of the branch. `DOCTOR`s see a read-only "Reminders are enabled" / "disabled" line.

### 9.2 Patient form — 2 new fields

In the existing `AddPatientDialog` and `EditPatientDialog` (Step 2 — Contact, since it relates to comms preferences):

- **Reminder channel** — Select with options `WhatsApp`, `Email`, `Both`, `None`. Default `WhatsApp`.
- **Preferred language** — Select with `English`, `Bahasa Malaysia`. Default `English`.

`PatientDetailPage` Profile tab gains a small "Reminders" sub-section showing both fields with the existing inline-edit pattern.

### 9.3 Appointment cards / table — small badge

In the branch Schedule tab (`BranchScheduleTab`) and patient Visits tab, each appointment row gets a tiny status badge for its reminders:
- ⏳ `Pending` — at least one PENDING reminder
- ✅ `Reminded` — all reminders SENT
- ⚠ `Failed` — any FAILED reminder
- `—` (none) when `enabled=false` for the branch

Clicking the badge opens a popover listing each reminder row with channel, offset, status, sentAt, failureReason. Read-only in v1.

## 10. New / Updated API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/reminders/dispatch` | `x-cron-secret` | Vercel Cron entry-point — materialize + dispatch |
| `GET`  | `/api/branches/[branchId]/reminder-settings` | session, branch member | Read settings + WaSession status |
| `PUT`  | `/api/branches/[branchId]/reminder-settings` | session, OWNER/ADMIN | Update `enabled`, `offsetsMin`, `templates` |
| `POST` | `/api/branches/[branchId]/wa/connect` | session, OWNER/ADMIN | Calls worker `POST /branches/:id/session`, returns `{ status: "PAIRING" }` |
| `GET`  | `/api/branches/[branchId]/wa/status` | session, branch member | Polled by the connect modal; returns `WaSession` row |
| `POST` | `/api/branches/[branchId]/wa/disconnect` | session, OWNER/ADMIN | Calls worker `POST /branches/:id/logout`, sets WaSession to DISCONNECTED |
| `POST` | `/api/wa/webhook` | HMAC | Worker → app event sink (see §8.3) |
| `GET`  | `/api/appointments/[id]/reminders` | session, branch member | Returns the `AppointmentReminder` rows for one appointment (used by the badge popover) |

Existing routes touched:
- `POST/PUT /api/patients/...` — accept the two new fields with validation.

## 11. Failure Modes & Edge Cases

| Failure | Handled by |
|---|---|
| Worker process down / unreachable | Email path unaffected. WhatsApp HTTP call fails → row becomes `PENDING`/retries → eventually fallback to email if cross-channel rules trigger. Status banner on dashboard if `WaSession.lastSeenAt > 5min ago` and status was `CONNECTED`. |
| Session logged out (owner removed device on phone) | Worker emits `logged_out` webhook → `WaSession.status = LOGGED_OUT` → in-flight WhatsApp sends fail with `session_logged_out` → cross-channel fallback to email kicks in. UI shows "WhatsApp disconnected — reconnect" banner on the branch settings page. |
| Appointment cancelled / rescheduled after reminder rows materialized | Dispatcher checks `appointment.status` at send time; if changed → row marked `SKIPPED`. Reschedule is a status-preserving update of `dateTime`; we handle this by **deleting all PENDING reminders for the appointment and re-materializing on next tick** (handled in the existing `PATCH /api/patients/[id]/visits/...` if it exists, otherwise added to the appointment update path). |
| Appointment booked < smallest offset away | Materialize step skips offsets where `scheduledFor` would be in the past. |
| Patient `phone == null` & `reminderChannel == WHATSAPP` | Materialize falls through to `EMAIL` (table in §7.2). |
| Patient `email == null` & `reminderChannel == EMAIL` | Materialize falls through to `WHATSAPP`. If both null → no reminders. |
| Two cron ticks running simultaneously | `FOR UPDATE SKIP LOCKED` → no double-send. |
| Bad placeholder in template | Save-time validator rejects with 422; if a stray `{xxx}` somehow renders at send time, dispatcher logs the row as `FAILED` with reason `template_render_error`, does not retry. |
| Resend hard bounce | Resend webhook? — out of scope v1; we only see synchronous send result. Hard bounce reported sync → `FAILED`. |
| Owner tries to send to themself / a non-WA number | `not_on_whatsapp` → cross-channel fallback. |
| Branch with `enabled=true` but no `WaSession` connected | WhatsApp rows fail with `session_disconnected` → fallback to email. Settings UI shows persistent "Connect WhatsApp" CTA. |

## 12. Security & Privacy

- **Worker auth:** every request HMAC-signed both directions; replay window 60s.
- **Worker isolation:** worker has no DB credentials. The only state it reads/writes is its own session files. This bounds blast radius if compromised.
- **Patient PII over the wire:** worker receives `to` (E.164 phone) and `body` (rendered text). No patient name or ID. The body itself contains the patient's name in the greeting — unavoidable, that's the point. TLS-only.
- **Session files at rest:** stored on the worker's persistent volume only; not backed up to user-accessible storage. Loss of the volume = re-pair from scratch (acceptable).
- **WhatsApp ToS:** acknowledged. We surface the risk in the connect modal: *"WhatsApp may disconnect this session at their discretion. Use at your own risk."*
- **Patient consent:** `reminderChannel = NONE` is the patient's opt-out. Front desk is responsible for honoring patient requests; reminders themselves include a sentence inviting opt-out by reply (handled organically by the owner since replies aren't mirrored).
- **Rate limiting:** Baileys throttles internally; the dispatcher caps at 200 rows / tick. No per-branch quota in v1.
- **Audit:** every reminder attempt is a row in `AppointmentReminder` with status, timestamps, failure reason, and external id. That's the audit log.

## 13. Default Templates (shipped)

```ts
// src/lib/reminders/default-templates.ts

export const DEFAULTS: Templates = {
  whatsapp: {
    en: "Hi {firstName}, this is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}. Reply or call {branchPhone} to reschedule. — {branchName}",
    ms: "Hai {firstName}, ini peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}. Balas atau hubungi {branchPhone} untuk menukar tarikh. — {branchName}"
  },
  email: {
    en: "Hi {firstName},\n\nThis is a reminder of your appointment at {branchName} with {doctorName} on {dayOfWeek}, {date} at {time}.\n\nLocation: {branchAddress}\nQuestions? Call {branchPhone}.\n\nSee you soon,\n{branchName}",
    ms: "Hai {firstName},\n\nIni peringatan temujanji anda di {branchName} dengan {doctorName} pada {dayOfWeek}, {date} pukul {time}.\n\nLokasi: {branchAddress}\nSoalan? Hubungi {branchPhone}.\n\nJumpa lagi,\n{branchName}",
    htmlEn: "<!-- styled HTML version of `en` with logo + Stripe-inspired layout -->",
    htmlMs: "<!-- styled HTML version of `ms` -->"
  }
};
```

## 14. Testing

Reuse the project's Vitest + Neon-integration pattern (`vitest.config.ts`, existing test fixtures).

### 14.1 Unit

- `src/lib/reminders/materialize.ts` — given an appointment + settings + patient, produces the right set of `AppointmentReminder` rows. Cover the channel-resolution table from §7.2.
- `src/lib/reminders/templates.ts` — placeholder rendering, validator, missing-placeholder rejection.
- `src/lib/reminders/fallback.ts` — given a failure code, decides whether to enqueue a fallback row.
- `src/lib/reminders/backoff.ts` — retry timing.

### 14.2 Integration (against test Neon DB)

- `POST /api/reminders/dispatch` — happy path: 3 patients with various channel preferences → correct set of `SENT` rows + correct mock calls to worker stub + Resend stub.
- Dispatch with appointment cancelled mid-flight → `SKIPPED`.
- Dispatch with WA failure → row fails → fallback row inserted → next tick sends email.
- Dispatch with fallback row failing → no second fallback (`isFallback` guard).
- Concurrent dispatch invocations → `FOR UPDATE SKIP LOCKED` prevents double-send.
- `GET/PUT /api/branches/[id]/reminder-settings` — validation (offsets non-empty, placeholders valid).
- `POST /api/wa/webhook` — HMAC verification, status transitions, ack updates row.

### 14.3 Worker

The worker repo has its own Vitest setup. We test:
- HMAC verification (positive + negative).
- `/send` against a Baileys mock (in-memory) — returns `{msgId}`.
- `/send` against a Baileys mock that rejects with `not_on_whatsapp`.
- Session status transitions emitted to the app webhook.

### 14.4 Manual / E2E

Cannot automate the WhatsApp leg (Meta's servers, real devices). Spec ships a manual checklist:
1. Pair a dev phone via the connect modal — QR appears, session goes `CONNECTED`.
2. Create an appointment 5 min in the future, set offset to `0` for testing — receive WhatsApp.
3. Restart the worker process — session auto-resumes from disk, next reminder still delivers.
4. Disable WhatsApp on the dev phone for the test number — reminder fails with `not_on_whatsapp`, fallback email arrives.
5. "Log out from this device" on the phone → `LOGGED_OUT` event → banner appears.

## 15. Open Risks (accepted)

- **Account ban:** the owner's WhatsApp number could be flagged by Meta. Mitigated only by clinic-side discipline (low message volume, patients who actually want reminders). Documented in the connect modal.
- **Worker single-process scaling:** ~tens of branches per worker process. When that becomes a bottleneck, options are (a) shard worker by `branchId`, (b) move to per-clinic bridge — both compatible with this design.
- **Vercel Cron 5-min granularity:** offset of "30 minutes" can drift up to 5 minutes early/late. Acceptable for reminders; documented.
- **WhatsApp message delivery is fire-and-forget at the app level** — the `ack` webhook can update the row asynchronously, but the dispatcher considers the row `SENT` once the worker returns 200 with a `msgId`. If the message later fails delivery silently, we don't retry. Documented; v2 could trigger a retry on `ack: "failed"`.

## 16. Rollout

1. Ship with `BranchReminderSettings.enabled = false` for all existing branches.
2. Ship the worker first (sibling repo), get a stable URL.
3. Run with one pilot clinic for 1–2 weeks before opening the toggle in the UI. Keep a feature flag (`FEATURE_REMINDERS`) on the settings card so it's invisible to other clinics during pilot.
4. After pilot, remove the flag.

## 17. File-Level Summary

```
prisma/
  migrations/20260430120000_add_appointment_reminders/  ── new
  schema.prisma                                          ── enums + 3 models + 2 Patient cols

src/
  app/api/
    reminders/dispatch/route.ts                          ── new (Vercel Cron entry)
    branches/[branchId]/reminder-settings/route.ts       ── new (GET, PUT)
    branches/[branchId]/wa/connect/route.ts              ── new (POST)
    branches/[branchId]/wa/status/route.ts               ── new (GET)
    branches/[branchId]/wa/disconnect/route.ts           ── new (POST)
    wa/webhook/route.ts                                  ── new (worker → app)
    appointments/[id]/reminders/route.ts                 ── new (GET)
    patients/...                                         ── modified to accept 2 new fields
  components/
    branches/BranchReminderSettingsCard.tsx              ── new
    branches/WaConnectModal.tsx                          ── new
    appointments/ReminderStatusBadge.tsx                 ── new
    patients/AddPatientDialog.tsx                        ── modified
    patients/EditPatientDialog.tsx                       ── modified
    patients/PatientOverviewTab.tsx (or Profile)         ── modified (display reminder fields)
  lib/
    reminders/dispatcher.ts                              ── new (orchestration)
    reminders/materialize.ts                             ── new (rule logic)
    reminders/templates.ts                               ── new (render + validate)
    reminders/fallback.ts                                ── new
    reminders/backoff.ts                                 ── new
    reminders/default-templates.ts                       ── new
    wa/worker-client.ts                                  ── new (HMAC + fetch wrapper)
    wa/hmac.ts                                           ── new
  types/
    reminder.ts                                          ── new
vercel.json                                              ── add cron config
.env.example                                             ── add new vars

(separate repo) smartchiro-wa-worker/                    ── new sibling repo
```

## 18. Acceptance Criteria

- An owner can enable reminders for their branch, pair WhatsApp via QR, and edit templates with a live preview.
- Creating a `SCHEDULED` appointment in the future causes the right `AppointmentReminder` rows to materialize on the next dispatch tick.
- Both WhatsApp and email reminders send at the configured offsets.
- Cancelling or rescheduling an appointment correctly skips or re-times pending reminders.
- A patient with `reminderChannel = NONE` receives nothing.
- A WhatsApp delivery failure to a patient who has email triggers an email fallback within ≤ 10 minutes (one cron tick).
- Restarting the worker process resumes existing sessions without re-pairing.
- All new endpoints reject unauthorized requests with 401.
- All new code is covered by unit tests, with the integration suite green against the test Neon DB.

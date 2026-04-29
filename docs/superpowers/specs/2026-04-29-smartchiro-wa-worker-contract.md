# `smartchiro-wa-worker` — Service Contract

This document specifies the API and behavior the SmartChiro Next.js app expects from the sibling repo `smartchiro-wa-worker`. Build the worker against this contract.

**Source of truth:** This contract is extracted from §4 and §8 of [docs/superpowers/specs/2026-04-29-appointment-reminders-design.md](./2026-04-29-appointment-reminders-design.md).

## 1. Purpose

The worker is a long-lived Node process that holds **one Baileys WhatsApp Web session per branch** (keyed by `branchId`) and exposes an HMAC-signed HTTP API that the SmartChiro app calls to:

- Start a session (returns a QR for pairing)
- Check session status
- Send a WhatsApp message
- Log out / re-pair

The worker also POSTs lifecycle events back to the app via a webhook.

The worker is **dumb**: it has no database access, no scheduling logic, no template rendering. It takes `{ branchId, to, body }` and either delivers the message or returns a typed error.

## 2. Runtime / Tech

- Node 20 + TypeScript
- Express or Hono
- `@whiskeysockets/baileys` (pinned exact version)
- `qrcode` for QR PNG generation
- Persistent volume mounted at `/data/sessions` — auth files at `/data/sessions/<branchId>/{creds.json,keys/}`
- Deployment target: Railway, Fly.io, or any platform that supports persistent volumes
- One process. Memory budget ~128 MB per active session; v1 fine for tens of branches.

## 3. Authentication

Every inbound request must be HMAC-signed:

```
x-signature  = hex(HMAC_SHA256(secret, timestamp + "." + raw_body))
x-timestamp  = epoch seconds, must be within ±60s of server time
```

Replay-protected by an in-memory LRU of seen `(timestamp, signature)` pairs.

Reject `401` on:

- Missing or malformed headers
- Stale or future timestamp (> 60s)
- Signature mismatch
- Replayed signature

The shared secret comes from env `WORKER_SHARED_SECRET` and matches the app's value.

## 4. Endpoints

| Method | Path | Body | Auth | Returns |
|---|---|---|---|---|
| `POST` | `/branches/:branchId/session` | `{}` | HMAC | `202 { status: "PAIRING" }` and posts `WaSessionStatusEvent { type: "qr", qrPayload: "<base64png>" }` to app webhook |
| `GET`  | `/branches/:branchId/status` | — | HMAC | `200 { status, phoneNumber?, lastSeenAt? }` |
| `POST` | `/branches/:branchId/send` | `{ to: "+60123456789", body: "..." }` | HMAC | `200 { msgId }` or `4xx { error: { code, message } }` |
| `POST` | `/branches/:branchId/logout` | `{}` | HMAC | `200 { ok: true }` |
| `GET`  | `/healthz` | — | — | `200 { ok: true }` (for the platform) |

Status enum values: `DISCONNECTED | PAIRING | CONNECTED | LOGGED_OUT`.

## 5. Outbound: Session events posted to app

The worker POSTs to `${APP_URL}/api/wa/webhook` with HMAC signed using a separate `WORKER_OUTBOUND_SECRET`.

Event shapes:

```ts
type WaSessionEvent =
  | { type: "qr",          branchId: string; qrPayload: string }
  | { type: "connected",   branchId: string; phoneNumber: string }
  | { type: "disconnected",branchId: string; reason: string }
  | { type: "logged_out",  branchId: string; reason: string }
  | { type: "ack",         branchId: string; msgId: string; ack: "sent"|"delivered"|"read"|"failed" }
```

- Emit `qr` immediately when starting a session (the QR PNG, base64-encoded).
- Emit `connected` when pairing succeeds; include the E.164 phone the session is tied to.
- Emit `disconnected` on transient drops (network, phone offline). Worker will auto-resume from disk on its own.
- Emit `logged_out` only on **permanent** session loss (user removed device, Meta enforcement). The worker should NOT auto-retry — the app will surface a "Reconnect" CTA.
- `ack` is best-effort delivery confirmation. Used by the app to update message status; not used for retry decisions.

## 6. Error codes returned by `POST /send`

```
not_on_whatsapp        — number didn't resolve on WhatsApp
invalid_e164           — phone format invalid (not parseable as E.164)
session_disconnected   — session not currently CONNECTED
session_logged_out     — pairing was revoked, needs re-scan
rate_limited           — Baileys self-throttled or hit Meta soft limit
unknown                — anything else; include underlying message for debugging
```

The app uses these codes to decide whether to retry, fail, or fall back to email. Don't invent new codes — if a new failure mode emerges, map it to `unknown` with a descriptive message.

## 7. Session lifecycle

1. App calls `POST /branches/:id/session` → worker checks for existing auth files at `/data/sessions/<id>/`.
2. If files exist, attempt resume. On success, emit `connected`. On failure (logged out), emit `logged_out` and start fresh pairing.
3. If no files, generate fresh pairing → emit `qr`.
4. After successful pair, persist auth files to disk and emit `connected`.
5. Worker holds the session. Network blips trigger Baileys reconnect; emit `disconnected` then `connected` as state transitions.
6. App calls `POST /send` → worker uses the active session to send. Returns `msgId` or error.
7. Baileys delivery acks come back asynchronously → worker emits `ack` event with the `msgId` from step 6.

## 8. Persistence

- One directory per branch under `SESSIONS_DIR` (default `/data/sessions`).
- Auth files: `creds.json` + `keys/` (Baileys signal protocol state).
- Loss of the volume = re-pair from scratch (acceptable, documented).
- Do NOT write any patient data, message bodies, or app state to disk. The worker's only durable state is per-session auth.

## 9. Environment

```
PORT                    # listening port
SESSIONS_DIR            # default /data/sessions
WORKER_SHARED_SECRET    # for inbound HMAC verification (matches app)
WORKER_OUTBOUND_SECRET  # for outbound webhook signing (matches app)
APP_URL                 # base URL of the SmartChiro Next.js app
```

## 10. Deployment notes

- Single process. If/when scaling becomes a bottleneck (~tens of active sessions per process), shard by `branchId` across multiple workers behind a router. The contract above does not assume any specific deployment topology.
- The future "per-clinic bridge" model uses the SAME contract — a clinic-side bridge would expose the same endpoints and call the app's webhook. App-side code does not need to change.

## 11. Out of scope

- Reply mirroring: the worker MUST ignore inbound messages. It is a send-only service. Patient replies stay on the owner's phone.
- Multi-account-per-branch: one Baileys session per `branchId`. New session = `POST /branches/:id/session` overwrites.
- Message templates / rendering: the app sends the final rendered text; the worker forwards as-is.
- Retry logic: the worker returns errors; the app handles retry and fallback.

## 12. Testing harness

The worker repo's own test suite should:

- Unit-test HMAC verification (positive + negative)
- Mock Baileys with an in-memory stub for `/send` happy path and `not_on_whatsapp` failure path
- Manual: pair a real dev phone, send a real message, observe ack flow

The SmartChiro app's reminder tests use a separate stub (`src/lib/wa/worker-stub.ts`) and do NOT exercise the worker — that's covered manually via the checklist at [2026-04-29-appointment-reminders-manual-checklist.md](./2026-04-29-appointment-reminders-manual-checklist.md).

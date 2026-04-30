# `smartchiro-wa-worker` — Implementation Plan

**Status:** Draft
**Date:** 2026-04-30
**Repo:** sibling directory `~/Desktop/smartchiro-wa-worker` (NOT inside the SmartChiro monorepo)
**Branch in this repo (companion docs only):** `feat/wa-worker-handoff`
**Contract:** [2026-04-29-smartchiro-wa-worker-contract.md](./2026-04-29-smartchiro-wa-worker-contract.md) — that doc defines the external API; this doc defines the inside.

---

## 1. Problem

The SmartChiro app already calls into a WhatsApp worker over signed HTTPS — the dispatcher, settings UI, connect modal, and webhook are all wired against the contract. But the worker service doesn't exist yet, so `WORKER_URL` points nowhere. Clicking **Connect WhatsApp** in the branch settings returns a 502, and the dispatcher's WhatsApp leg fails to `session_disconnected` and falls back to email.

This spec ships the worker — a small Node service running Baileys — as a separate repo, deployable to Railway, runnable locally alongside SmartChiro for browser testing.

## 2. Goals

- Implement the 4 HMAC-signed endpoints + outbound webhook from the contract doc, against a real `@whiskeysockets/baileys` session.
- One process, `Map<branchId, WASocket>`, persistent credentials at `<SESSIONS_DIR>/<branchId>/{creds.json, keys/}`, sessions auto-restored on process restart.
- Local dev: `npm run dev` on port `8787` works alongside SmartChiro on `:3000`. Real QR appears in the SmartChiro modal, real WhatsApp delivers after pairing.
- Production: deploys to Railway with a persistent volume mounted at `/data/sessions`. Always-on (no idle-sleep).
- Vitest suite covering HMAC, error mapping, and Baileys-mock send flows. Manual E2E covered by the existing checklist at [2026-04-29-appointment-reminders-manual-checklist.md](./2026-04-29-appointment-reminders-manual-checklist.md).

## 3. Non-Goals (v1)

- Multi-process / horizontal scaling. One process per deployment, sharded later if needed.
- WhatsApp Cloud API path. Worker is Baileys-only; Cloud API would be a separate service.
- Inbound message handling / reply mirroring. Worker drops everything inbound.
- Media attachments. Text body only.
- Per-branch rate limiting beyond Baileys' internal throttle.
- A web UI for the worker. All operations go through SmartChiro + logs.
- Database access from the worker. Stays "dumb" per the contract.

## 4. Locked Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Sibling repo, not in SmartChiro monorepo** | Different runtime constraints (long-lived, persistent disk, native deps). Contract §10. |
| 2 | **Hono** over Express | Smaller, native fetch types, faster cold starts, plays well with Railway nixpacks. |
| 3 | **Railway** for hosting (~$5/mo) | Persistent volumes built-in, no cold-start sleep, GitHub-driven deploys. Render free / Fly free idle-sleep is unacceptable — WS must stay live. |
| 4 | **Pinned exact Baileys version** | The fork churns; lock to known-good. |
| 5 | **HMAC mirrors SmartChiro byte-for-byte** | Reuse `hex(HMAC_SHA256(secret, timestamp + "." + rawBody))` + 60s replay window + LRU. Identical algo on both sides. |
| 6 | **Single process for all branches in v1** | `Map<branchId, WASocket>`, ~128MB per session, "tens of branches" budget per contract §10. |
| 7 | **Worker writes only auth files to disk** | No message bodies, no patient data persisted. Contract §8. |

## 5. Architecture

```
                         ┌──────────────────────┐
[SmartChiro on Vercel]──▶│   Hono server :8787  │
   signed HTTPS          └──────────┬───────────┘
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                  ┌───────────────┐   ┌──────────────────┐
                  │  HMAC verify  │   │  session.ts      │
                  │  middleware   │   │  Map<branchId,   │
                  └───────────────┘   │  WASocket>       │
                                      └────┬─────────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          ▼                                 ▼
                  ┌───────────────┐                  ┌─────────────┐
                  │ Baileys WS    │                  │ Disk        │
                  │ to WhatsApp   │                  │ <SESSIONS_  │
                  └───────────────┘                  │   DIR>/<id>/│
                          │                          │ creds.json  │
                          ▼                          │ keys/*      │
                  ┌───────────────┐                  └─────────────┘
                  │ webhook.ts    │──signed HTTPS──▶ {APP_URL}/api/wa/webhook
                  │ (lifecycle    │
                  │  events)      │
                  └───────────────┘
```

## 6. Repo Layout

```
~/Desktop/smartchiro-wa-worker/
├── package.json
├── tsconfig.json
├── Dockerfile                 # Railway uses this if present, otherwise nixpacks
├── railway.json               # build + persistent volume config
├── .env.example
├── .gitignore                 # data/sessions, .env, node_modules, dist
├── README.md                  # local dev + Railway deploy steps
├── data/
│   └── sessions/              # gitignored, mounted as Railway volume in prod
├── src/
│   ├── server.ts              # Hono app + route registration + 404/500
│   ├── env.ts                 # zod-validated env loader
│   ├── hmac.ts                # signRequest + verifyRequest (mirror of SmartChiro)
│   ├── session.ts             # Baileys session manager
│   ├── webhook.ts             # signed POST to APP_URL/api/wa/webhook
│   ├── errors.ts              # Baileys → contract error code mapping
│   └── routes/
│       ├── session.ts         # POST /branches/:id/session
│       ├── status.ts          # GET /branches/:id/status
│       ├── send.ts            # POST /branches/:id/send
│       ├── logout.ts          # POST /branches/:id/logout
│       └── healthz.ts         # GET /healthz (no auth)
└── tests/
    ├── hmac.test.ts
    ├── errors.test.ts
    └── send.test.ts           # Baileys mock
```

## 7. File-by-file Responsibilities

### `src/env.ts`
Loads + validates env via zod. Throws on startup if missing. Exports a typed config:
```ts
{
  PORT: number;            // default 8787
  SESSIONS_DIR: string;    // default ./data/sessions (dev) / /data/sessions (prod)
  WORKER_SHARED_SECRET: string;
  WORKER_OUTBOUND_SECRET: string;
  APP_URL: string;
}
```

### `src/hmac.ts`
Two functions, identical algorithm to SmartChiro's `src/lib/wa/hmac.ts`:
- `signRequest({ secret, body, timestamp }) → hex string`
- `verifyRequest({ secret, body, signature, timestamp, nowEpoch }) → { ok: true } | { ok: false, message }`
- 60s replay window (timestamp must be within ±60s of now)
- LRU of seen `(timestamp, signature)` pairs (size 1000) for replay protection

### `src/session.ts`
The heart of the worker. Exposes:
```ts
async function startSession(branchId: string): Promise<void>
async function getStatus(branchId: string): Promise<{
  status: "DISCONNECTED" | "PAIRING" | "CONNECTED" | "LOGGED_OUT";
  phoneNumber?: string;
  lastSeenAt?: string;
}>
async function send(branchId: string, to: string, body: string): Promise<
  | { ok: true; msgId: string }
  | { ok: false; code: WorkerErrorCode; message: string }
>
async function logout(branchId: string): Promise<void>
async function restoreAllSessions(): Promise<void> // called on boot
```

Internals:
- `Map<branchId, { sock: WASocket; status: WaStatus; phoneNumber?: string; lastSeenAt?: Date }>`
- Uses Baileys `useMultiFileAuthState(<SESSIONS_DIR>/<branchId>)` for credential persistence
- Subscribes to `connection.update`, `creds.update`, `messages.update` events
- Translates events → calls into `webhook.ts` to POST `qr`, `connected`, `disconnected`, `logged_out`, `ack` to the app
- On boot: scans `<SESSIONS_DIR>/*` and calls `startSession` for each branch with existing creds

### `src/webhook.ts`
```ts
async function postEvent(event: WaSessionEvent): Promise<void>
```
- Serializes event to JSON
- Signs with `WORKER_OUTBOUND_SECRET` using same HMAC scheme
- POSTs to `${APP_URL}/api/wa/webhook` with `x-signature` and `x-timestamp` headers
- Best-effort: log + drop on failure (don't crash the session)
- Retries on 5xx with exponential backoff up to 3 attempts

### `src/errors.ts`
Maps Baileys errors / Boom outputs to the 6 contract error codes:
- E.164 parse failure → `invalid_e164`
- `onWhatsApp([num])` returns empty → `not_on_whatsapp`
- Session not in `CONNECTED` state when `/send` called → `session_disconnected`
- Connection close with `DisconnectReason.loggedOut` → translated to `logged_out` event
- Baileys throws "rate limit" / Boom 429 → `rate_limited`
- Anything else → `unknown` with the original error message

### `src/server.ts`
- Creates Hono app
- Registers HMAC middleware on `/branches/*` (skips `/healthz`)
- Mounts the 5 route handlers
- 404 + 500 fallbacks
- Calls `session.restoreAllSessions()` on startup
- Listens on `env.PORT`

## 8. Local Dev Workflow

```bash
# Terminal 1 — SmartChiro
cd ~/Desktop/SmartChiro
# .env additions:
#   WORKER_URL=http://localhost:8787
#   WORKER_SHARED_SECRET=<long-random>
#   WORKER_OUTBOUND_SECRET=<another-long-random>
npm run dev

# Terminal 2 — worker
cd ~/Desktop/smartchiro-wa-worker
# .env:
#   PORT=8787
#   SESSIONS_DIR=./data/sessions
#   WORKER_SHARED_SECRET=<same as SmartChiro>
#   WORKER_OUTBOUND_SECRET=<same as SmartChiro>
#   APP_URL=http://localhost:3000
npm run dev
```

Browser flow:
1. `/dashboard/branches/[id]/settings` → **Reminders** card → click **Connect WhatsApp**
2. Modal POSTs to SmartChiro's `/api/branches/[id]/wa/connect`, which signs and calls worker's `POST /branches/:id/session`
3. Worker starts Baileys, emits `qr` event back to SmartChiro's `/api/wa/webhook`, which writes `WaSession.qrPayload`
4. Modal polls `/api/branches/[id]/wa/status` every 2s, sees the QR, renders the PNG
5. Phone scans QR. Baileys emits `connection.update` → worker emits `connected` event → `WaSession.status = CONNECTED`
6. Modal sees `CONNECTED`, closes
7. Trigger `POST /api/reminders/dispatch` (curl with `x-cron-secret`) → real WhatsApp arrives on the patient's phone

## 9. Railway Deployment

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "startCommand": "node dist/server.js",
    "restartPolicyType": "ALWAYS"
  }
}
```

`Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
```

Railway setup steps:
1. Create new project, link to the `smartchiro-wa-worker` GitHub repo
2. Add a **Volume** mounted at `/data/sessions`, size 1GB (plenty for tens of branches)
3. Set env vars: `PORT=8787`, `SESSIONS_DIR=/data/sessions`, `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `APP_URL=https://your-vercel-app.vercel.app`
4. Set `WORKER_URL` on the Vercel side to `https://<railway-public-domain>`
5. Generate a public domain in Railway settings (Railway gives you `<svc>.up.railway.app`)
6. Push to main → Railway auto-deploys
7. Verify `/healthz` returns 200, then test the connect flow from the deployed SmartChiro

## 10. Data Model

The worker holds NO database state. Only:
- In-memory: `Map<branchId, SessionState>` lost on restart, restored from disk
- On disk (volume): `<SESSIONS_DIR>/<branchId>/creds.json` + `<SESSIONS_DIR>/<branchId>/keys/*`

All authoritative state (`WaSession`, `AppointmentReminder`, etc.) lives in the SmartChiro Postgres DB. The worker tells the app what changed via the webhook; the app records it.

## 11. Testing

### 11.1 Unit (Vitest)
- `tests/hmac.test.ts`: positive verification, stale timestamp, signature mismatch, replay rejection
- `tests/errors.test.ts`: each Baileys-error → contract-code mapping

### 11.2 Integration with Baileys mock
- `tests/send.test.ts`: stub `makeWASocket` to return a fake socket whose `sendMessage` resolves with `{ key: { id: "fake_id" } }` → assert `send()` returns `{ ok: true, msgId: "fake_id" }`
- Same with `sendMessage` rejecting with various errors → assert correct error code

### 11.3 Manual E2E
Reuse the existing checklist at [2026-04-29-appointment-reminders-manual-checklist.md](./2026-04-29-appointment-reminders-manual-checklist.md). Five-step path:
1. Pair a dev phone via the connect modal
2. Create an appointment 5 min in the future, set offset to 30 for testing
3. Wait for cron tick (or trigger manually) → real WhatsApp arrives
4. Restart the worker process → session auto-resumes from disk → next reminder still delivers
5. "Log out from this device" on the phone → `logged_out` event → SmartChiro shows reconnect banner

## 12. Failure Modes

| Failure | Handled by |
|---|---|
| Worker process down / unreachable | SmartChiro's `sendWhatsApp` returns `session_disconnected` (network error) → row retries → eventually fallback to email if cross-channel rules trigger. Stale-session amber banner appears in the SmartChiro UI. |
| Volume corrupted / wiped | All sessions lose creds → next `/send` fails with `session_logged_out` → owner re-pairs via the modal |
| Baileys version pin breaks | Roll forward in a fresh deploy; auth files survive across compatible versions |
| WhatsApp soft-bans the number | All `/send` returns `rate_limited` → SmartChiro retries per backoff → eventually `unknown`. Operationally, owner stops sending and waits 24h |
| Two webhook events POSTed in wrong order | Idempotent handler in SmartChiro: `connected` always sets status, `disconnected` only sets status if not already `LOGGED_OUT` |

## 13. Security & Privacy

- **No DB credentials in worker.** Blast radius bounded if compromised.
- **No patient PII over the wire** beyond `to` (E.164 phone) and `body` (already-rendered text containing the patient's first name). No IDs, no metadata.
- **HMAC both directions** with separate secrets — leaking one doesn't compromise the other.
- **Auth files at rest** in the persistent volume only. Not backed up to user-accessible storage.
- **TLS-only:** Railway provides public HTTPS by default; the worker should reject non-TLS in prod via reverse proxy headers (Railway sets `X-Forwarded-Proto: https`).
- **WhatsApp ToS risk** acknowledged. Surface in UI per spec §12 of the appointment-reminders design.

## 14. Open Risks (accepted)

- **Account ban:** the personal number can be flagged. Mitigation: clinic discipline, low message volume, opt-in patients only.
- **Session expiry:** "Linked Devices" sessions periodically expire. Worker emits `logged_out`, UI prompts re-pair. Not automatable.
- **Single-process bottleneck:** ~tens of branches per worker. When that's reached, options are (a) shard worker by `branchId`, (b) move to per-clinic bridges. Both are compatible with the current contract.
- **Baileys is unofficial.** Meta has shown willingness to break protocol details. Pin the version, watch for upstream advisories, plan a Cloud API migration path if it becomes untenable.

## 15. Rollout

1. Build the worker repo, run locally, confirm pair + send + restart-resume.
2. Deploy to Railway. Verify `/healthz` reachable.
3. Set Vercel env: `WORKER_URL=<railway-public-url>` for SmartChiro.
4. Pair the dev / pilot clinic's number from production SmartChiro.
5. Run with that one branch for 1–2 weeks behind the existing `BranchReminderSettings.enabled = false` default.
6. Open the toggle to additional branches as confidence builds.

## 16. Acceptance Criteria

- All 5 endpoints (`session`, `status`, `send`, `logout`, `healthz`) implemented and HMAC-verified per the contract doc.
- All 5 webhook event types fire at the right times.
- All 6 error codes returned correctly from `POST /send`.
- Session credentials persist across worker restarts.
- Vitest suite green (HMAC, error mapping, Baileys mock).
- Manual checklist passes end-to-end against deployed SmartChiro + Railway worker.
- README documents local dev + Railway deploy in under 100 lines.

## 17. File-Level Summary

```
smartchiro-wa-worker/                         ── new sibling repo
  package.json
  tsconfig.json
  Dockerfile
  railway.json
  .env.example
  .gitignore
  README.md
  src/env.ts
  src/hmac.ts
  src/session.ts
  src/webhook.ts
  src/errors.ts
  src/server.ts
  src/routes/session.ts
  src/routes/status.ts
  src/routes/send.ts
  src/routes/logout.ts
  src/routes/healthz.ts
  tests/hmac.test.ts
  tests/errors.test.ts
  tests/send.test.ts

SmartChiro/                                    ── this repo, no code changes needed
  .env                                         ── set WORKER_URL after deploy
  docs/superpowers/specs/
    2026-04-30-wa-worker-implementation.md     ── this doc (added)
```

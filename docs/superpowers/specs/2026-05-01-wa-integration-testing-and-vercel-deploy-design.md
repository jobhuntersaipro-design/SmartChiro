# WhatsApp Integration Testing & Vercel Deploy — Design

**Status:** Draft (2026-05-01)
**Predecessors:**
- `2026-04-29-smartchiro-wa-worker-contract.md` — the HTTP/HMAC contract between app and worker
- `2026-04-29-appointment-reminders-design.md` — the reminders feature this integration powers
- `2026-04-30-wa-worker-implementation.md` — the worker repo's own architecture and Railway deploy

This spec covers the **app-side** test harness and the **first prod deploy**. It does **not** re-spec the worker, its Vitest suite, or the Railway service.

---

## 1. Problem

The SmartChiro Next.js app is wired to a Baileys-based WhatsApp worker over signed HTTPS, but:

1. There is no automated end-to-end test of the integration. The wire format (HMAC over `timestamp.body`), the webhook handler at `/api/wa/webhook`, and the `Connect WhatsApp` UI flow are exercised only by manual clicking, which doesn't catch HMAC drift, schema regressions, or status-transition bugs.
2. Real WhatsApp delivery cannot be Playwright-tested — Baileys requires a phone scanning a QR code. Existing manual checks (`docs/.../2026-04-29-appointment-reminders-manual-checklist.md`) are detailed but ad-hoc.
3. The Vercel production deploy involves five interdependent secrets across two services. Without a checklist, the first deploy is a half-day debugging session.

This spec ships three independent layers that, together, give the team enough confidence to deploy and operate the integration.

---

## 2. Goals

1. **Automated UI confidence.** A Playwright suite that exercises the real `/api/wa/webhook` and `/api/branches/:id/wa/*` routes end-to-end against a mock worker, runnable locally with `npm run test:e2e`. Catches HMAC drift, schema regressions, status-transition bugs, and UI-state bugs without a phone or Railway.
2. **Pre-deploy real-WhatsApp confidence.** One command (`npm run smoke:wa`) that hits the deployed Railway worker with a pre-paired session and proves a real WhatsApp message gets through.
3. **First-deploy correctness on Vercel.** A short, prescriptive runbook (env vars, cron, secret rotation) so the Vercel deploy is a 5-minute task.

---

## 3. Non-Goals (v1)

- Automating QR-scan (cannot be automated; phone-side action).
- Testing inbound messages, media, or group messages — out of contract scope.
- Re-spec'ing the worker, its Vitest suite, or the Railway deploy (covered in `2026-04-30-wa-worker-implementation.md`).
- Resolving the in-flight "QR event not reaching DB" debugging issue — that's a worker-side fix that must land before this spec is rolled out (see §9).
- CI integration (GitHub Actions) for Playwright. Local-only in v1.
- Cross-browser testing (Firefox, WebKit). Chromium only in v1.
- Worker autoscaling or multi-region. Single Railway service is sufficient for tens of branches.

---

## 4. Architecture — Three Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 1: Playwright UI E2E                          (LOCAL ONLY) │
│                                                                  │
│   Playwright ──▶ Next.js (dev :3000) ◀──── HMAC ──┐              │
│                       │                            │             │
│                       │ Prisma                     │             │
│                       ▼                            │             │
│                   Neon (test branch)               │             │
│                                                    │             │
│                  Mock Worker (Hono :8788) ─────────┘             │
│                  POST /__test/emit drives webhooks back          │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Layer 2: npm run smoke:wa                          (PRE-DEPLOY)  │
│                                                                  │
│   Local script ──HMAC──▶ Railway worker (real Baileys)           │
│                                │                                 │
│                                ▼                                 │
│                          WhatsApp servers ──▶ smoke phone        │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Layer 3: Vercel deploy checklist                   (RUNBOOK)     │
│                                                                  │
│   8-step checklist run at first deploy + every secret rotation   │
└──────────────────────────────────────────────────────────────────┘
```

The three layers are independent and provide complementary signal:

- Layer 1 catches **code regressions** (changes to handlers, types, components).
- Layer 2 catches **deploy/integration regressions** (worker is unreachable, secrets mismatched, Baileys session expired).
- Layer 3 catches **config drift** (a missing Vercel env var on first deploy or after rotation).

---

## 5. Layer 1 — Playwright UI E2E

### 5.1 Files added to the SmartChiro repo

```
e2e/
├── .auth/                  # gitignored — saved login state
├── fixtures/
│   ├── mock-worker.ts      # Hono :8788 — the 4 contract endpoints + /__test/* hooks
│   └── seed.ts             # truncates WA tables, ensures test branch exists
├── auth.setup.ts           # logs in once, saves storageState
├── connect-flow.spec.ts    # QR → CONNECTED happy path
├── status-polling.spec.ts  # CONNECTED → DISCONNECTED via webhook
├── logout-flow.spec.ts     # user-initiated logout
├── reminder-send.spec.ts   # cron → /send → ack
└── webhook-hmac.spec.ts    # 401 on missing/bad/stale signature
playwright.config.ts        # webServer: next dev + mock worker, chromium only
.env.test                   # WORKER_URL=http://localhost:8788, test DB, mirrored secrets
```

`package.json` gains:
- devDep: `@playwright/test`
- scripts: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`

`.gitignore` gains: `e2e/.auth/`, `playwright-report/`, `test-results/`.

### 5.2 Mock worker behavior (`e2e/fixtures/mock-worker.ts`)

A Hono server listening on `MOCK_WORKER_PORT` (default 8788). In-memory `Map<branchId, {status, phoneNumber?, lastSeenAt?}>` plus a send-log array.

| Path | Auth | Behavior |
|---|---|---|
| `POST /branches/:id/session` | Inbound HMAC | State → `PAIRING`. 202 `{ok: true}`. |
| `GET /branches/:id/status` | Inbound HMAC | Return current state, or `{status: "NONE"}`. |
| `POST /branches/:id/send` | Inbound HMAC | Push `{branchId, to, body, ts}` to send-log. Return `{msgId: "mock-<uuid>"}`. |
| `POST /branches/:id/logout` | Inbound HMAC | State → `LOGGED_OUT`. 200. |
| `GET /healthz` | none | 200. |
| `POST /__test/emit` | none (loopback only) | Body `{type, branchId, ...}`. Mock signs with `WORKER_OUTBOUND_SECRET` and POSTs to `${APP_URL}/api/wa/webhook`. |
| `POST /__test/reset` | none (loopback only) | Clear in-memory state + send-log. |
| `GET /__test/sends` | none (loopback only) | Return send-log JSON. |

The mock **imports the same `signRequest`/`verifyRequest` from `src/lib/wa/hmac.ts`** that the app uses. This is the load-bearing detail: keep the wire format real so Layer 1 can catch HMAC bugs.

The `/__test/*` endpoints bind only to `127.0.0.1` and refuse if `process.env.NODE_ENV === "production"` to prevent footguns.

### 5.3 Test harness

- **DB:** dedicated **Neon test branch** named `smartchiro-test`. `.env.test` provides `DATABASE_URL_TEST` pointing at it. `globalSetup` runs `prisma migrate deploy` then `e2e/fixtures/seed.ts` to wipe `WaSession` and `AppointmentReminder` rows and ensure a known test user (`e2e@smartchiro.test`) and test branch (`e2e-test-branch`) exist.
- **Auth:** `auth.setup.ts` is a Playwright project (not a test) that logs in as the seed user once and saves `storageState` to `e2e/.auth/user.json`. All other specs reference it via `playwright.config.ts` `use.storageState`.
- **Process orchestration:** `playwright.config.ts` `webServer` array starts both `next dev` (3000) and `tsx e2e/fixtures/mock-worker.ts` (8788). Playwright kills both on teardown.
- **Browsers:** chromium only.

### 5.4 Test surface (5 specs, ~12 cases)

| Spec | Cases | Proves |
|---|---|---|
| `connect-flow.spec.ts` | 2 | Modal opens → POST `/session` lands on mock with valid HMAC → `__test/emit` sends `qr` → QR PNG renders → emit `connected` → CONNECTED badge + masked phone shown |
| `status-polling.spec.ts` | 2 | UI polls `/status` every 2s; state changes pushed via `__test/emit` are reflected in UI |
| `logout-flow.spec.ts` | 2 | Click Disconnect → mock receives `/logout` with valid HMAC → emit `logged_out` → UI flips to disconnected |
| `reminder-send.spec.ts` | 3 | Trigger `/api/reminders/dispatch` with `CRON_SECRET` → `__test/sends` shows `{to: <e164>, body: <rendered template>}` → reminder row transitions `PENDING → SENT`. Also: emit `ack(failed)` → row transitions to `FAILED` with `failureReason="wa_ack_failed"`. The current `ReminderStatus` enum is `PENDING/SENT/FAILED/SKIPPED` — there is no `DELIVERED` state in v1; `ack(delivered)` arrives but is intentionally not persisted. |
| `webhook-hmac.spec.ts` | 3 | Direct POST to `/api/wa/webhook` with missing / bad / stale (>60s) signature → 401. Good signature → 200. |

---

## 6. Layer 2 — `npm run smoke:wa`

### 6.1 What it does

A Node script (`scripts/smoke-wa.mjs` in the SmartChiro repo) that hits the deployed Railway worker with a pre-paired session and proves real WhatsApp delivery still works. Run **manually before every prod deploy** and after **any secret rotation**.

### 6.2 Pre-paired session

A reserved Branch row with a known `id`, created **once per deployment** as a manual setup step (not via `prisma/seed.ts` — production seed should not include test fixtures).

One-time setup (operator runs this after step 8 of §7.1):

1. Log in to SmartChiro production as the operator's `OWNER` account.
2. Create a new Branch via the existing UI: name `Smoke Test`, reminders **disabled**, no patients. Copy the resulting branch `id` from the URL.
3. Set the Vercel env var `SMOKE_BRANCH_ID=<that-id>` (Production scope) for use by the smoke script *and* set the same value in the operator's local `.env`. (The script reads from local env; the Vercel value is documentation so anyone can find the branch later.)
4. Open the branch's WhatsApp connect modal → scan QR with the smoke phone → wait for `CONNECTED`.
5. Session creds now live at `/data/sessions/<smoke-branch-id>/` on the Railway volume and survive redeploys.

If WhatsApp ever invalidates this session (rare but happens), the smoke script fails loudly with `RE-PAIR REQUIRED` and the operator repeats step 4.

### 6.3 Script flow

```
1. Load env: WORKER_URL, WORKER_SHARED_SECRET, SMOKE_BRANCH_ID, SMOKE_PHONE_NUMBER
2. GET  /branches/:id/status   →  assert status === "CONNECTED"
                                  (else print "RE-PAIR REQUIRED" + exit 1)
3. POST /branches/:id/send     →  body { to, body: "SmartChiro smoke <ISO>" }
                                  assert 200 + msgId
4. Print "✅ Smoke OK: msgId=<...>" + exit 0.
```

Three signed HTTPS calls; ~5 seconds end-to-end. Non-zero exit on any failure.

Ack verification (delivered/read) is **not** asserted in the script — it depends on webhook delivery latency and the `phone is online` race. Operators verify ack visually via Vercel logs after running the script.

### 6.4 Env additions

`.env.example` and the Vercel deploy doc gain:
- `SMOKE_BRANCH_ID=smoke-test-branch`
- `SMOKE_PHONE_NUMBER=+60xxxxxxxxx` (E.164)

These are **operator-local only** — not required at runtime by the app.

---

## 7. Layer 3 — Vercel deploy checklist

Lives at `docs/superpowers/specs/vercel-deploy-runbook.md`. Run at first deploy and on every secret rotation.

### 7.1 First deploy (8 steps)

1. **Push worker to GitHub** (as private repo `smartchiro-wa-worker`).
2. **Generate three secrets** locally:
   ```sh
   openssl rand -hex 32   # WORKER_SHARED_SECRET
   openssl rand -hex 32   # WORKER_OUTBOUND_SECRET
   openssl rand -hex 32   # CRON_SECRET
   ```
3. **Provision Railway** per `2026-04-30-wa-worker-implementation.md` §9. Set worker env: `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `APP_URL=<vercel-prod-url>`, `PORT=8787`, `SESSIONS_DIR=/data/sessions`, `LOG_LEVEL=info`. Mount persistent volume at `/data/sessions`. Generate public domain. Redeploy.
4. **Set Vercel env (Production scope only):**
   - Database: `DATABASE_URL`
   - Auth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - Worker: `WORKER_URL=<railway-url>`, `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`
   - Cron: `CRON_SECRET`
   - Email: `RESEND_API_KEY`, `RESEND_REMINDERS_FROM`
   - Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
   - Billing (if live): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
5. **Run migrations** locally before deploy: `DATABASE_URL=<prod> npx prisma migrate deploy`. Do **not** run migrations from the build pipeline.
6. **Deploy** via `vercel --prod` or merge to `main`.
7. **Smoke checks:**
   - `curl https://<railway>/healthz` → 200
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://<vercel>/api/reminders/dispatch` → 200
   - `npm run smoke:wa` → ✅ (after step 8)
8. **Pair the smoke branch** per §6.2. Re-run `npm run smoke:wa` to confirm.

### 7.2 Cron verification (after deploy)

Vercel Dashboard → project → **Cron Jobs** tab → confirm `/api/reminders/dispatch` shows `*/5 * * * *` and the **last run** updates within 5 min. Tail logs for the corresponding invocation; expect `200` and a JSON body summarizing materialized + dispatched counts.

### 7.3 Secret rotation procedure

Rotate one secret at a time:

1. Generate new value (`openssl rand -hex 32`).
2. **`WORKER_SHARED_SECRET`** (app→worker): set on **Railway first** (the verifier), wait for redeploy, then set on Vercel and deploy.
3. **`WORKER_OUTBOUND_SECRET`** (worker→app): set on **Vercel first** (the verifier), wait for redeploy, then set on Railway and redeploy.
4. **`CRON_SECRET`** (Vercel cron→app): both sides live on Vercel and read from the same env var. Just update the value in Vercel and redeploy — no cross-service race. (The cron config in `vercel.json` does **not** reference the secret; Vercel injects `Authorization: Bearer $CRON_SECRET` automatically from the env var.)
5. After each rotation, run `npm run smoke:wa` (for the worker secrets) or trigger one cron-style invocation manually (for `CRON_SECRET`) to confirm.

For the cross-service worker secrets (steps 2 and 3), there is a brief 401 window (~30s during the in-between redeploy) because our HMAC code accepts exactly one secret at a time. **Plan those rotations during low-traffic windows.** A "support both for 5 min" mode is YAGNI for v1.

### 7.4 What's intentionally NOT in this checklist

- Vercel preview deploys hitting a real worker. Preview/Development scopes leave `WORKER_URL` unset; the app no-ops the worker call and the UI shows "WhatsApp unavailable in preview." A unit test guards this.
- Sentry / monitoring — separate spec.

---

## 8. Failure modes & risks

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Smoke session expires (WhatsApp invalidates the linked device) | `npm run smoke:wa` exits non-zero with `RE-PAIR REQUIRED` | Re-pair manually via the UI. Documented as a periodic chore (~weeks–months cadence). |
| 2 | HMAC secret drift after rotation | Vercel logs show `webhook 401`; smoke fails | §7.3 procedure. Run smoke immediately after each rotation. |
| 3 | Mock worker port collision (8788 in use locally) | Playwright `globalSetup` throws `EADDRINUSE` | Configurable via `MOCK_WORKER_PORT` in `.env.test` |
| 4 | Test DB drift (test branch missing latest migration) | Tests fail with Prisma `column does not exist` | `globalSetup` runs `prisma migrate deploy` against `DATABASE_URL_TEST` before any spec runs |
| 5 | Vercel preview deploy talks to prod Railway worker | Stray messages to clinics | `WORKER_URL` set in **Production scope only**. App gracefully no-ops if unset. Unit test guards this. |
| 6 | Smoke phone gets reminder spam | Spam to operator's number | `Smoke Test Branch` has reminders **disabled** by default and no patients |
| 7 | Auth storage state expires | Tests redirect to `/login` and fail | `auth.setup.ts` regenerates storage state on every cold suite run |
| 8 | `CRON_SECRET` leaked via Vercel logs | Manual log audit | `/api/reminders/dispatch` already validates header before any logging. `webhook-hmac.spec.ts` adds an explicit "no header in logs" check |

**Accepted risks:**
- Smoke is manual, not in CI. Acceptable for a clinic SaaS at this stage; revisit when there's a second engineer or before public launch.
- The test surface is chromium-only. Sufficient for an internal-facing dashboard tool.

---

## 9. Rollout order

Strict ordering — each step depends on the previous.

1. **Land worker hotfixes.** Commit + push the uncommitted `dotenv/config`, logger bind fix, and connection-update error logging on `~/Desktop/smartchiro-wa-worker`. Resolve the live "QR event not reaching DB" bug as part of this. *(Out of scope of this spec but blocks rollout.)*
2. **Push worker to GitHub** as a private repo.
3. **Provision Railway** per `2026-04-30-wa-worker-implementation.md` §9, with persistent volume.
4. **Land this spec's Layer 1** (Playwright + mock worker) on a feature branch in SmartChiro. PR-review and merge before touching prod.
5. **Vercel first deploy** using §7.1 checklist.
6. **Pair smoke session** (§6.2) on the deployed Railway worker.
7. **Run `npm run smoke:wa`** — confirm a real WhatsApp arrives at the smoke phone.
8. **Pair a real clinic** end-to-end via the Connect WhatsApp UI. Verify a sent reminder lands.
9. **Watch Vercel cron logs for 24h** to confirm `/api/reminders/dispatch` is firing every 5 min and dispatch counts make sense for the seeded data.

If any step fails, **stop and fix that layer before proceeding** — do not stack debt.

---

## 10. Open questions / accepted decisions

- **Q:** Should Playwright run in CI on every PR? **A (v1):** No. Local-only via `npm run test:e2e`. Revisit when a second engineer joins.
- **Q:** Should the smoke script verify ack delivery? **A:** No. Ack arrives async via webhook; asserting it would couple the script to webhook latency and the phone's online state. Operators verify via Vercel logs.
- **Q:** Should the mock worker live in the worker repo so it can be reused for worker-side tests? **A:** No. The mock is an *app-side* fixture that imports `src/lib/wa/hmac.ts` directly. The worker repo has its own Vitest suite (per `2026-04-30-wa-worker-implementation.md` §11.1). Different tools, different jobs.
- **Q:** What happens if the HMAC implementation in `src/lib/wa/hmac.ts` ever drifts from the worker's `src/hmac.ts`? **A:** Layer 1 won't catch this (mock uses app's version on both sides). Layer 2 will catch it on first run after a rotation. Documented as a known limitation. Could be improved by publishing the HMAC code as a tiny shared npm package, but that's YAGNI for v1.

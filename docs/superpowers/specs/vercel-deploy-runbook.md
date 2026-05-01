# Vercel Production Deploy Runbook

Run this checklist:
- On the **first** Vercel deploy that includes the WhatsApp worker integration.
- After **any** secret rotation involving `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, or `CRON_SECRET`.

## First deploy (8 steps)

1. **Push the worker repo to GitHub** as private repo `smartchiro-wa-worker`. Confirm it includes the latest committed hotfixes.
2. **Generate three secrets locally:**
   ```sh
   openssl rand -hex 32   # WORKER_SHARED_SECRET
   openssl rand -hex 32   # WORKER_OUTBOUND_SECRET
   openssl rand -hex 32   # CRON_SECRET
   ```
   Store them in your password manager. They will be set on both Vercel and Railway.
3. **Provision Railway** per `2026-04-30-wa-worker-implementation.md` §9. Set worker env: `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `APP_URL=<vercel-prod-url>`, `PORT=8787`, `SESSIONS_DIR=/data/sessions`, `LOG_LEVEL=info`. Mount persistent volume at `/data/sessions` (1 GB). Generate public domain. Redeploy. Curl `https://<railway>/healthz` → expect `200`.
4. **Set Vercel env (Production scope only)** at Vercel Dashboard → project → Settings → Environment Variables:
   - Database: `DATABASE_URL`
   - Auth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - Worker: `WORKER_URL=<railway-url>`, `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`
   - Cron: `CRON_SECRET`
   - Email: `RESEND_API_KEY`, `RESEND_REMINDERS_FROM`
   - Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
   - Billing (if live): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
5. **Apply migrations to prod DB locally** before deploying:
   ```sh
   DATABASE_URL=<prod-connection-string> npx prisma migrate deploy
   ```
   Do not run migrations from the Vercel build pipeline.
6. **Deploy:** `vercel --prod` or merge to `main`.
7. **Smoke checks:**
   ```sh
   curl https://<railway>/healthz                                            # → 200
   curl -H "Authorization: Bearer $CRON_SECRET" https://<vercel>/api/reminders/dispatch  # → 200
   ```
8. **Pair the smoke session** (one-time): log in as your operator account, create branch `Smoke Test`, copy its id, set `SMOKE_BRANCH_ID` in Vercel env, open Connect WhatsApp on that branch, scan QR. Run `npm run smoke:wa` locally → expect `✅ Smoke OK`.

## Cron verification

Vercel Dashboard → project → **Cron Jobs** tab → confirm `/api/reminders/dispatch` shows `*/5 * * * *` and the **last run** updates within 5 min. Tail logs for the corresponding invocation; expect `200` and a JSON body summarizing materialized + dispatched counts.

## Secret rotation

Rotate one secret at a time.

1. Generate new value: `openssl rand -hex 32`.
2. Apply per secret type:
   - **`WORKER_SHARED_SECRET`** (app→worker): set on **Railway first** (verifier), wait for redeploy live, then set on Vercel and deploy.
   - **`WORKER_OUTBOUND_SECRET`** (worker→app): set on **Vercel first** (verifier), wait for redeploy live, then set on Railway and redeploy.
   - **`CRON_SECRET`** (Vercel cron→app): both sender (cron) and receiver (route) are on Vercel, reading the same env var. Update the value in Vercel and redeploy. Vercel injects `Authorization: Bearer $CRON_SECRET` automatically — there is no second place to update.
3. Run `npm run smoke:wa` (for `WORKER_*` rotations) or trigger one cron-style invocation manually (for `CRON_SECRET`):
   ```sh
   curl -H "Authorization: Bearer $NEW_CRON_SECRET" https://<vercel>/api/reminders/dispatch
   ```

For cross-service rotations, expect ~30 s of 401s during the in-between redeploy. Plan for low-traffic windows.

## Troubleshooting

- **All webhooks return 401** after a deploy → secret drift. Compare the active value in Vercel Settings → Environment Variables and Railway service variables. Re-set if mismatched.
- **`/api/reminders/dispatch` returns 200 but no messages sent** → check Vercel logs for the dispatch JSON body. `inserted=0, processed=0` means no eligible reminders (no SCHEDULED appointments in the next-offset window) — usually expected. `inserted>0, processed=0` means materialized but worker call failed — check Railway logs.
- **Worker `/healthz` returns 502** → Railway service is restarting. Check service logs.
- **Smoke script prints `RE-PAIR REQUIRED`** → WhatsApp invalidated the linked device. Re-pair in the SmartChiro UI; no code change needed.

## Out of scope

- Vercel preview deploys hitting the real worker. Preview/Development scopes leave `WORKER_URL` unset; the app no-ops the worker call and the UI shows "WhatsApp unavailable in preview." See `src/lib/wa/worker-client.ts`.
- Sentry / monitoring — separate spec.

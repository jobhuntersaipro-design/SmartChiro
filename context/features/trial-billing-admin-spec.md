# Trial, Stripe billing, AI limits and super admin (+ viewer polish)

Owner request, 2026-10-03:

1. No warning when uploading an X-ray.
2. Always show a loading state while an annotated X-ray loads.
3. Always show a progress bar while the AI analyses an X-ray.
4. Always show a measurement summary with suggestions for doctors.
5. Limit AI analysis to 10 X-rays per day per doctor, adjustable by super admins.
6. A super admin page to manage who signs up.
7. 30-day free trial for new sign-ups, then RM550/month or RM6000/year (save RM600, 9%), linked to Stripe. Trial and paid plan have the same features.

## What shipped

**Upload (1).** The "doesn't look like an X-ray" confirm (colourfulness / phone-screenshot heuristics) is gone; the AI pelvis check rejects unsuitable films with reasons instead.

**Loading (2).** `FilmLoadingOverlay` covers the viewer (single view, grid cells, compare page) until the film has loaded, with an error message if it fails. Cached films that load before hydration are handled.

**Progress (3).** `analysePelvis` reports `{stage, done, total}` as each stage starts and each model call ends (load, check, 3 detect runs, up to 7 refinements). `POST /api/viewer/detect-landmarks` with `Accept: application/x-ndjson` streams `progress` lines then one `done` line carrying the status and body the JSON answer would have (checks before the analysis still answer plain JSON). `AnalysisProgressCard` shows the stage, a percentage that eases between real steps, and Cancel.

**Summary (4).** `pelvicSummary()` (`src/lib/pelvic-summary.ts`): one finding per measured parameter (out-of-range first, patient side and amount) and suggested next checks — leg length check for uneven femoral heads; innominate rotation for crests uneven against the femoral head line (ICHD is measured against that line, so a short leg alone leaves it level); Gonstead PI/AS for innominate length, IN/EX for ilium width; pelvic rotation for DOCS; a reliability caveat for SAM; calibrate when in px; place missing landmarks. Shown at the top of Pelvic analysis with Copy (for visit notes); the panel opens on Measurements for films that have landmarks. Suggestions only: "confirm clinically".

**Daily AI limit (5).** `User.aiDailyLimit` (default 10) different X-rays per clinic day (Asia/Kuala_Lumpur); re-running an X-ray already analysed today is free. `AiUsage` rows are written when an analysis places landmarks. Over the limit → 429 `DAILY_LIMIT`. The success toast shows "N of 10 X-rays analysed today".

**Super admin (6).** `SUPER_ADMIN_EMAILS` (comma-separated). `/dashboard/admin`: sign-up stats, search, plan filter, each user's clinics and roles, plan state, AI use today / limit; Manage → daily AI limit (0–1000), trial end date, disable account. `PATCH /api/admin/users/[userId]` (404 for everyone else). Disabled accounts can't sign in (password or Google) and see a notice inside the app.

**Trial and billing (7).** `User.trialEndsAt` defaults to now + 30 days (existing accounts got 30 days from the migration). `accountAccess()`: allowed while on trial, subscribed (Stripe `active`/`trialing`/`past_due`), covered by an OWNER of a branch they work in (staff), or a super admin. Otherwise every dashboard page shows the plan page (`PlanView`) instead; data is kept. The AI route also checks (402 `SUBSCRIPTION_REQUIRED`).
- `/dashboard/billing`: trial countdown / status, Monthly RM550 vs Yearly RM6,000 (RM500/month, save RM600 = 9%), feature list, Subscribe, Manage billing (Stripe portal).
- `POST /api/billing/checkout` → Stripe Checkout (subscription, MYR). Trial days carry over (`trial_end` = trial end when ≥ 49 h left). Product `smartchiro_pro` and prices (lookup keys `smartchiro_pro_monthly_myr`, `smartchiro_pro_yearly_myr`) are created on first use.
- `GET /api/billing/confirm` (success URL) syncs the subscription immediately; `POST /api/billing/webhook` (signed) keeps it in sync, re-reading the subscription from Stripe on each event.
- `POST /api/billing/portal` → Stripe customer portal.
- Sidebar: "Free trial · N days left" for account holders, Plan & billing in the profile menu, Super admin for super admins.

## Not in scope
Read-only mode after expiry (APIs other than AI stay open; the UI is replaced by the plan page); per-seat pricing; coupons; SST on the subscription itself.

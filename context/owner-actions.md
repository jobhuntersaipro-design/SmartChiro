# Owner Actions (your to-do list)

Things only the clinic owner can do: accounts, credentials, production data and
business decisions. The code for every item is already on `main`. Tick items off here
as you go. Last updated 2026-10-04, after the second site-wide bug scan.

## 1. Before deploying this merge

- [ ] **Deploy runs the migrations.** The deploy must run `prisma migrate deploy`.
  It applies 11 new migrations, `20260928120000_whatsapp_cloud_api` to
  `20260929110000_invoice_cancelled_at`. All of them are additive, and no data is deleted.
- [ ] **Vercel region matches Neon.** `vercel.json` pins `regions: ["sin1"]`
  (Singapore). Confirm the Neon project is in Singapore (`aws-ap-southeast-1`),
  or change the region to match.
- [x] **Vercel Pro (or an external scheduler).** `/api/reminders/dispatch` runs every
  5 minutes. That one job runs reminders, recall/review messages, package expiry,
  certificate alerts and the e-invoice status check. Vercel Hobby only runs it once
  a day. The other option is an external cron that POSTs with the header
  `x-cron-secret: $CRON_SECRET`.
- [ ] **Env vars already needed:** `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`,
  `NEXT_PUBLIC_APP_URL`, and the `R2_*` settings.

## 1a. Sign up with Google

The "Sign up with Google" / "Sign in with Google" buttons only appear once these
keys are set. New Google accounts go straight in (Google has already verified the
email) and get the 30-day trial. Every new account gets a welcome email (Resend,
from `noreply@smartchiro.org`) once its email is verified.

- [ ] Google Cloud Console → APIs & Services → **OAuth consent screen**: app name
  SmartChiro, your support email, authorised domain `smartchiro.org`, scopes
  `openid`, `email`, `profile`. Set the publishing status to **In production**
  (in "Testing" only the test users you list can sign in).
- [x] **Credentials → Create credentials → OAuth client ID → Web application**:
  - Authorised JavaScript origins: `https://smartchiro.org` and
    `https://www.smartchiro.org`.
  - Authorised redirect URI: `https://smartchiro.org/api/auth/callback/google`.
- [x] In Vercel (Production), add `AUTH_GOOGLE_ID` (the client ID) and
  `AUTH_GOOGLE_SECRET` (the client secret), then redeploy. Done 2026-10-03.

## 2. Email (Resend)

- [x] `RESEND_API_KEY` is set in Vercel (all environments). It sends the
  patient-portal sign-in codes, email reminders, booking notifications to doctors
  and practising-certificate alerts.
- [ ] Optional: `RESEND_REMINDERS_FROM`, the sender of email reminders and
  recall/review emails. Unset, they come from `reminders@smartchiro.org`. To show a
  name, set it to e.g. `SmartChiro Reminders <reminders@smartchiro.org>`; the address
  must be on the domain verified in Resend (smartchiro.org), no mailbox needed.
- [x] `CRON_SECRET` in Vercel Production (any long random string, e.g.
  `openssl rand -hex 32`), then redeploy. Without it every scheduled run of
  `/api/reminders/dispatch` is refused (401), so no reminder, recall, review or
  alert is sent, by email or WhatsApp. Done 4 Oct 2026: the production logs show
  the job answering 200 every 5 minutes.

## 3. WhatsApp (Meta Cloud API)

Full steps are in `context/features/whatsapp-cloud-api-spec.md` §8 and §11.

- [ ] Create a Meta Business app with WhatsApp and Facebook Login for Business,
  including an Embedded Signup configuration.
- [ ] Set `META_APP_ID`, `META_APP_SECRET`, `META_WA_CONFIG_ID` and
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. `WHATSAPP_TOKEN_KEY` is optional.
- [ ] Set the webhook to `https://<app>/api/whatsapp/webhook` and subscribe to
  `messages`, `message_template_status_update` and `account_update`.
- [ ] Quick test with the manual connect path (§11). Then connect each branch
  (Branch → Settings → Appointment Reminders) and wait until the templates show
  **Approved**:
  - reminder, recall and review templates;
  - in English, Malay and Chinese.
- [ ] Apply for Tech Provider verification / app review. Until it's approved,
  Embedded Signup only works for numbers owned by your own Meta business.
- [ ] After WhatsApp works, confirm that the legacy Baileys code can be deleted:
  `src/lib/wa/*`, `/api/branches/[id]/wa/*`, `/api/wa/webhook`, `WaConnectModal`,
  and the `WaSession` model.

## 4. Cloudflare R2

- [ ] Add a CORS rule to the bucket that allows `PUT` from the app origin, so
  X-ray uploads go straight to R2. Until then, uploads fall back to the server,
  which only accepts files up to 4 MB.
- [ ] Add a lifecycle rule that deletes objects under the `exports/` prefix after
  1 day (R2 → bucket → Settings → Object lifecycle rules). Annotated PNG/PDF
  exports are written there and their download link lasts 24 hours. Exports made
  before 4 Oct 2026 sit under `xrays/…/exports/` and can be deleted by hand.

## 4a. AI pelvis analysis (Anthropic)

- [x] **Add `ANTHROPIC_API_KEY` to the Production environment in Vercel.** Done
  2026-10-03; live from the next deploy.
- [ ] **Budget for it.** Each analysis makes up to 11 model calls (Claude Opus 5.5):
  about 25–45 seconds and roughly US$0.20–0.35 per film. Limited to 10 different
  X-rays per account per day (change per person on the Super admin page) and
  6 analyses per user per 10 minutes.
- [ ] **Calibrate films for mm.** Results are in pixels until a calibration line is
  drawn on the film (a ruler or known-size marker); the paper's normal ranges
  (e.g. FHHD < 10 mm) are only judged in mm.

## 4b. Subscriptions (Stripe) and super admin

Every account now gets a 30-day free trial; existing accounts got 30 days from this
deploy. When a trial ends without a subscription, the dashboard shows the plan page
until they subscribe (data is kept). Staff are covered by their branch owner's plan,
and your own clinic never lapses while you are a super admin.

- [ ] **Stripe keys.** In Vercel (Production), add `STRIPE_SECRET_KEY` (live secret
  key, `sk_live_…`; test with `sk_test_…` on Preview first). Until it's set, the
  Subscribe button says "Online payment isn't set up yet." The SmartChiro Pro
  product and its MYR prices (RM1,000/month, RM10,000/year) are created in your Stripe
  account automatically on the first checkout. (Price changed 2026-10-03 from
  RM550/RM6,000: the next checkout makes the new prices; anyone already subscribed
  stays on their old price until you move them in the Stripe dashboard.)
- [ ] **Stripe webhook.** Stripe Dashboard → Developers → Webhooks → add endpoint
  `https://smartchiro.org/api/billing/webhook` with events `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
  (Renewals, failed payments and cancellations only reach the app through this.)
- [ ] **Stripe customer portal.** Stripe Dashboard → Settings → Billing → Customer
  portal: save the settings once (allow cancel, card update, invoices, and switching
  between the two prices). "Manage billing" needs it.
- [ ] **Stripe account in MYR.** Make sure the account can charge in MYR (a Malaysian
  Stripe account can). Decide with your tax agent whether the subscription needs
  SST / e-invoices; nothing is added to the price today.
- [ ] **Super admin.** `SUPER_ADMIN_EMAILS` in Vercel (Production) lists who sees
  **Super admin** in the sidebar (comma-separated sign-in emails). It was set to the
  email on your Claude account on 2026-10-03; change it if you sign in to SmartChiro
  with a different one (then redeploy). To use it: sign in at
  `https://smartchiro.org/login` with that email (Sign in with Google, or register it
  first), then open **Super admin** in the sidebar (`/dashboard/admin`). It lists every
  sign-up with clinic, plan and trial end, login activity (last active, sign-ins) and
  X-ray use (AI today and last 30 days, uploads); **Manage** extends a trial, changes the
  daily AI limit or disables an account. Login activity is recorded from 4 Oct 2026, so
  older accounts show "No sign-ins recorded" until they next sign in.
- [ ] **Before 30 days are up:** tell existing clinics about the trial and the
  plan, or extend their trials on the Super admin page (Manage → Free trial ends).

## 5. LHDN MyInvois (e-invoicing)

Nothing has been sent to LHDN yet. Details are in the "8.4 owner actions" section of
`context/features/improvement-plan-spec.md`.

- [ ] Ask your tax agent to confirm:
  - whether the RM3m threshold and phase dates apply to you;
  - the tax type for lines without SST (we use `06` "not applicable"; the other
    option is `E` "exempt");
  - the classification code (we use `022` "Others").
- [ ] Register SmartChiro as an ERP system in the MyInvois **sandbox**. Set
  `MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET` and `MYINVOIS_ENV=sandbox`, and test
  there. Move to production after that.
- [ ] Fill in Branch → Settings → Billing & tax for each branch:
  - legal name, 12-digit SSM number, TIN, SST number;
  - MSIC code (86909 or 86903; confirm which) and business activity;
  - branch address, state and phone.
  Then switch e-invoicing on.
- [ ] Every month, within 7 days of month end, run Billing & tax → e-Invoice →
  **Monthly consolidated**.
- [ ] Signed (v1.1) documents need a certificate from an MCMC-licensed CA plus a
  signer implementation. v1.0 documents (unsigned) work until then.

## 6. Clinic setup in the app

- [ ] **Practising certificates:** enter each doctor's T&CM registration number,
  APC number and APC expiry on the doctor page → Professional tab. Alerts only
  start once the expiry is filled in.
- [ ] **Accounting codes:** set Billing & tax → Accounting codes to match your
  chart of accounts before the first export.
- [ ] **Commission rules:** add them under Branch → Settings → Commission rules.
- [ ] **Branch email:** fill in each branch's email (Branch → Settings). Patients'
  replies to recall and review emails go there.
- [ ] **Online booking and portal:** switch on the booking link and set the portal
  cancel cutoff in Branch → Settings for each branch. The portal link is `/portal`.
- [ ] **Staff logins:** create Doctor, Admin and Front desk logins, then check what
  each role sees.

## 7. Production data clean-up

- [ ] Delete the two `TEST UX Patient` records created by the old add-patient bug:
  - `cmul4q8i1000004i9hqqvd9zl` (has 1 visit and 1 appointment, 28 Sep 7:00 PM with
    Dr. Suresh Menon);
  - `cmul4rnmn000004l0k507qdyd`.

## 8. Decisions

- [x] **Bug-fix plan D1–D4** (answered 2026-10-04, all as recommended): adding an
  existing account sends an invite; lapsed accounts are read-only; an ownership
  transfer moves billing to the new owner; patient email unique per branch.
  Staff who already had an account and were added to your branch before this
  change stay members; new ones get an invite on their dashboard. IC numbers are
  unique per branch too (otherwise clinic B couldn't register clinic A's patient).
- [ ] **Patients entered twice with and without IC dashes.** The 4 Oct migration
  converted every MyKad to the dashed form, except where a branch already had the
  same IC both ways; those pairs are left for you to merge (search the IC on the
  Patients page).

- [x] **Admins who treat patients count as clinicians** (decided 2026-09-29). An
  ADMIN with a doctor profile (filled in on the doctor page) now gets a calendar
  column, can be booked online and picked for care plans, and counts in doctor
  totals. Admins without a doctor profile stay office staff. Dr. Tan Wei Hong
  already has a profile, so nothing to do for him.
- [x] **The accounting journal reverses cancelled invoices automatically**
  (decided 2026-09-29). The sale stays in the month it was issued; the reversal
  is posted on the date it was cancelled. Invoices cancelled before this change
  have no cancellation date and stay out of the journal as before.

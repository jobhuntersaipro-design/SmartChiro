# Owner Actions (your to-do list)

Things only the clinic owner can do: accounts, credentials, production data and
business decisions. The code for every item is already on `main`. Tick items off here
as you go. Last updated 2026-10-03, after the AI Pelvis Analysis merge.

## 1. Before deploying this merge

- [ ] **Deploy runs the migrations.** The deploy must run `prisma migrate deploy`.
  It applies 11 new migrations, `20260928120000_whatsapp_cloud_api` to
  `20260929110000_invoice_cancelled_at`. All of them are additive, and no data is deleted.
- [ ] **Vercel region matches Neon.** `vercel.json` pins `regions: ["sin1"]`
  (Singapore). Confirm the Neon project is in Singapore (`aws-ap-southeast-1`),
  or change the region to match.
- [ ] **Vercel Pro (or an external scheduler).** `/api/reminders/dispatch` runs every
  5 minutes. That one job runs reminders, recall/review messages, package expiry,
  certificate alerts and the e-invoice status check. Vercel Hobby only runs it once
  a day. The other option is an external cron that POSTs with the header
  `x-cron-secret: $CRON_SECRET`.
- [ ] **Env vars already needed:** `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`,
  `NEXT_PUBLIC_APP_URL`, and the `R2_*` settings.

## 2. Email (Resend)

- [ ] Set `RESEND_API_KEY` and `RESEND_REMINDERS_FROM` (a verified sender domain).
  Without them, none of these emails go out:
  - patient-portal sign-in codes (the portal can't be used without this);
  - email reminders;
  - booking notifications to doctors;
  - practising-certificate alerts.

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

## 4a. AI pelvis analysis (Anthropic)

- [ ] **Add `ANTHROPIC_API_KEY` to the Production environment in Vercel.** It is
  currently set for Preview only, so on smartchiro.org the "Detect landmarks"
  button answers "AI analysis isn't set up" until the key is added (then redeploy).
- [ ] **Budget for it.** Each analysis makes up to 11 model calls (Claude Opus 5.5):
  about 25–45 seconds and roughly US$0.20–0.35 per film. Limited to 6 analyses
  per user per 10 minutes.
- [ ] **Calibrate films for mm.** Results are in pixels until a calibration line is
  drawn on the film (a ruler or known-size marker); the paper's normal ranges
  (e.g. FHHD < 10 mm) are only judged in mm.

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

- [x] **Admins who treat patients count as clinicians** (decided 2026-09-29). An
  ADMIN with a doctor profile (filled in on the doctor page) now gets a calendar
  column, can be booked online and picked for care plans, and counts in doctor
  totals. Admins without a doctor profile stay office staff. Dr. Tan Wei Hong
  already has a profile, so nothing to do for him.
- [x] **The accounting journal reverses cancelled invoices automatically**
  (decided 2026-09-29). The sale stays in the month it was issued; the reversal
  is posted on the date it was cancelled. Invoices cancelled before this change
  have no cancellation date and stay out of the journal as before.

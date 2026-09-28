# SmartChiro Improvement Plan (UX review + Malaysian competitor gaps)

**Source:** `smartchiro-improvement-report.md` (UX review of smartchiro.org, 28 Sep 2026, Owner role on KLCC / Bangsar / Penang Georgetown).
**Status:** Phase 1 done (2026-09-29); Phase 2 next.
**Branch:** `claude/zen-goodall-84f7kl` — one commit (or small set) per phase, each phase built, tested and pushed before the next starts.

This file is the master plan. Each phase has a detailed section that is filled in
**before** that phase is built, and marked done with a short record after.

---

## Principles

- Fix trust first: numbers, dates and saved records must be right before new features.
- Reuse what exists: `loadBranchContext`, `clinic-time.ts`, the break-time 409 confirm pattern, the audit-log helpers, the WhatsApp Cloud API sender.
- Every schema change is an additive Prisma migration (production runs `prisma migrate deploy` on deploy).
- Money is MYR with 2 decimals, dates display `dd/mm/yyyy` in Asia/Kuala_Lumpur.
- Features that need an outside account (payment gateway, LHDN MyInvois, accounting APIs) are built behind env config with a working manual/offline path, so nothing blocks on credentials.

## Phase overview

| # | Phase | Report refs | Outcome |
|---|---|---|---|
| 1 | Trust bugs | §3 1–7, §9 | Wizard saves once at step 3; one source for counts; every working doctor gets a calendar column; hours prompt + out-of-hours warning; x-ray annotation counts/log only for saved drawings + upload sanity check; times correct in MYT; no hydration error |
| 2 | Front desk + global branch context + dates + table/mobile polish | §2, §4, §5, §6 #3 | `FRONT_DESK` role (book, check in, take payment, no clinical notes); one branch context with "All branches"; `dd/mm/yyyy` inputs; nowrap money/dates; tel + WhatsApp icons; names not ids; branded 404; dashboard owner signals; §4 form fixes |
| 3 | Treatment plans, prepaid packages, recurring bookings | §6 #1 #2 | Package catalogue per branch, patient packages with session balance, redemption on visit; care plan → recurring appointment series with "this / following" edits |
| 4 | Payments, manual invoices, SST, receipts | §6 #5 #6, §5 | Manual invoices, payments (cash, card, DuitNow QR, FPX, e-wallet, bank transfer, panel) incl. deposits / split / instalments; 6% SST for non-citizens; branch tax & billing settings (SSM, TIN, SST no.); receipts carry them |
| 5 | Reports | §6 #7 | `/dashboard/reports`: revenue by branch / doctor / treatment, utilisation, no-show rate, package liability, retention |
| 6 | WhatsApp recall + review requests, BM/Chinese templates | §6 #4 | Recall of lapsed patients, post-visit review request, templates in en / ms / zh via Cloud API |
| 7 | Online booking, then patient portal | §6 #2 #11 | Public booking link per branch (web + WhatsApp share), slot engine from hours/breaks/appointments; portal (bookings, packages, receipts) |
| 8 | MyInvois, commissions, T&CM expiry, accounting | §6 #6 #8 #13 | MyInvois submission behind LHDN credentials (+ export), commission rules + report, practising-certificate expiry alerts, accounting CSV export |

Out of scope for this plan (would each need their own decision): MyKad reader / kiosk hardware, panel/TPA claim reconciliation (§6 #10), inventory, Bahasa Malaysia UI translation (§6 #14), native mobile app.

---

## Phase 1 — Trust bugs

### 1.1 Add patient wizard (report §3.1)
**Cause:** `AddPatientDialog.tsx` renders Next (`type="button"`) and Add Patient (`type="submit"`) from one ternary in the same slot, so React reuses the DOM button. `setStep(3)` commits before the browser's default click action runs, the button is now `type="submit"`, and the form submits from step 2 → dialog closes, patient saved without Medical data. No in-flight guard and no server dedupe, so re-entry and double clicks created duplicates.
**Fix:** distinct keys for the two buttons; `handleSubmit` refuses unless `step === 3` and uses a ref in-flight guard; Enter in a field advances instead of submitting; Esc, X and Cancel go through the same discard-changes confirm as the backdrop. Server: `POST /api/patients` returns `409 duplicate_patient` (with the existing id) when a patient with the same IC number already exists in the branch.
**Done when:** step 1 → 2 → 3 → Save creates exactly one record; Esc on step 2 creates nothing.

### 1.2 One source for counts (report §3.2)
**Cause:** dashboard counts `BranchMember` rows (per membership, all roles, inactive included) → 9; Doctors page counts distinct users with `isActive` → 7; branch cards sum `_count.members`; patients page cards count `status: 'active'` only in admin branches; doctor "Total patients" sums per-doctor counts without branch scope.
**Fix:** new `src/lib/stats-scope.ts`:
- **Clinician** = distinct user with role `DOCTOR` or `OWNER` in the scoped branches, `doctorProfile.isActive !== false` (front-desk ADMIN excluded) — same rule as `/api/doctors?clinical=1`.
- **Patients** = all patients in the scoped branches (any status); "Active patients" is always labelled as such and filters `status = 'active'`.
Every count (dashboard stats, dashboard branch cards, branches list, doctors summary, patients summary) uses these helpers.
**Done when:** adding/deactivating a doctor or patient changes every page to the same number.

### 1.3 Day calendar shows every working doctor (report §3.3)
**Cause:** columns come only from branch members with role DOCTOR/OWNER (optionally narrowed by `?doctors=`); appointments for anyone else (ADMIN booked as doctor, removed member, stale filter) are never drawn.
**Fix:** columns = selected branch clinicians ∪ every doctor who has an appointment that day; unknown ids in `?doctors=` are ignored and fall back to all.
**Done when:** 5 doctors with appointments on one day → 5 columns.

### 1.4 Hours and availability (report §3.4)
**Cause:** the UI stores hours as JSON `{"mon":{"open":"09:00","close":"18:00"}}`, but the seeds (and anything typed as free text) store "Mon-Fri 9am-6pm", which every reader parses to `{}` → "Closed". Doctor schedules are seeded with `monday…` keys while the UI reads `mon…` → "0h". Hours aren't required at branch creation and bookings never check them.
**Fix:** seeds write the JSON format and short day keys; readers also accept legacy free text ("Mon-Fri 9am-6pm, Sat 9am-1pm") and long day keys; branches with no hours show a "Set opening hours" prompt (branch overview, settings, dashboard) and the create-branch wizard requires at least one open day; booking or dragging outside the branch's hours returns `409 outside_hours_confirm_required` and the UI asks to confirm (same pattern as break time; skipped when a branch has no hours). Break-time checks become clinic-timezone correct.

### 1.5 X-ray annotations (report §3.5)
**Cause:** closing the viewer (and export) force-flushes the saver, which POSTs an Annotation with `shapes: []`; the activity feed turns every Annotation row into "X annotated X-ray"; the gallery counts rows while the viewer counts shapes. Uploads check only MIME/size/dimensions.
**Fix:** close uses a normal (dirty-only) flush; the saver never creates a row for an empty canvas and the API rejects that; new `Annotation.shapeCount` column (backfilled) drives the gallery count and the activity feed (only `shapeCount > 0`). Uploads: server checks the file's magic bytes and real dimensions at confirm; the client warns before uploading a colour image or phone-screen-shaped image ("This doesn't look like an X-ray — upload anyway?").
**Done when:** opening and closing an X-ray adds no activity entry; gallery and viewer counts match.

### 1.6 Timezone (report §3.6)
**Cause:** server code formats in UTC (booking email, invoice line, calendar markers, break bands, x-ray export); browser code formats in the device zone, and dialogs build instants from the device zone; `?date=` keys use `toISOString()` (UTC day).
**Fix:** all appointment date/time formatting and parsing goes through `clinic-time.ts` helpers pinned to `CLINIC_TIME_ZONE` (Asia/Kuala_Lumpur): `clinicParts`, `clinicDateKey`, `clinicInstantFromInputs`, `formatInClinic`. Covers `format.ts`, calendar components, dialogs, email, invoice route, markers, availability, export.
**Done when:** an 11:30 PM MYT booking shows 11:30 PM on the dashboard, list, calendar, email and invoice, on a device in any time zone.

### 1.7 Hydration error #418 on Appointments (report §3.7)
**Cause:** the calendar is server-rendered in UTC and re-rendered in the browser: the "GMT +00:00" label, `new Date()` "now" line and today's date differ.
**Fix:** zone label from the clinic zone; "now" set after mount; the page passes the clinic's today; all rendering uses clinic-zone formatting.

### Phase 1 — record (done 2026-09-29)
- All seven items shipped as specified. Extras found on the way: the seeds built appointment times in the seeding machine's zone (seeds run in UTC produced the 12:00 AM / 1:00 AM bookings the report saw) — fixed with clinic-time helpers; the calibration-carry toast changed adjustments without marking the canvas dirty; exporting an un-annotated X-ray now has its own route (`/api/xrays/[id]/export`) instead of creating an empty annotation to export.
- Gallery "N annot." shows the latest annotation's `shapeCount`, matching the viewer's "N annotations".
- Existing empty annotation rows stay in the database with `shapeCount = 0`; they no longer count or appear in the activity feed.
- Branch rows seeded with free-text hours keep their text (seed upserts don't update); the parser reads it.
- Verified in Chromium (browser zone America/Los_Angeles) against a local Postgres: wizard step 1→2→3, Esc confirm, double-click Save creates one record; counts agree (dashboard / doctors / branches / patients); 23:00 booking returns `outside_hours_confirm_required`; no hydration error on Appointments (the original code reproduces it). Full vitest suite 972/972 with the local DB; stale tests fixed (register's anti-enumeration 200, a duplicate fixture IC, a "today" fixture built in UTC).

## Phase 2 — Front desk role, global branch context, dates, tables, mobile

_Detailed before build._

## Phase 3 — Treatment plans, packages, recurring bookings

_Detailed before build._

## Phase 4 — Payments, manual invoices, SST, receipts

_Detailed before build._

## Phase 5 — Reports

_Detailed before build._

## Phase 6 — WhatsApp recall and review requests

_Detailed before build._

## Phase 7 — Online booking and patient portal

_Detailed before build._

## Phase 8 — MyInvois, commissions, T&CM expiry, accounting export

_Detailed before build._

---

## Owner actions carried from the report

- Delete test data created by the wizard bug: two `TEST UX Patient` records (`cmul4q8i1000004i9hqqvd9zl` with one visit + one appointment on 28 Sep 7:00 PM with Dr. Suresh Menon, and duplicate `cmul4rnmn000004l0k507qdyd`). Not done from code — production data.
- Verify the LHDN e-invoice RM3m threshold (Guideline v4.8) before Phase 8.
- Create Doctor and Admin test logins to re-test role views after Phase 2.

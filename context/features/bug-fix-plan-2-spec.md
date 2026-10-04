# Bug Fix Plan 2 (second site-wide scan, 4 Oct 2026)

Found after Bug Fix Plan 1 (`bug-fix-plan-spec.md`, Phases 1–5) shipped. Five read-only
code audits (booking/portal/messaging, money/reports/e-invoicing, clinical records,
accounts/access, front end) plus a crawl of smartchiro.org as the owner and doctor test
logins (about 40 pages each: no page errors, no failed requests from the app) and the
Vercel production logs (no errors since the Phase 5 deploy). Nothing below repeats
Plan 1. Each item was traced end to end.

Fix one phase at a time, in order. Each fix gets a test that fails before it where it can
be tested. Ship when build, lint and tests pass, then prove it on production (CLAUDE.md).

**Severity:** 🔴 critical · 🟠 high · 🟡 medium · ⚪ low
**Decision** = taken as recommended, listed at the end; the owner can reverse it.

---

## Phase 6 — Accounts and access

**Done 4 Oct 2026** (G1–G11; regression tests in `src/app/api/__tests__/access-phase6.test.ts`
and the auth, outreach, booking and subscription test files). Migration
`20261004120000_user_password_tracking` (two additive User columns).

### G1 🟠 Registering someone's email first takes over their account
- `api/auth/register`: an existing unverified account is left as is. The real owner
  registers, resends the link, verifies, and the account keeps the first person's
  password and name. Works for a `SUPER_ADMIN_EMAILS` address.
- **Fix:** registering an unverified email replaces its password and name, and drops
  older verification links. Same response either way.

### G2 🟠 Reminder emails carry the booker's own HTML
- Online booking accepts any name; `renderTemplate` puts it raw into the HTML reminder
  (`<strong>{firstName}</strong>`), sent from reminders@smartchiro.org. A stranger can
  send a phishing link to any inbox.
- **Fix:** HTML-escape values for the HTML body.

### G3 🟡 Accounts an owner creates keep the owner's password after a Google sign-in
- `POST /api/doctors` creates a verified account with a password the owner typed. If the
  real person later signs in with Google, Google is linked and the owner's password
  still works.
- **Fix:** mark owner-set passwords (`User.passwordSetByOther`); the first Google sign-in
  clears it; changing or resetting the password clears the mark.

### G4 🟡 Changing or resetting a password doesn't sign out other sessions
- **Fix:** `User.passwordChangedAt`, stamped on change and reset; sessions signed in
  before it end.

### G5 🟡 A lapsed clinic owner who works at a paying clinic is "covered"
- `accountAccess` gives them `coveredBy` even though they bill a branch, so their own
  lapsed branch stays writable for them, their staff are locked, and checkout refuses
  them ("your clinic's plan covers you").
- **Fix:** only staff-only accounts can be covered; checkout and the plan card are open
  to anyone who bills a branch.

### G6 🟡 Lapsed clinics keep taking online bookings and sending recalls (Decision D5)
- Public booking and the cron ignore the clinic's plan. Staff can't touch those
  bookings (402).
- **Fix:** online booking is closed while the branch's billing account has lapsed;
  recall and review messages stop. Reminders for appointments already booked still go.

### G7 🟡 An admin can deactivate or edit the branch owner
- **Fix:** acting on an OWNER needs `branch.manage`; anyone may reactivate themselves.
  Toggling status no longer creates a doctor profile for office staff.

### G8 🟡 Invites can't be withdrawn and outlive the person who sent them
- **Fix:** list and withdraw pending invites on the branch Doctors tab; invites expire
  after 14 days; accepting needs the inviter to still manage staff there.

### G9 🟡 Deleting a branch widens its leave to every branch and leaves X-rays in R2 (Decision D6)
- `DoctorTimeOff.branch` is `SetNull` (null = all branches). Patient X-ray files are only
  cleaned up by patient delete. The cascade also deletes issued invoices and payments.
- **Fix:** delete the branch's leave rows and R2 files with it; refuse to delete a branch
  with issued invoices (records must be kept).

### G10 ⚪ Doctor profile shows other clinics' names and totals
- `GET /api/doctors/[userId]` counts patients/visits/X-rays across all branches.
- **Fix:** scope counts and the branch list to branches shared with the caller.

### G11 🟡 A doctor removed from a branch can still edit and delete their old visits
- `visits/[visitId]` allows the author when the caller has no role there.
- **Fix:** no role, no access.

---

## Phase 7 — Money

**Done 4 Oct 2026** (N1–N10; regression tests in `src/app/api/__tests__/money-phase7.test.ts`
and the booking tests). No migration.

### N1 🔴 A second branch with the same initials can't invoice or take payments
- Numbers are unique across the database, counters are per branch. Once branch A has
  issued 50 numbers, branch B's first invoice exhausts the retry loop (409) every time;
  receipts too, so it can't take payments.
- **Fix:** when a number is taken, move the counter past the highest number already used
  for that prefix and year.

### N2 🟠 Cancelling or regenerating an invoice ignores its e-invoice
- An invoice with a submitted/valid LHDN e-invoice (own or consolidated) can be
  cancelled and re-issued, so LHDN sees the sale twice.
- **Fix:** refuse while its e-invoice is submitted or valid ("cancel the e-invoice
  first").

### N3 🟡 Cancelling a package's sale invoice leaves the package usable
- **Fix:** refuse cancel and regenerate on an invoice that sold an active package
  ("cancel the package instead").

### N4 🟡 Payments dated before their invoice
- Paying a draft with an earlier received date issues the draft today. Any payment can
  be backdated before the invoice.
- **Fix:** a draft paid with an earlier date is issued on that date; earlier than an
  issued invoice's date is refused.

### N5 ⚪ "Mark sent" can overwrite Part paid
- **Fix:** re-check the transition on the locked row.

### N6 🟡 Per-visit commission paid twice
- A completed appointment plus a visit written from the patient page for the same
  patient, doctor and day count as two visits.
- **Fix:** skip the appointment when that visit exists.

### N7 ⚪ Commission on payments includes SST
- **Fix:** take the payment's share net of tax.

### N8 ⚪ An invoice whose own e-invoice was cancelled never reaches the monthly consolidation
- **Fix:** include cancelled e-invoices in consolidation.

### N9 🟡 A package that expired overnight doesn't cover yesterday's visit
- Redemption only looks at packages still marked ACTIVE; the cron marks them EXPIRED at
  day end, so completing a visit the next morning uses no session.
- **Fix:** also consider packages that expired after the appointment's time.

### N10 ⚪ Smaller money issues
- Bad JSON to the e-invoice route gives 500.
- Two online bookings at once with the same new email or IC give 500; a different case
  of an existing email makes a second patient.

---

## Phase 8 — Messages

**Done 4 Oct 2026** (W1–W5; W3 shipped with Phase 6). Tests in the reminders and outreach
test files. No migration.

### W1 🟡 Patients on "Both" get every reminder email twice when WhatsApp fails
- **Fix:** no email fallback when an email reminder is already queued.

### W2 🟡 WhatsApp failures reported later by Meta never fall back to email
- **Fix:** the failed-status webhook queues the email fallback (same rule as W1).

### W3 🟡 Recall/review messages queued overnight still go after the owner switches them off or the patient books
- **Fix:** re-check settings, patient status and upcoming bookings at send time.

### W4 🟡 Recall emails say "Reply STOP" but replies go nowhere
- **Fix:** reply-to the branch email; a signed one-click unsubscribe link that clears
  marketing consent; wording matches.

### W5 ⚪ Reminder email subject is "Hi Siti,"
- **Fix:** a proper subject per language with clinic, date and time.

---

## Phase 9 — Clinical records and screens

### U1 🟠 Doctors can't save edits to their own patients
- Edit Patient always sends `doctorId`; the server treats it as a reassignment (403).
- **Fix:** send `doctorId` only when it changed; the server ignores an unchanged one.

### U2 🟡 Activate / Deactivate on the patient page always fails silently (sends upper case)

### U3 🟡 Visits tab only shows the 20 latest visits
- **Fix:** "Load more".

### U4 🟡 Edit Visit can't clear vitals, next visit or the questionnaire
- **Fix:** send `null`; an unticked questionnaire is deleted.

### U5 🟡 New visit's "next visit" counts from today, everything else from the visit date

### U6 🟡 "View visit" links from Past Appointments don't open the visit (`visitId` vs `visit`)

### U7 🟡 "Create visit" shown to doctors, server refuses (needs `patient.readAll`)

### U8 🟡 Past appointment: Save disabled for any change (notes, status, room)
- **Fix:** the past check applies only when the time changes.

### U9 🟡 Dashboard shows blanks and "NaN" on a branch where you're only a doctor
- **Fix:** the API says which view it returned; the page follows it.

### U10 🟡 Mixed-role users see appointment and staff buttons that answer 403
- **Fix:** use the role in the appointment's own branch; "Add staff" offers only
  branches the caller manages.

### U11 ⚪ Care-plan edits ignore appointment rules
- Cancelling future occurrences cancels other doctors' bookings for a doctor caller; a
  plan can be assigned to front desk.

### U12 ⚪ Visits recorded by office staff are credited to them
- **Fix:** default to the patient's doctor when the caller isn't a clinician; the
  doctor must be a clinician.

### U13 ⚪ Recovery trend shows a 0–10 score as "+7.2%"

### U14 ⚪ Appointment panel misses linked visits older than the latest 5

### U15 ⚪ Branch Schedule and Overview tabs use the device time zone

### U16 ⚪ Dashboard links lose the chosen branch; "Stale" link opens a list that can't show them

### U17 ⚪ Edit Appointment labels clinic times as "Your local time"

### U18 ⚪ Invoices table is cut off at laptop width ("Record pa…" at 1280 px)
- Found on smartchiro.org. The table has a 920 px minimum and no wrapping.

---

## Decisions (taken as recommended, 4 Oct 2026; the owner can reverse them)

- **D5 (G6):** a lapsed clinic's booking page is closed and recall/review messages stop;
  reminders for existing bookings still go (patients already expect them).
- **D6 (G9):** a branch with issued invoices can't be deleted (financial records must be
  kept); a branch without them deletes as before, with its leave and X-ray files.

## Questions for the owner (not changed)

- **Partial refunds** reopen the invoice balance (a refund of unused package sessions
  leaves RM400 "owed" for ever). Should a refund be able to reduce the amount owed
  (a credit) instead?
- **SST for unknown nationality:** a patient with no nationality and no MyKad (e.g.
  booked online without an IC) is charged 6% SST on appointment and package invoices.
  Keep, or treat unknown as Malaysian?
- **MyInvois for several clinics:** the MyInvois credentials are one set for the whole
  platform, so only one taxpayer can e-invoice. Per-clinic credentials (or the
  intermediary "on behalf of" flow) are needed before a second clinic switches it on.

## Not fixing

- Adding staff tells an owner whether an email already has an account (registration
  hides this). The owner has to know, to tell an invite from a new account.
- "Overdue" counts partly paid invoices in the receivables report but not on the
  Invoices page: both are labelled; left as is.

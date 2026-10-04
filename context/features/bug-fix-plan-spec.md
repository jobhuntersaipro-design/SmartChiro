# Bug Fix Plan (site-wide audit, 4 Oct 2026)

Every bug below was traced end to end in the code by a read-only audit (six areas:
access control, appointments and reminders, money, patients/booking/portal, X-ray and
AI, shell/settings/admin) plus a read-only pass over smartchiro.org with the test
logins. Several were found independently by two or three reviewers; they appear once.
All five phases are fixed (4 Oct 2026).

Fix one phase per branch, in order. Each fix gets a test that fails before it. Ship
when build, lint and tests pass, then prove it on production (CLAUDE.md).

**Severity:** 🔴 critical · 🟠 high · 🟡 medium · ⚪ low
**Decision** = answered by the owner (listed at the end).

---

## Phase 1 — Security and privacy

**Done 4 Oct 2026** (all of S1–S12; regression tests in
`src/app/api/__tests__/security-phase1.test.ts`).

Patient data leaking between clinics or to strangers. Fix first.

### S1 🔴 Online booking lets a stranger take over a patient's portal
- **Where:** `src/lib/booking/book.ts:71-74` (`pickPatient` falls back to `matches[0]`), `:142-151` (fills email/IC on the matched record).
- **Repro:** patient Siti has phone 012-3456789 and no email. Anyone books on `/book/<slug>` with that phone, any name and `attacker@x.com`. Siti's record now has the attacker's email; they request a portal code at `/portal` and see her appointments, invoices and receipt PDFs, packages and address, and can cancel her bookings.
- **Fix:** a public booking never writes email or IC onto an existing patient (put them in the appointment notes for staff). Reuse a phone match only when the name also matches; otherwise create a new patient.

### S2 🔴 Any clinic owner can read another clinic's doctor's patients, notes and appointments
- **Where:** `src/app/api/doctors/[userId]/patients/route.ts:30-46`, `.../visits/route.ts:29-48`, `.../appointments/route.ts:40-62` (check "shares any branch", then query `doctorId` across every branch). Enabler: `src/app/api/branches/[branchId]/members/route.ts:95-123` and `src/app/api/doctors/route.ts:234` add any registered user to your branch by email, with no consent.
- **Repro:** sign up, create a branch, add `doctor@otherclinic` as DOCTOR (201 returns their user id), then `GET /api/doctors/{id}/patients` returns their patients from every clinic with IC and phone; `/visits` returns SOAP text. A fellow DOCTOR in a shared branch can do the same (DOCTOR lacks `patient.readAll`).
- **Fix:** limit these queries to branches the caller shares and may read (OWNER/ADMIN there), using the caller's role per branch. Adding someone who already has an account elsewhere becomes an invite they accept (**Decision D1**).

### S3 🟠 An admin can change a doctor's schedule and profile in other clinics
- **Where:** `src/app/api/doctors/[userId]/break-times/route.ts:22-38,77,112-125`, `time-off/route.ts:31-48,81`, `time-off/[timeOffId]/route.ts:8-42`, `[userId]/route.ts:169-188` (PUT), `status/route.ts`, `photo/route.ts`.
- **Repro:** OWNER/ADMIN of any branch the doctor belongs to sends `PUT /break-times {branchId: <other clinic's branch>}`, adds global leave (blocks them everywhere incl. online booking), renames or deactivates them.
- **Fix:** require OWNER/ADMIN in the specific `branchId` written (and in all the doctor's branches for branch-less leave). Profile, name and photo edits: self only, or staff the branch created.

### S4 🟠 Doctors removed from a branch keep access to their patients and X-rays
- **Where:** `src/lib/auth/patient-access.ts:33-36`, `src/lib/auth/xray.ts:23`, `src/app/api/patients/[patientId]/past-appointments/route.ts:72`.
- **Repro:** owner removes Dr D; D can still `GET/PATCH /api/patients/{id}`, read and edit visits (SOAP), list X-rays.
- **Fix:** assigned-doctor access requires a current membership in the patient's branch; when a doctor is removed, ask the owner to reassign their patients.

### S5 🟠 Creating a patient uses a stale active branch (wrong branch, OWNER rights, or 500)
- **Where:** `src/app/api/patients/route.ts:331` (raw `User.activeBranchId`), `:354-356` (`callerRole` defaults to `'OWNER'`). Branch delete and member removal never reset `activeBranchId`.
- **Repro:** (a) owner deletes their active branch, then Add Patient → 500 (FK error) until they sign in again. (b) staff removed from branch X can still create patients in X, as OWNER.
- **Fix:** take the branch from `loadBranchContext(userId)` (membership-checked), 403 with no membership, never default to OWNER; clear `activeBranchId` on branch delete and member removal.

### S6 🟠 Dashboard shows a whole branch to someone who is only a doctor there
- **Where:** `src/app/api/dashboard/schedule/route.ts:24-44`, `stats/route.ts:29,91-104`, `activity/route.ts:18-46` use the active branch's role for every branch; `BranchPicker.tsx` offers every membership + "All branches".
- **Repro:** OWNER of A and DOCTOR at B picks B or All on `/dashboard` and sees all of B's appointments, patient totals and X-ray activity with patient names.
- **Fix:** per-branch role via `loadBranchContext` + `scopedWhere`, as `/api/patients` already does.

### S7 🟡 Any branch member can read another doctor's patient appointments and the audit log
- **Where:** `src/app/api/patients/[patientId]/past-appointments/route.ts:70-74`, `src/app/api/appointments/[appointmentId]/audit-log/route.ts:21-22`.
- **Fix:** `getPatientAccess(...).allowed` for the first; `can(role, "audit.read")` (or the assigned doctor) for the second.

### S8 🟡 "This and following" edits bypass the reassignment rules
- **Where:** `src/app/api/appointments/[appointmentId]/route.ts:123-139`, `src/lib/series-following.ts:53-58,117-123`.
- **Repro:** a DOCTOR PATCHes `?scope=following` with `doctorId` = a front-desk user → 200 (the single-appointment path refuses). A doctor can also move later occurrences an admin gave to someone else.
- **Fix:** `doctorId` changes need `appointment.manageAll` and a clinician target; a non-manager only touches occurrences where they are the doctor.

### S9 🟡 Expired or lapsed accounts can still use every API
- **Where:** `accountAccess` is only checked in `src/app/dashboard/layout.tsx`, `dashboard/billing/page.tsx` and the AI route; middleware skips `/api`.
- **Repro:** trial ended, no subscription: `POST /api/patients`, `/api/appointments`, `/api/invoices`, `/api/xrays/upload-url` all succeed.
- **Fix:** shared API guard returning 402 when `!allowed` (exempt auth, billing, portal, public, webhooks, cron). What a lapsed clinic may still do (e.g. read and export) is **Decision D2**.

### S10 🟡 Deleted patients' X-rays stay public in R2; exports never cleaned up
- **Where:** `src/app/api/patients/[patientId]/route.ts:502` (cascade deletes rows only), `src/lib/xray-export.ts:106-108`.
- **Fix:** delete the patient's R2 objects on patient delete; lifecycle rule (or cleanup) for `exports/`.

### S11 ⚪ No rate limit on password sign-in or verification resends
- **Where:** `src/lib/auth.ts:35-60` (Credentials `authorize`), `src/app/api/auth/resend-verification/route.ts`.
- **Fix:** per-email and per-IP throttles, as the portal and forgot-password routes already have.

### S12 ⚪ Cron secret compared with `===`
- **Where:** `src/app/api/reminders/dispatch/route.ts:14-15`. **Fix:** `timingSafeEqual`.

---

## Phase 2 — Money

**Done 4 Oct 2026** (M1–M11; regression tests in
`src/app/api/__tests__/money-phase2.test.ts` and `billing.test.ts`). Drafts sent or
paid in a later month *before* this fix keep their old issue date.

Wrong charges, missing revenue in the books, subscriptions.

### M1 🟠 A package-covered appointment can also be invoiced (patient charged twice)
- **Where:** `src/app/api/appointments/[appointmentId]/invoice/route.ts:62-104`, `src/app/api/invoices/route.ts:196-204`, `src/components/patients/PastAppointmentTable.tsx:150`.
- **Repro:** completing an appointment redeems a package session; "+ Issue" still creates a RM100 invoice for it.
- **Fix:** 409 when the appointment has an active redemption; hide "+ Issue" on redeemed rows.

### M2 🟠 Cancelling a package cancels a partly-paid invoice, and the money can't be refunded
- **Where:** `src/app/api/patient-packages/[packageId]/route.ts:51-60` (only PAID refused); refunds then fail with `invoice_cancelled` (`src/lib/invoices.ts:388`); the journal is left with a credit.
- **Fix:** refuse while `amountPaid ≠ 0` ("refund first"), checked under a row lock, as the invoice PATCH route does.

### M3 🟠 Drafts sent or paid in a later month never reach the books or e-invoicing
- **Where:** `src/app/api/invoices/[invoiceId]/route.ts:93`, `src/lib/invoices.ts:419-426`, `src/lib/accounting-export-server.ts:35-36`, `src/lib/myinvois/service.ts:657`. `issuedAt` stays at the draft date; exports skip drafts and select by `issuedAt`.
- **Repro:** draft 30 Sep, sent and paid 2 Oct → in neither September's nor October's journal or consolidated e-invoice; October has a lone cash entry.
- **Fix:** set `issuedAt` (and re-number if the year changed) when an invoice first leaves DRAFT, by PATCH or first payment.

### M4 🟡 "Regenerate invoice" acts on cancelled invoices
- **Where:** `src/app/api/invoices/[invoiceId]/regenerate/route.ts:60-82`, `PastAppointmentTable.tsx:295` (`find(status !== "PAID")` picks the old cancelled one).
- **Effect:** moves `cancelledAt` (reversal exported twice), or posts a never-issued draft; creates extra drafts.
- **Fix:** 422 on CANCELLED; exclude CANCELLED from the UI target.

### M5 🟡 Two Stripe checkouts can both complete → two subscriptions
- **Where:** `src/app/api/billing/checkout/route.ts:37-70` (open-subscription check skipped on first checkout; sessions live 24 h).
- **Fix:** expire the user's other open checkout sessions before creating one; cancel extras in the webhook/confirm; idempotency key on customer creation.

### M6 🟡 Staff covered by their clinic's plan are offered "Subscribe" and can pay
- **Where:** `src/components/billing/PlanView.tsx:74`, `src/app/api/billing/checkout/route.ts`.
- **Fix:** hide the plan card when covered (or super admin) and refuse checkout.

### M7 🟡 After an ownership transfer, the new owner's subscription doesn't cover staff
- **Where:** `src/lib/subscription.ts:66-79` (payer = `branch.billingUser`); transfer in `branches/[branchId]/members/[memberId]` PATCH never moves `billingUserId`.
- **Fix:** **Decision D3** — move billing to the new owner on transfer, or count the current OWNER as a payer too.

### M8 🟡 Patient past-appointment totals drop partly-paid invoices
- **Where:** `src/app/api/patients/[patientId]/past-appointments/route.ts:197-204`.
- **Repro:** RM300 invoice, RM100 paid → shows paid RM0, outstanding RM0.
- **Fix:** paid = Σ `amountPaid` (non-cancelled); outstanding = Σ `amount − amountPaid` over SENT/OVERDUE/PARTIALLY_PAID.

### M9 🟡 Undoing "Completed" keeps the package session used
- **Where:** `src/app/api/appointments/[appointmentId]/route.ts:313-318` (only →CANCELLED reverses).
- **Fix:** reverse the redemption whenever status leaves COMPLETED.

### M10 ⚪ A payment racing a cancel/regenerate leaves money on a cancelled invoice
- **Where:** `src/app/api/invoices/[invoiceId]/route.ts:69-94`, `regenerate/route.ts:63-83` (no lock on the cancel path).
- **Fix:** `SELECT … FOR UPDATE` and re-check status/`amountPaid` inside the transaction.

### M11 ⚪ Branches with the same initials can collide on invoice numbers (500)
- **Where:** `src/lib/invoices.ts:280-291`. **Fix:** catch P2002 and retry, or a unique prefix per branch.

---

## Phase 3 — Appointments, calendar and reminders

**Done 4 Oct 2026** (A1–A13; regression tests in
`src/app/api/__tests__/appointments-phase3.test.ts`).

### A1 🟠 A rescheduled appointment loses reminders that already went out
- **Where:** `src/app/api/appointments/[appointmentId]/route.ts:296-308` (deletes only PENDING), `src/lib/reminders/dispatcher.ts:54-72` (upsert `update: {}`); same in `src/lib/series-following.ts:181-184`, `src/lib/portal/data.ts:269`.
- **Repro:** 24h reminder sent Mon for Tue 10:00; moved to Fri → no reminder for Friday.
- **Fix:** on a date change, delete or reset every reminder row for the appointment.

### A2 🟠 Queued reminders ignore opt-outs and settings changes
- **Where:** `src/lib/reminders/dispatcher.ts:133-145` (only checks status SCHEDULED); settings and patient PATCH don't clear pending rows.
- **Repro:** patient sets reminders to NONE, branch switches reminders off, channel changes, or offsets change → the queued messages still go out (up to 8 days ahead), sometimes on both channels.
- **Fix:** re-check settings, offsets and the patient's channels in `processOne` (mark SKIPPED); clear PENDING rows when those fields change.

### A3 🟡 Reminders are sent for appointments that already started
- **Where:** `src/lib/reminders/dispatcher.ts:92-103,133-139`. Likely today: the cron runs once a day on Vercel Hobby.
- **Fix:** skip when `appointment.dateTime <= now`.

### A4 🟡 Double-booking over IN_PROGRESS visits, long visits and reactivated bookings
- **Where:** `src/lib/appointments.ts:33,36,74-75` (statuses SCHEDULED/CHECKED_IN only; 8 h pre-filter); PATCH duration has no max (`[appointmentId]/route.ts:69`); status-only changes skip the check (`:200`).
- **Repro:** book over a started visit; stretch a booking to 10 h; reactivate a cancelled booking whose slot was rebooked — all accepted.
- **Fix:** add IN_PROGRESS; `.max(480)` on PATCH duration; run the conflict check when status moves back into an active one.

### A5 🟡 Single bookings and reschedules ignore doctor leave
- **Where:** POST `src/app/api/appointments/route.ts:251-298`, PATCH `[appointmentId]/route.ts:200-238` (series and online booking do check).
- **Fix:** check `isOnTimeOff`; 409 confirm gate like the break-time one.

### A6 🟡 Multi-day leave only shows on its last day in the Day calendar
- **Where:** `src/components/calendar/DoctorDayCalendar.tsx:142-149,288-291`, `src/lib/availability.ts:103`.
- **Fix:** clamp to the day's start/end instead of returning null in `minutesFromTop`.

### A7 🟡 Dragging to "override and double-book" always fails
- **Where:** `src/components/calendar/AppointmentsCalendarView.tsx:459-510` vs `[appointmentId]/route.ts:63-98,200-224` (no override flag).
- **Fix:** accept a `forceConflict` flag for `appointment.manageAll`, or remove the override option.

### A8 🟡 Counts disagree between badges, list, stat cards and the dashboard
- **Where:** `src/components/appointments/AppointmentsListView.tsx:163-164` vs `:55-63`, `src/app/api/appointments/counts/route.ts:67-80,100-106`, `src/lib/appointment-tabs.ts:39-41,149-166`, `src/app/api/dashboard/stats/route.ts:48-55,111-117` (counts cancelled/no-show), `dashboard/schedule/route.ts:55` (first 10 only, no "view all"), `appointments/upcoming/route.ts:45,62` (total capped at 100).
- **Repro:** 5 completed + 3 scheduled today → badge 3, list 8, stat 8; completion rate counts next month's bookings; dashboard "Today" includes cancelled.
- **Fix:** one status definition per tab shared by counts, list and dashboard; same window; real totals; "View all" link.

### A9 🟡 "View appointment" links in booking emails don't open the appointment
- **Where:** link built in `src/app/api/appointments/route.ts:361`, `src/lib/booking/notify.ts:78`; ignored by `AppointmentsPageShell.tsx:71,137` and `AppointmentsListView.tsx:223`.
- **Fix:** open list view on the appointment's date (or fetch it by id) when `?appointment=` is present.

### A10 ⚪ A doctor can't book themselves on their own break (dialog loops)
- **Where:** `src/app/api/appointments/route.ts:276`, `src/components/patients/CreateAppointmentDialog.tsx:575-580`.
- **Fix:** let doctors override their own break, or hide the button for doctors.

### A11 ⚪ Week and Month views use the device time zone
- **Where:** `src/components/calendar/AppointmentsCalendarView.tsx:48-55,296-301,342-354,392-393`.
- **Repro:** a laptop set to UTC shows 09:00 MYT bookings at 01:00 and saves drops at the wrong hour.
- **Fix:** clinic-zone localizer (or shift dates in/out by the zone offset).

### A12 ⚪ Visit created from an early-morning appointment shifts a day when edited
- **Where:** `src/app/api/appointments/[appointmentId]/visit/route.ts:75`, `src/components/patients/EditVisitDialog.tsx:136` (`slice(0, 10)` of UTC).
- **Fix:** use `clinicDateKey(new Date(visit.visitDate))`.

### A13 ⚪ Sidebar "New Appointment" does nothing when already on Appointments
- **Where:** `src/components/appointments/AppointmentsPageShell.tsx:116`. **Fix:** react to `?create=1` in an effect.

---

## Phase 4 — X-ray and AI

**Done 4 Oct 2026** (X1–X9; tests in `image-sniff.test.ts` and
`annotation-saver.test.ts`). Films uploaded from phones *before* this fix keep their
swapped size.

### X1 🟠 Phone photos with EXIF rotation are stored with width and height swapped
- **Where:** `src/app/api/xrays/[xrayId]/confirm/route.ts:184-193`, `src/app/api/xrays/upload/route.ts:69-76` (raw JPEG size), viewer `src/components/annotation/AnnotationCanvas.tsx:1898-1915`, export `src/lib/export-renderer.ts:235`.
- **Effect:** film squashed in the viewer, mm differ by axis, AI mapped unevenly, export sideways.
- **Fix:** store the EXIF-oriented size; `.rotate()` in the export.

### X2 🟠 Switching cells in multi-view while saving causes false conflicts or duplicate annotations
- **Where:** `AnnotationCanvas.tsx:850-858,959-966`, `src/lib/annotation-saver.ts:142-165`.
- **Fix:** write the settled save's `annotationId`/`version` back to the per-X-ray cache (or keep per-X-ray targets in the saver).

### X3 🟡 "Stay" on the leave-page prompt still sends the save beacon
- **Where:** `src/hooks/useAutoSave.ts:131-144`, `annotation-saver.ts:180-200`; also the unmount `keepalive` POST racing `saveNow()`.
- **Effect:** next autosave gets a false 409, or a second annotation row on a new film.
- **Fix:** send on `pagehide` with `baseVersion`; one save path on navigation.

### X4 🟡 Multi-view drawing uses the wrong film size for "inside the image"
- **Where:** `AnnotationCanvas.tsx:745-753,1578-1583`, `src/hooks/useDrawingTools.ts:580-581`.
- **Fix:** pass the active slot's width/height.

### X5 🟡 Duplicate (Cmd+D) lands on top of the original and copies landmark identity
- **Where:** `AnnotationCanvas.tsx:1234-1251`.
- **Effect:** invisible copy, two "L1"s, pelvic analysis may use the stale landmark copy after an AI re-run.
- **Fix:** reuse the paste logic (`plainLandmarkCopy`, offset points, new measurement id).

### X6 🟡 Editing the calibration ratio without a calibration line isn't saved
- **Where:** `AnnotationCanvas.tsx:658-686`. **Fix:** `markDirty()` in both branches.

### X7 ⚪ Multi-view shows px on the film while the panel shows mm
- **Where:** `AnnotationCanvas.tsx:2203,2207`. **Fix:** pass `pixelsPerMm` like single view.

### X8 ⚪ Fit ignores rotation
- **Where:** `src/hooks/useCanvasViewport.ts:125-137`. **Fix:** swap width/height at 90°/270°.

### X9 ⚪ Upload checks done only in the browser
- **Where:** failed thumbnail upload still saved (`upload-url/route.ts:80-95`, `src/lib/xray-upload-client.ts:73`); 300 MB limit not checked server-side (`upload-url/route.ts:41`, `confirm/route.ts:170`); annotation 10 MB cap uses a client-supplied size (`src/app/api/annotations/[annotationId]/route.ts:120`).
- **Fix:** HEAD-check the thumbnail in confirm; compare the real object size in confirm; compute annotation size on the server.

---

## Phase 5 — Patients, onboarding, settings and polish

**Done 4 Oct 2026** (P1–P14; tests in `patients-phase5.test.ts` and
`phase5-helpers.test.ts`). IC numbers are now unique per branch as well as email
(same reasoning as D4). P13's reload-once is defensive: it wasn't reproduced.

### P1 🟡 The same IC can be registered twice (with and without dashes)
- **Where:** `src/app/api/patients/route.ts:14,385-404,420`, `[patientId]/route.ts:13,353`, online booking.
- **Fix:** store one canonical format; normalise before checking and saving.

### P2 🟡 Patient email is unique across all clinics
- **Where:** `prisma/schema.prisma:518` (`email @unique`), `patients/route.ts:483-489`.
- **Effect:** clinic B can't save a shared patient's email, the error reveals it exists elsewhere, portal fails for B.
- **Fix:** **Decision D4** — unique per branch (migration) and stop revealing other clinics' records.

### P3 🟡 Add Patient offers doctors from other branches, then rejects them
- **Where:** `src/components/patients/PatientListView.tsx:184`, `src/app/api/doctors/route.ts:39-44`, `patients/route.ts:368-379`.
- **Fix:** fetch doctors for the active branch only.

### P4 🟡 Super admin: trial edits do nothing for staff accounts; staff listed as "Trial ended"
- **Where:** `src/app/dashboard/admin/page.tsx:60`, `src/lib/subscription.ts:73`.
- **Fix:** show access from `accountAccess()` (covered by / staff-only); explain or disable the trial field for staff.

### P5 🟡 Sign-in loses the page you were opening
- **Where:** `src/middleware.ts:19-21`, `src/components/auth/LoginForm.tsx:57`.
- **Fix:** `callbackUrl` (same-origin paths only) in middleware, form and Google button.

### P6 🟡 Branch "Manage doctors" names link to a 404; admin role changes fail silently
- **Where:** `src/components/dashboard/owner/ManageDoctorsSheet.tsx:161,170`, `BranchDoctorsTab.tsx:24,54-66`.
- **Fix:** link to `/dashboard/doctors/{id}`; role select for OWNER only; toast failed requests.

### P7 ⚪ Dashboard names the wrong branch for doctors
- **Where:** `src/components/dashboard/DashboardView.tsx:235`, `GreetingBar.tsx:64-66`. **Fix:** use the active branch.

### P8 ⚪ Sidebar keeps deleted or renamed branches; every sign-in resets the chosen branch
- **Where:** `BranchSettingsTab.tsx:135`, `BranchListView.handleSaveBranch` (no `router.refresh()`); `src/lib/auth.ts:75-87,167-175`.
- **Fix:** refresh after delete/rename; only set `activeBranchId` at sign-in when it's empty or no longer valid.

### P9 ⚪ Profile edits don't show until signing in again
- **Where:** name/photo: `src/lib/auth.ts:107-135` (only copied at sign-in); photo cache: `src/app/api/doctors/[userId]/photo/route.ts:77-91` (fixed key, delete before upload); cleared phone: `SettingsView.tsx:116`.
- **Fix:** read name/image from the DB in the session callback (or `update()` + refresh); unique photo key, delete old after upload; use the returned phone as is.

### P10 ⚪ Bad input returns 500 instead of 400
- **Where:** `/api/public/booking/[slug]/slots` with `2026-02-30` (`slots/route.ts:10`); `?limit=abc` on `appointments/[id]/audit-log` and `dashboard/activity`; `POST /api/auth/register` with a non-string email.
- **Fix:** validate with zod and default.

### P11 ⚪ IC from 1927–1929 gives a future date of birth
- **Where:** `src/app/api/patients/route.ts:22-23`. **Fix:** compare with the current 2-digit year.

### P12 ⚪ Sign-in form stuck or "?error=undefined" when the network fails
- **Where:** `src/components/auth/LoginForm.tsx:36-58` (no try/catch around `signIn`). Seen on production through a flaky connection.
- **Fix:** catch, reset loading, show "Couldn't reach SmartChiro, try again".

### P13 ⚪ Open tabs can fail after a deploy ("Failed to load chunk")
- **Where:** seen once on production `/dashboard` right after a deploy; no recovery today.
- **Fix:** on `ChunkLoadError`, reload the page once. Confirm it reproduces first.

### P14 ⚪ Flaky tests
- `src/lib/reminders/__tests__/dispatcher-materialize.test.ts` and `src/app/api/appointments/[appointmentId]/__tests__/route.test.ts` fail 1–3 cases depending on the time of day; `xray-rbac` needs R2 credentials.
- **Fix:** freeze time in the reminder tests; mock R2 in the RBAC test.

---

## Decisions (owner, 4 Oct 2026)

- **D1 (S2): invite.** Adding staff who already have a SmartChiro account sends an
  invite they accept from their dashboard; accounts the owner creates (new email)
  join straight away.
- **D2 (S9): read-only.** When a trial ends without a plan, the account can still
  read and export its data; every create / edit / delete answers 402.
- **D3 (M7): move billing.** After an ownership transfer the branch is billed to the
  new owner.
- **D4 (P2): per branch.** Patient email is unique per branch, not across all clinics.

## Checked and fine

AI daily limit (claim, release, cancel); AI results can't land on another X-ray;
`canManageXray`; annotation ownership; portal codes and session scoping; invoice and
receipt PDF ownership; online-booking slot engine and double-booking locks; SST and
rounding; overpayment and refund limits; package session locking; commission maths;
journal balancing; Stripe webhook ordering; Stripe/WhatsApp webhook signatures; ICS token;
reports and exports scoping; disabled accounts drop to 401.

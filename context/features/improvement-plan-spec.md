# SmartChiro Improvement Plan (UX review + Malaysian competitor gaps)

**Source:** `smartchiro-improvement-report.md` (UX review of smartchiro.org, 28 Sep 2026, Owner role on KLCC / Bangsar / Penang Georgetown).
**Status:** Phases 1–7 done (2026-09-29); Phase 8 in progress.
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

### 2.1 Front desk role (report §2, §6 #3)
New `BranchRole.FRONT_DESK` (additive enum migration). Created from Add staff like other roles (no doctor profile, not a clinician, never a calendar column).

| Area | OWNER | ADMIN | DOCTOR | FRONT_DESK |
|---|---|---|---|---|
| Patient demographics & contact (list, detail header, profile, create, edit) | ✓ | ✓ | own patients | ✓ (create/edit; no delete) |
| Patient clinical fields (`medicalHistory`, `notes`), visits / SOAP / questionnaires / vitals / recovery | ✓ | ✓ | own | ✗ (hidden in UI, 403 in API, stripped from patient payloads) |
| X-rays, annotations, exports, compare | ✓ | ✓ | own | ✗ |
| Appointments: book, reschedule, check in / start / complete / no-show, cancel | ✓ | ✓ | own | ✓ (no hard delete) |
| Invoices & payments: issue, mark sent/paid, receipts | ✓ | ✓ | read | ✓ |
| Branch settings, staff, reminder/WhatsApp settings, audit logs | ✓ | read (as today) | ✗ | ✗ |

Front desk dashboard = today's schedule with check-in actions and counts; no clinical stats. Sidebar hides X-rays/Anatomy/Doctors management for FRONT_DESK. Permission checks live in one helper (`src/lib/permissions.ts`) used by routes and UI.
**Done when:** a front-desk login can book, check in and take payment, and every clinical API returns 403/404 for it.

### 2.2 One branch context (report §4 navigation)
The sidebar branch switcher drives every page (patients directory, appointments list/calendar, dashboard, invoices, upcoming-appointments widget). OWNER/ADMIN with more than one branch also get **All branches**. Stored per user (`User.activeBranchId`; "All branches" = new `User.allBranches Boolean @default(false)`), read server-side through `loadBranchContext`. Forms that create records keep an explicit branch field when the scope is "All branches".
- Branch filter chips/selects show names, never ids; internal ids (`personal-patient-003`) are not shown on profiles.
- Patients page is a directory first (upcoming-appointments widget moves below / collapses), whole rows clickable.
- Phone numbers: `tel:` phone icon + separate WhatsApp icon; a cell is never one big WhatsApp link.

### 2.3 Forms (report §4 forms)
- `DateInput` component: typed `dd/mm/yyyy` with a calendar popover, value stays ISO `YYYY-MM-DD`; replaces `<input type="date">` everywhere users enter dates.
- Booking form: branch field (defaults to current branch; required when "All branches"), duration defaults per treatment type (editable), optional room.
- Reminder channel must have a matching contact (WhatsApp/BOTH need a phone, EMAIL/BOTH need an email) — client and API validation; default channel follows what was entered.
- Website field stays empty until typed (no bare `https://`); clinic type shown in Title Case.

### 2.4 Data display, dashboard, polish (report §4, §5)
- Money and dates `whitespace-nowrap`; action columns have a min width; tables at 1280px don't clip actions and scroll sideways only inside the table; truncated text has a `title` tooltip; status tabs don't truncate.
- Doctor names: "Dr." added at display time only once (`displayDoctorName`), fixing "Dr. Dr.".
- Recovery bars: each metric colours by its own direction (lower pain = better) with a label.
- "Next appointment" includes later today; plurals ("1 patient", "0 patients" → "No patients") and empty states don't contradict ("All wrapped up" only when nothing remains).
- Branded `not-found.tsx` with a link back to the dashboard (covers `/dashboard/reports`, `/dashboard/billing` until they exist).
- Dashboard: "New appointment" primary action at the top; the quote card is replaced by owner signals — today's revenue (paid today), no-shows today, stale appointments (past + still SCHEDULED), patients due for recall (no visit in 30+ days and nothing booked).
- Reminder preview uses the full branch name; marketing "Get Started" → `/register`.
- Mobile 390px: headers stack, search placeholder short, "All Branches" button doesn't wrap, no sideways page scroll, cards instead of tables below 640px. (The stale `cursor/mobile-clinic-ux-1187` branch is not merged — it is 30 commits behind `main`; ideas taken from it where still relevant.)


### Phase 2 — record (done 2026-09-29)
- Shipped as specified in four parts (front desk / branch context / forms / display). Permissions live in `src/lib/permissions.ts` (`can(role, capability)`); branch scope in `src/lib/branch-scope.ts` + `loadBranchContext`.
- Decisions made while building: a patient belongs to one branch, so the booking dialog's branch field narrows the patient/doctor pickers and the API rejects a mismatch (`patient_not_in_branch`); with both phone and email the reminder channel defaults to WhatsApp (email fallback already exists); front desk can reassign a patient's doctor (to clinicians only) and read the appointment audit log; DOCTOR loses read access to reminder/WhatsApp settings (was hidden in the UI already); owner signals (revenue) are OWNER/ADMIN only; `/dashboard/reports` renders the branded 404 but returns HTTP 200 in dev because the dashboard `loading.tsx` streams first.
- "Next appointment" already used `dateTime >= now`; no change needed.
- Verified in Chromium against local Postgres: front-desk login books and cancels but gets 403 on visits, patient delete, appointment delete and reminder settings, sees only History/Profile on a patient and no medical history; owner appointments page shows branch names, not ids; no page-level horizontal scroll at 390px on dashboard/appointments/patients/invoices; no hydration errors. 1108/1108 tests, lint 0 errors, build passes.

## Phase 3 — Treatment plans, packages, recurring bookings

Malaysian chiro clinics sell care as prepaid packages (e.g. 12 adjustments) and book 2–3 visits a week. Today revenue for this is tracked outside the app.

### 3.1 Package catalogue and patient packages
- `PackageTemplate` (per branch): name, description, sessions, price (MYR), validity in days (optional), which treatment types redeem it (empty = any), active flag. Managed by OWNER/ADMIN in Branch → Settings → Packages.
- `PatientPackage`: snapshot of name/sessions/price at sale, `sessionsUsed`, `purchasedAt`, `expiresAt`, status `ACTIVE | COMPLETED | EXPIRED | CANCELLED`, sold by, optional sale invoice (Phase 4 links payments). Selling a package from the patient page creates it and a sale invoice (one line: the package).
- `PackageRedemption`: one per appointment (`appointmentId` unique), `redeemedAt`, `redeemedBy`, `reversedAt`. When an appointment is marked **Complete**, the earliest-expiring active package whose treatment types match is redeemed automatically; the panel shows "Package: 5 of 12 used" and an **Undo** (reverse). Appointments paid by a package don't prompt for an invoice.
- Patient page gets a **Packages** section: active packages with sessions left, expiry, history of redemptions; front desk can sell and view (no clinical data).
- Expiry: packages past `expiresAt` become `EXPIRED` (checked on read and by the existing dispatch cron); remaining sessions show as package liability in Phase 5.

### 3.2 Care plans and recurring bookings
- `AppointmentSeries`: patient, doctor, branch, treatment type, duration, room, rule = weekdays (0–6) + start time (clinic time) + every N weeks + end (count or until date), optional link to a `PatientPackage` and a `CarePlan`. Appointments get `seriesId` + `seriesIndex`.
- Booking dialog gets **Repeat** (off / weekly on selected days, every N weeks, N visits or until date). A dry-run endpoint returns every occurrence with its problems (conflict, break, outside hours, past) so the user sees which dates will be skipped or can adjust before creating. Creation runs the same checks per occurrence and creates the valid ones in one transaction.
- Edits on a series appointment ask **This appointment** / **This and following**: time/doctor/duration/cancel apply to the chosen scope; completed and past occurrences are never changed.
- `CarePlan` (clinical, not visible to front desk): title, doctor, visits per week, total visits, start date, goals/notes, status; creating one can generate the series and (optionally) sell a matching package. Shown on the patient page with progress (completed / planned visits).
- Reminders: existing per-appointment reminders already cover series occurrences.
**Done when:** a 12-visit, 3×/week plan can be sold and booked in one flow; completing each visit decrements the package; moving "this and following" shifts the rest.

### 3.3 API (backend built; UI pending)
Migration `20260929040000_packages_series`: `PackageTemplate`, `PatientPackage` (+ `cancelledAt`, `cancelReason`), `PackageRedemption`, `CarePlan`, `AppointmentSeries` (+ `room`), enums `PackageStatus`, `CarePlanStatus`; `Appointment.seriesId` / `seriesIndex` (1-based, date order). Payload types in `src/types/packages.ts`. Errors are `{ error, message }` (+ `details` on 422 validation); cross-branch ids answer 404. Money = number (MYR, 2 dp); calendar days = `"YYYY-MM-DD"` clinic time; instants = ISO.

| Endpoint | Who | Body → response |
|---|---|---|
| `GET /api/branches/[branchId]/packages[?includeInactive=true]` | any member (inactive: OWNER/ADMIN) | → `{ templates: PackageTemplateJson[] }` |
| `POST /api/branches/[branchId]/packages` | OWNER/ADMIN | `{ name, sessions, price, description?, validityDays?, treatmentTypes? (empty = any), isActive? }` → 201 `{ template }` |
| `PATCH / DELETE /api/branches/[branchId]/packages/[templateId]` | OWNER/ADMIN | partial template / soft delete (`isActive=false`) → `{ template }` |
| `GET /api/patients/[patientId]/packages` | OWNER/ADMIN, assigned doctor | → `{ packages: PatientPackageJson[] (with redemptions, newest first), summary: { activeCount, sessionsLeft } }` |
| `POST /api/patients/[patientId]/packages` | OWNER/ADMIN | `{ templateId, notes? }` or `{ name, sessions, price, validityDays?, treatmentTypes?, notes? }` → 201 `{ package }`; creates a SENT sale invoice (one line "Package: <name> (N sessions)"), expiry = end of the clinic day `validityDays` later |
| `PATCH /api/patient-packages/[packageId]` | OWNER/ADMIN | `{ status: "CANCELLED", reason, cancelInvoice? }` and/or `{ notes }` → `{ package }` (422 `invoice_already_paid` when cancelling a paid sale invoice) |
| `POST /api/appointments/[id]/redeem` | OWNER/ADMIN, appointment's doctor | `{ patientPackageId? }` → 201 `{ redemption: RedemptionSummaryJson }`; 409 `no_package` / `already_redeemed` / `appointment_invoiced`, 422 `package_not_eligible` (+ `reason`) |
| `POST /api/appointments/[id]/redeem/reverse` | same | → `{ reversed }` (session restored); 404 `not_redeemed` |
| `PATCH /api/appointments/[id]` | unchanged | status → COMPLETED auto-redeems (series package first, else earliest-expiring matching); → CANCELLED gives the session back; response adds `redemption` (or null). `DELETE` reverses first. |
| `GET /api/appointments/[id]` | unchanged | adds `seriesId`, `seriesIndex`, `redemption`. `GET /api/appointments` adds `seriesId`, `seriesIndex`. |
| `POST /api/appointment-series/preview` | any member; DOCTOR only self | `{ branchId, doctorId, patientId?, weekdays (0=Sun), startTime "HH:MM", intervalWeeks=1, startDate, count? \| until?, duration=30, treatmentType? }` → `{ occurrences: [{ dateTime, ok, problems: ('conflict'\|'break'\|'outside_hours'\|'past'\|'time_off')[], conflicts?, breakLabel?, hours? }], summary: { total, ok, withProblems }, capped }` |
| `POST /api/appointment-series` | as preview | preview body + `patientId`, `room?`, `notes?`, `skipProblemDates=false`, `carePlanId?`, `patientPackageId?` → 201 `{ series, created: SeriesAppointmentJson[], skipped: occurrence[] }`; with problems and `skipProblemDates=false` → 409 `series_problems` + `occurrences` (nothing written) |
| `GET /api/appointment-series/[seriesId]` | any member | → `{ series (with appointments[] incl. `redeemed`), counts: { STATUS: n }, package: { id, name, sessionsTotal, sessionsUsed, sessionsLeft, status, expiresAt } \| null }` |
| `PATCH /api/appointments/[id]?scope=following` | as single PATCH | `{ dateTime?, doctorId?, duration?, status?: "CANCELLED", force?, forceOutsideHours? }` → `{ appointment, updated[], count }`. Applies to this + later occurrences still SCHEDULED/CHECKED_IN and in the future (same time delta). Every moved one is re-checked; any problem → 409 `series_problems` with `occurrences: [{ appointmentId, seriesIndex, dateTime, problems, … }]` and nothing changes. `force` (OWNER/ADMIN) overrides; a DOCTOR's `force` only overrides opening hours; `past` never. |
| `GET /api/patients/[patientId]/care-plans` | OWNER/ADMIN, assigned doctor (never front desk) | → `{ carePlans: CarePlanJson[] }` with `progress: { completed, upcoming, cancelled, noShow, planned }` and package summary |
| `POST /api/patients/[patientId]/care-plans` | same | `{ title, visitsPerWeek, totalVisits, startDate, goals?, doctorId? (default: patient's doctor; DOCTOR = self), packageTemplateId? (OWNER/ADMIN) \| patientPackageId?, series?: { weekdays, startTime, intervalWeeks?, startDate? (= plan), count? (= totalVisits) \| until?, duration?, treatmentType? (default: the package's first type), room?, notes?, skipProblemDates? } }` → 201 `{ carePlan, package \| null, series: { series, created, skipped } \| null }` — one transaction |
| `PATCH /api/care-plans/[carePlanId]` | same | `{ title?, goals?, visitsPerWeek?, totalVisits?, doctorId?, status?, patientPackageId?, cancelRemaining? }` → `{ carePlan, cancelledAppointments }` |

Rules: series weekdays/time are clinic wall-clock; weeks for `intervalWeeks` count from the Monday-start week of `startDate`; `until` is inclusive; past occurrences are skipped and don't count toward `count`; max 104 occurrences. Reversed redemptions stay as history (`reversedAt`), and a reversed appointment can be redeemed again — "one active redemption per appointment" and `sessionsUsed` are kept consistent under row locks (appointment, then package). The dispatch cron marks ACTIVE packages past `expiresAt` as EXPIRED; reads show `effectiveStatus` in between. Role checks carry `TODO(front-desk)` markers for the switch to `src/lib/permissions.ts`.

### Phase 3 — record (done 2026-09-29)
- Backend + UI shipped as specified. Patient page gets a **Care & packages** tab (front desk sees it as **Packages**, without care plans); Branch Settings gets a Packages catalogue (`package.manage` = OWNER/ADMIN); selling uses the shared invoice path (per-branch numbers, SST). Completing an appointment auto-redeems a matching package session (toast + Undo), manual "Use package session" otherwise. Booking dialog has **Repeat** with a live per-date preview; series edits/cancels/drags ask "This / This and following".
- Decisions: redemptions keep history (reversed rows stay; one active per appointment enforced in a locked transaction); packages expire at the end of the clinic day `validityDays` after sale; past dates in a series are skipped and don't count; series occurrences are checked before the create transaction (small race window, same as single bookings); when an edit mixes time with notes/room, notes/room apply to this visit only.
- Known: the patients-page upcoming widget cancels single visits only; week/month calendar views lay out in the device time zone (pre-existing).

## Phase 4 — Payments, manual invoices, SST, receipts

### 4.1 Payments
- `Payment`: invoice, amount, method `CASH | CARD | DUITNOW_QR | FPX | EWALLET | BANK_TRANSFER | PANEL`, reference (e.g. DuitNow ref, card last 4, TPA claim no.), received at (clinic time), received by, notes, `receiptNumber` (unique, per-branch sequence). Deposits, instalments and split payments are just several payments on one invoice.
- Invoice gains `PARTIALLY_PAID` status; `amountPaid` and balance derive from payments; status moves DRAFT/SENT → PARTIALLY_PAID → PAID automatically; `paidAt` = when the balance reached zero. Existing "mark paid" becomes "Record payment" (defaults to the balance, cash).
- Refund = negative payment with a reason (OWNER/ADMIN only).
- Online collection (DuitNow QR / FPX via a gateway such as Billplz or iPay88) needs the clinic's merchant account → not built; methods are recorded manually. Noted as a Phase 8+ option.

### 4.2 Manual invoices
- `POST /api/invoices` creates an invoice without an appointment: patient, branch, line items (description, qty, unit price, taxable), due date, notes; optional links to appointment or patient package. "New invoice" on the Invoices page and patient page. Invoice numbers per branch: `<prefix>-<yyyy>-<seq>` (prefix from branch settings, default branch initials).

### 4.3 SST and clinic tax details
- Branch billing settings: legal name, SSM registration no., TIN, SST registration no., SST enabled, SST rate (default 6%), invoice prefix, payment instructions (bank account / DuitNow ID shown on invoices).
- Patient `nationality` (ISO country, default MY when an MyKad IC is entered); SST applies to taxable lines only when the branch has SST enabled **and** the patient is not Malaysian (chiropractic services to non-citizens since 1 Jul 2025). Invoice stores subtotal, tax rate, tax amount, total so later rate changes don't rewrite history.
- Invoice and receipt PDFs show legal name, SSM, TIN, SST no. (when set), tax breakdown, payments made and balance.
**Done when:** a foreign patient's adjustment invoice shows 6% SST, a split payment (cash + DuitNow) produces two receipts and a PAID invoice, and a Malaysian patient pays no SST.

### 4.4 API (backend built; screens pending)
Migration `20260929050000_payments_sst` (enum `PaymentMethod`, `InvoiceStatus.PARTIALLY_PAID`, `Payment`, invoice tax snapshot + `amountPaid` + `issuedAt`, branch billing fields + `invoiceSeq`/`receiptSeq`, `Patient.nationality`). Existing PAID invoices got one migrated cash payment each (`MIG-<invoiceId>` receipt) so balances hold; older invoices keep their old numbers.

Access: OWNER/ADMIN manage (create, pay, refund); DOCTOR may read invoice detail, PDFs and receipts; FRONT_DESK is pending (`TODO(front-desk)` marks each check — create + record payment yes, refund no). Non-members get 404. Money is ringgit numbers with 2 dp; rounding is half-up on the sen.

| Endpoint | Body / query | Result |
| --- | --- | --- |
| `GET /api/invoices` | `?branchId=&status=all\|DRAFT\|SENT\|OVERDUE\|PARTIALLY_PAID\|PAID\|CANCELLED&search=&page=` | rows gain `amountPaid`, `balance`; `summary.outstanding` = unpaid balance of SENT/OVERDUE/PARTIALLY_PAID; `paidThisMonth` = payments received this clinic month, net of refunds |
| `POST /api/invoices` | `{ patientId, branchId?, lines: [{ description, quantity, unitPrice, taxable? }], dueDate?: "YYYY-MM-DD", notes?, appointmentId?, status?: DRAFT\|SENT }` | 201 `{ invoice }` (detail shape). 422 `validation` / `patient_not_in_branch` / `appointment_mismatch` |
| `GET /api/invoices/[id]` | — | `{ invoice }`: lines, `subtotal`, `taxRate`, `taxAmount`, `taxLabel`, `total` (= `amount`), `amountPaid`, `balance`, `status`, `patient` (`nationality`, `isMalaysian`), `branch` tax details, `payments[]` (`receiptNumber`, `method`, `methodLabel`, `reference`, `receivedAt`, `receivedBy`, `isRefund`, `refundReason`) |
| `PATCH /api/invoices/[id]` | `{ status: SENT\|PAID\|CANCELLED, method?, reference? }` | PAID records one payment for the balance (default CASH) → `{ invoice, payment }`. PARTIALLY_PAID can only go to PAID; cancelling with money on it → 422 `invoice_has_payments` |
| `POST /api/invoices/[id]/payments` | `{ amount, method, reference?, receivedAt?: "YYYY-MM-DD" \| ISO, notes? }`; refund: `{ amount: -n, method, refundReason }` | 201 `{ payment, invoice }`. 422 `overpayment` (+`balance`), `invoice_cancelled`, `refund_reason_required`, `refund_exceeds_paid`, `received_in_future`; refunds by DOCTOR → 403 |
| `GET /api/invoices/[id]/payments/[paymentId]/receipt` | — | receipt PDF for that payment (method, reference, receipt no., paid to date, balance after) |
| `GET /api/invoices/[id]/pdf` | — | invoice PDF (tax breakdown, payments table, balance, payment instructions); a receipt once PAID |
| `POST /api/invoices/[id]/regenerate` | `{ lineItems? }` | as before; totals/SST recomputed; 422 `invoice_has_payments` when money was taken |
| `POST /api/appointments/[id]/invoice` | `{ amount, dueDays?, lineItems? }` | as before; now numbered per branch and SST-aware |
| `GET/PUT /api/branches/[id]/billing` | `{ legalName?, ssmRegNo?, tin?, sstRegNo?, sstEnabled?, sstRate?, invoicePrefix?: 1–8 A–Z/0–9, paymentInstructions? }` (omitted = unchanged, "" clears) | `{ billing: {…, effectivePrefix, nextInvoiceNumber, nextReceiptNumber}, canEdit }`. OWNER writes, ADMIN reads |
| `POST /api/patients`, `PATCH /api/patients/[id]` | `nationality`: ISO 3166-1 alpha-2 (case-insensitive) or null | stored upper-case; omitted + valid MyKad IC → `MY`; unknown code → 400 |

Numbers: `INV-<PREFIX>-<YYYY>-<00001>` / `RCP-…`, one sequence per branch (bumped with `UPDATE … RETURNING` inside the transaction; a number already used by another branch with the same prefix is skipped). Year = clinic year at issue.

Reusable server code (`src/lib/invoices.ts`): `createInvoice(tx, { branchId, patientId, lines, dueDate?, notes?, appointmentId?, status?, issuedAt? })` (use it for the package sale), `recordPayment(tx, …)`, `computeTotals`, `isMalaysianPatient`, `invoiceStatusFor`, `nextNumber`, `PAYMENT_METHOD_LABEL`. Detail/PDF assembly in `src/lib/invoice-detail.ts`. The optional link from a manual invoice to a patient package lands with the Phase 3 package models (the package sale calls `createInvoice`).

For the screens: the list's status styles need a `PARTIALLY_PAID` entry ("Partially paid"); "Mark paid" should become "Record payment" (amount defaults to `balance`, method defaults to cash); the patient page and Invoices page get "New invoice"; Branch → Settings gets a Billing & tax card.

### Phase 4 — record (done 2026-09-29)
- Payments (cash, card, DuitNow QR, FPX, e-wallet, bank transfer, panel), part payments/deposits/instalments/split, refunds (OWNER/ADMIN, reason required; a partial refund reopens the balance), receipts per payment, manual invoices with a line editor and live SST preview, per-branch numbers `INV-<PREFIX>-<YYYY>-<00001>` / `RCP-…`, Billing & tax settings (legal name, SSM, TIN, SST no., rate, prefix, payment instructions) printed on PDFs, patient nationality (MyKad → MY by default).
- UI: Invoices page drawer (`?invoice=<id>` deep link), Record payment / Refund dialogs, New invoice from the Invoices page and the patient page's **Billing** tab, balance chip on the patient header. Front desk records payments but can't refund; doctors read only.
- Migration backfills one CASH payment per previously PAID invoice so balances and "paid this month" stay correct. Online collection (DuitNow/FPX gateway) not built — needs a merchant account.

## Phase 5 — Reports

`/dashboard/reports` for OWNER/ADMIN (new capability `reports.read`), following the sidebar branch scope (one branch or All branches) with a date range: Today, This week, This month (default), Last month, Last 90 days, Custom (DateInput). All ranges are clinic days (Asia/Kuala_Lumpur).

| Section | Metrics |
|---|---|
| Revenue | Collected (payments net of refunds) and invoiced (issued, excluding cancelled) with a daily/weekly trend; split by branch, by doctor (the appointment's doctor; manual invoices → "No appointment", package sales → "Package sales") and by treatment type |
| Receivables | Open balance, overdue balance, oldest overdue invoices |
| Appointments | Booked, completed, cancelled, no-show; no-show rate = no-show ÷ (completed + no-show); cancellation rate; per doctor |
| Utilisation | Booked minutes ÷ available minutes per doctor. Available = doctor weekly schedule (falls back to branch hours) minus breaks and time off over the range |
| Packages | Active packages, sessions outstanding, liability = sessions left × unit value, packages expiring in 30 days, sold in range |
| Patients | New patients in range, returning patients (visit in range and an earlier visit), lapsed (active, last visit 60+ days ago, nothing booked) |

- One endpoint per section under `/api/reports/*` (so each card loads independently), all scoped with `loadBranchContext` and `reports.read`.
- Every table has **Export CSV**. Charts are plain SVG (no new chart library), readable in light mode, with numbers labelled.
- Sidebar gets a **Reports** link for OWNER/ADMIN (the report's 404 goes away).
**Done when:** an owner can answer "how much did we collect this month, per doctor, and what do we still owe in package sessions" from one page, and the CSV totals match the cards.

### Phase 5 — record (done 2026-09-29)
- Shipped as specified: six independently loading cards with SVG charts and CSV export (`src/lib/reports/*`, `/api/reports/*`, `src/components/reports/*`), Reports link for OWNER/ADMIN, front desk/doctors get 403/404.
- Receivables, package liability and lapsed patients are "as of now", not range-limited (labelled on the cards). Overdue includes part-paid invoices past due. Utilisation uses the doctor's weekly schedule (not per-branch), so a doctor split across branches looks under-utilised in a single-branch view; owners count as clinicians and show 0% if they don't treat.
- Verified: CSV totals match the cards (revenue and packages), weekly buckets over 90 days, 390px no page overflow; 1215 tests at merge time.

## Phase 6 — WhatsApp recall and review requests

Recall is where clinics win back revenue; today only appointment reminders exist.

### 6.1 Languages
- Patient `preferredLanguage` gains `zh` (Simplified Chinese). The reminder template gets a `zh_CN` translation; email reminder defaults get a Chinese version. Language pickers show English / Bahasa Melayu / 中文.

### 6.2 Consent (PDPA + Meta marketing rules)
- Patient `marketingConsent` (default false) + `marketingConsentAt`. Recall and review messages go only to consenting patients; appointment reminders (utility) don't need it. Consent is a checkbox on add/edit patient and the profile, and every outreach message says how to opt out ("Reply STOP"). An inbound "STOP" on WhatsApp (webhook `messages`) clears consent.

### 6.3 Outreach
- Branch outreach settings (in the Reminders card): recall on/off, recall after N days since last visit (default 42), cooldown before recalling again (default 90), daily limit (default 30); review requests on/off, send N hours after a completed visit (default 3), cooldown per patient (default 180 days), Google review URL.
- `PatientOutreach` rows (type `RECALL | REVIEW`, channel, status `PENDING | SENT | FAILED | SKIPPED`, scheduled/sent times, external id, failure reason, appointment for reviews). The existing dispatch cron materialises candidates and sends due rows: WhatsApp template first (when the branch is connected and the template approved), email fallback.
- Recall candidate: active, consenting patient, last completed visit ≥ N days ago, nothing booked, not recalled within the cooldown. Review candidate: appointment COMPLETED ≥ delay hours ago (and within 3 days), patient consenting, no review request within the cooldown, branch has a review URL.
- WhatsApp templates `smartchiro_recall_v1` and `smartchiro_review_v1` (category MARKETING, en / ms / zh) are created with the reminder template on connect and on "Refresh templates"; status is tracked per template and language.
- Manual actions: "Send recall" on the dashboard's recall signal and on a patient; outreach history on the patient profile and a branch outreach log (last 100) in settings.
**Done when:** a lapsed consenting patient gets one recall (WhatsApp or email) and not again within the cooldown; a completed visit triggers one review request; a non-consenting patient gets neither.

### Phase 6 — record (done 2026-09-29)
- Recall and review requests (`PatientOutreach`), Chinese (`zh` / Meta `zh_CN`) for reminders, recall and review, marketing consent with STOP / BERHENTI / 停止 opt-out via the WhatsApp webhook, outreach settings + log in the Reminders card, "Send recall" on the dashboard signal and patient profile. WhatsApp templates `smartchiro_recall_v1` / `smartchiro_review_v1` (MARKETING) are created with the reminder template; `templateStatus` keeps reminder statuses at the top level and others under `templates[name][lang]` (no data migration).
- Decisions: automatic outreach only goes out 09:00–20:00 clinic time (queued otherwise to 10:00); manual recall skips timing rules but still needs consent, contact and an active patient; the cooldown counts every recall row (incl. skipped/failed) so the cron doesn't re-create rows; without `RESEND_API_KEY` email outreach is SKIPPED.
- Not built: a booking link inside recall messages (branch phone used until Phase 7), editable outreach email text.

## Phase 7 — Online booking and patient portal

### 7.1 Online booking link
- Branch settings → **Online booking** (OWNER/ADMIN): on/off, link slug (default from the branch name, unique), treatments offered, doctors bookable (default all clinicians), lead time (default 2 h), how far ahead (default 30 days), slot step (default 15 min), note shown to patients. The card shows the link with Copy and a WhatsApp share (`wa.me/?text=`).
- Public page `/book/[slug]` (no login, mobile-first): treatment → doctor or "Any doctor" → date (days with no slots disabled) → time → details (name, phone required, email and IC optional, notes, PDPA data-processing consent required, marketing consent optional) → confirmation with the booking details, an `.ics` download and a WhatsApp link to the clinic.
- Slots = doctor's weekly schedule (else branch hours) ∩ branch hours − breaks − time off − existing non-cancelled appointments − lead time, stepping by the slot size, for the treatment's default duration. The same engine re-checks on submit (409 `slot_taken` → pick another).
- Patient matching in the branch by normalised phone (reuse the record, fill empty contact fields), else a new patient (status `new`, doctor = booked doctor). `Appointment.source` (`STAFF | ONLINE`, default STAFF); audit entry "Online booking"; the doctor gets the existing booking email and branch managers get a notification email (fail-soft). Reminders apply as for any booking.
- Abuse limits: honeypot field, per-IP rate limit, at most 2 online bookings per phone per day, zod validation, no patient data returned beyond the booking itself.
- **Built:** `src/lib/booking/*` (pure slot engine `slots.ts`, DB loader `availability.ts` — one query per table, `book.ts` re-checks inside a transaction holding advisory locks on the phone and candidate doctors), public API `/api/public/booking/[slug]` (config, `/days`, `/slots`, `/book`, `/ics` with an AUTH_SECRET HMAC token), staff `GET/PUT /api/branches/[branchId]/booking` (OWNER/ADMIN, `409 slug_taken`), `OnlineBookingCard` in Branch Settings, `/book/[slug]`, "Online" badge in the appointment panel and calendar popover. Empty treatments = Initial Consult / Adjustment / Follow-Up; empty doctors = every clinician (OWNER/DOCTOR). "Busy" = any non-cancelled, non-no-show appointment of the doctor in any branch. The per-IP limit is an in-memory token bucket per server process (5 bookings burst, then 1 per 2 min; 120 reads burst) — on several instances each keeps its own buckets, so the DB per-phone cap is the hard limit. New online patients are created active, with `marketingConsent` / `marketingConsentAt` set from the booking form's consent box (an existing patient's consent is only ever turned on, never off, by a booking).

### 7.2 Patient portal
- `/portal`: sign in with email (one-time 6-digit code by email, 10-minute expiry, 5 attempts, rate-limited); WhatsApp code later when an authentication template exists. A session covers every patient record (across branches) with that verified email.
- Portal shows upcoming appointments (cancel up to the branch's cutoff, default 24 h; "Book again" links to the booking page), packages with sessions left and expiry, invoices and receipts (PDF download through portal-authorised routes), and contact details (read-only, "ask the clinic to change").
- Sessions: `PatientPortalSession` (hashed token, patient email, expiry 30 days), httpOnly secure cookie; codes stored hashed. No clinical notes or X-rays in the portal.

### Phase 7 — record (done 2026-09-29)
- 7.1 online booking: see **Built** above.
- 7.2 patient portal: migration `20260929080000_patient_portal` (`Branch.portalCancelHours` default 24, `PortalLoginCode`, `PortalSession` — named `PortalSession`, not `PatientPortalSession`). `src/lib/portal/*` (codes are HMAC-SHA256 of email + code keyed from `AUTH_SECRET`; a new code retires older ones; each guess burns an attempt atomically; session token 32 random bytes stored hashed, 30-day sliding at most hourly; patients re-resolved from the email on every request so an email change on the staff side ends access). Limits: 3 codes / 15 min and 10 / day per email (DB), 30 guesses / 15 min per IP (in-memory, per instance). `request-code` always answers 200 and sends after the response; every verify failure is the same 400. POSTs reject a foreign `Origin`. API `/api/portal/{request-code,verify,logout,me,appointments,appointments/[id]/cancel,packages,invoices,invoices/[id]/pdf,invoices/[id]/payments/[paymentId]/receipt}`; staff `GET/PUT /api/branches/[branchId]/portal-settings` (OWNER/ADMIN, 0–336 h) with a "Patient portal" card in Branch Settings and a portal note on the patient Profile tab. Portal cancel reuses the staff steps (audit actor "Patient portal", pending reminders removed, package redemption reversed). Invoices shown: SENT / PARTIALLY_PAID / PAID / OVERDUE. "Book online" appears next to each clinic when its booking page is on. Dev without a Resend key logs the code; production never does.

## Phase 8 — MyInvois, commissions, T&CM expiry, accounting export

### 8.1 Practising certificates (T&CM Act 2016)
- Doctor profile: T&CM registration no., Annual Practising Certificate (APC) no. and expiry date (DateInput), shown on the doctor page. OWNER/ADMIN (and the doctor themself) edit.
- Alerts: dashboard card for OWNER/ADMIN listing certificates expired or expiring within 60 days; badge on the Doctors list; one email to branch owners at 60 / 30 / 7 days and on expiry (daily cron, once per threshold, fail-soft).

### 8.2 Commissions
- Rules per branch (OWNER/ADMIN): doctor (or all), treatment type (or all), basis `PERCENT_COLLECTED` (share of payments collected on that doctor's appointments), `FIXED_PER_VISIT` (per completed visit) or `PERCENT_PACKAGE_SALE` (share of package sales the doctor sold), rate, effective from. The most specific active rule wins (doctor+treatment > doctor > treatment > all).
- Report: Reports page **Commissions** card — per doctor: basis amounts, commission, total; CSV export.

### 8.3 Accounting export
- Invoices page **Export**: invoices CSV, payments CSV, Xero sales-invoice import CSV, and a generic journal CSV (date, account, debit, credit, reference, description) usable for AutoCount / SQL Account imports. Account codes (sales, SST payable, receivables, cash/bank per payment method) live in Billing & tax settings with sensible defaults. Scoped to the branch scope and a date range; OWNER/ADMIN.

### 8.4 LHDN MyInvois e-invoicing
- Build the e-invoice document (UBL 2.1 JSON, invoice type 01, credit note 02 for refunds) from the invoice, branch billing details (TIN, BRN/SSM, SST no., MSIC code, business activity, address) and the buyer (patient IC or passport; B2C buyers without a TIN use the general public TIN). Monthly consolidated e-invoice for B2C invoices that weren't issued individually.
- Submission client behind env config (`MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET`, `MYINVOIS_ENV` = sandbox | production): OAuth client credentials, submit, poll status, store UUID / long ID / status / validation link, show a QR of the validation link on the invoice PDF. Without credentials the UI offers the JSON download only.
- Document signing (digital certificate) is required for v1.1 documents: the signer is pluggable and the owner must supply the certificate; v1.0 (unsigned) is generated meanwhile. The RM3m threshold / phase dates must be confirmed by the owner (report caveat).

#### 8.4 build notes (as built)
- Migration `20260929100000_myinvois`: `Branch.msicCode / businessActivity / einvoiceEnabled`, `Patient.passportNumber`, enums `EInvoiceStatus` (NOT_SUBMITTED, SUBMITTED, VALID, INVALID, CANCELLED) and `EInvoiceKind` (INVOICE, CREDIT_NOTE, REFUND_NOTE, CONSOLIDATED), model `EInvoiceSubmission` (code number, version, SHA-256 hash, exact JSON sent, submission UID, UUID, long ID, errors, period, submitted/validated/cancelled at), `Invoice.einvoiceStatus` + `consolidatedIntoId`.
- Library `src/lib/myinvois/`: `document.ts` (pure UBL 2.1 JSON builders), `source.ts` (records → document model with field errors, SST spread over taxable lines), `validate.ts`, `hash.ts`, `signer.ts` (v1.0 unsigned default, pluggable v1.1), `client.ts` (token cache, 429/503 retry honouring `Retry-After`, 401 re-login), `service.ts` (DB), `codes.ts` (code tables + configurable assumptions).
- API: `GET/POST /api/invoices/[id]/einvoice` (status + pre-check, refreshes SUBMITTED; submit or `{ paymentId }` refund note — OWNER/ADMIN), `GET /api/invoices/[id]/einvoice/document.json` (`?paymentId=`, `?submitted=1`; no credentials needed), `POST /api/einvoice/submissions/[id]/cancel` (72 h), `GET/PUT /api/branches/[id]/einvoice` (MSIC, activity, toggle, readiness, connection status — never secrets), `GET/POST /api/branches/[id]/einvoice/consolidated?month=YYYY-MM` (`&format=json`). The reminders dispatch cron also refreshes SUBMITTED documents (fail-soft).
- UI: e-Invoice section inside Billing & tax (with the monthly consolidated panel), e-Invoice panel in the invoice drawer, passport no. on the patient edit dialog, validation QR + UUID on the invoice PDF (QR drawn with the vendored MIT Nayuki encoder, `src/lib/vendor/qrcodegen.ts`).
- Env: `MYINVOIS_CLIENT_ID`, `MYINVOIS_CLIENT_SECRET`, `MYINVOIS_ENV` (sandbox | production), optional `MYINVOIS_ON_BEHALF_OF` (intermediary TIN), `MYINVOIS_DOCUMENT_VERSION` (1.0 default), and URL overrides `MYINVOIS_API_URL` / `MYINVOIS_IDENTITY_URL` / `MYINVOIS_PORTAL_URL`.

#### 8.4 verified vs assumed
Verified against the SDK text (via the mirror below): login `POST {identity}/connect/token` form-encoded `client_credentials` + `scope=InvoicingAPI`, 3600 s tokens to be reused, `onbehalfof` header for intermediaries; submit `POST /api/v1.0/documentsubmissions/` with `documents[{format, document (base64), documentHash (SHA-256), codeNumber}]` → 202 `submissionUID`/accepted/rejected (the field is spelled `submissionUID` there and `submissionUid` elsewhere — both accepted); `GET /api/v1.0/documentsubmissions/{uid}` (poll every 3–5 s); `GET /api/v1.0/documents/{uuid}/details`; `PUT /api/v1.0/documents/state/{uuid}/state {status:"cancelled", reason}` within 72 h; validation link `{portal}/{uuid}/share/{longId}`; hosts `preprod-api.myinvois.hasil.gov.my` / `api.myinvois.hasil.gov.my`, portals `preprod.myinvois.hasil.gov.my` / `myinvois.hasil.gov.my`; 429 with `Retry-After` seconds; rate limits (login 12 RPM, submit 100, get submission 300, cancel 12, details 125); limits 100 docs / 5 MB per submission, 300 KB per document; UBL JSON structure and element names (every element we emit exists at the same path in the official v1.0 invoice / consolidated / credit / refund samples — unit-tested); type codes 01/02/04, `listVersionID` 1.0 vs 1.1 differ only by signature validation; tax types 02 Service Tax / 06 Not Applicable; classification 004 consolidated / 022 Others; state codes 01–17; general TINs `EI00000000010` (Malaysian with MyKad only, and General Public) and `EI00000000020` (foreign buyer); consolidated buyer "General Public" + NA identifiers, state 17; consolidation due within 7 days after month end; no consolidation for single transactions over RM10,000 from 1 Jan 2026 (Specific Guideline v4.8 Table 3.6); IssueDate/IssueTime in UTC at submission.

Assumed / ambiguous (configurable constants in `src/lib/myinvois/codes.ts`, comments in code):
- **Refunds are refund notes (04), not credit notes (02).** The SDK defines the credit note as a reduction "not involving return of monies" and the refund note as confirming a refund of the buyer's payment, so a recorded refund payment is submitted as 04. The 02 builder exists for non-cash reductions.
- **No-SST lines use tax type 06** (Not Applicable, 0%). An SST-registered clinic's services to Malaysians might instead be reported as "E" (exempt) with a reason — confirm with the tax agent.
- **Classification 022 "Others"** for chiropractic lines; 020/021 are medical tax-relief categories that don't clearly fit. Confirm with the tax agent.
- **Consolidated buyer address:** the SDK says line 0 "NA" with only the state (17); the official sample sends empty strings for the other fields, which LHDN reportedly began rejecting in Aug 2026 (community report). We send city "NA" and country MYS.
- **Production identity host:** the SDK's own production Postman environment lists the identity base as "TBD"; community SDKs use `api.myinvois.hasil.gov.my`. Override with `MYINVOIS_IDENTITY_URL` if LHDN says otherwise.
- **Individual e-invoice to a Malaysian with only MyKad** uses `EI00000000010` + NRIC (Specific Guideline §3.5.7 option 2); a community report says general TINs force classification 004, but that concerns "NA" IDs on consolidated documents — to confirm in sandbox.
- **Consolidated amounts** are the invoices issued in the clinic month (not payments collected); one line per invoice (method (a)), split into SST / non-SST lines when mixed; up to 100 lines per document.
- **BRN:** the 12-digit SSM number is extracted from "202401012345 (1234567-A)"; old-format-only numbers are sent as typed with a warning.
- Not built: v1.1 XAdES signing (needs the owner's certificate; interface + `NotConfiguredSigner` only), debit notes, self-billed documents, buyer TIN lookup, rejection requests from buyers, notifications API.

#### 8.4 owner actions
- Register the ERP system in the MyInvois portal (sandbox first) and set `MYINVOIS_CLIENT_ID` / `MYINVOIS_CLIENT_SECRET` / `MYINVOIS_ENV` on the server; test in sandbox before production.
- Fill Billing & tax (legal name, 12-digit SSM no., TIN, SST no.) and the branch address/state/phone; choose the MSIC code registered with LHDN (e.g. 86909 "Other human health services n.e.c." or 86903 — confirm) and the activity description; then turn e-invoicing on per branch.
- Confirm with the tax agent: tax type for non-SST lines (06 vs E), classification code (022), and the RM3m threshold / phase dates (report caveat).
- For v1.1 (signed) documents: buy a digital certificate from an MCMC-licensed CA and have a signer implemented against `DocumentSigner`.
- Run the monthly consolidated e-invoice within 7 days after each month end (Billing & tax → e-Invoice → Monthly consolidated).

#### 8.4 sources
- MyInvois SDK (official, `sdk.myinvois.hasil.gov.my` — blocked from the build environment) read through the community mirror [deadboy18/myinvois-docs](https://github.com/deadboy18/myinvois-docs) (verified Aug 2026; each page cites its SDK URL): [Login as Taxpayer](https://sdk.myinvois.hasil.gov.my/api/07-login-as-taxpayer-system/), [Login as Intermediary](https://sdk.myinvois.hasil.gov.my/api/08-login-as-intermediary-system/), [Submit Documents](https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents/), [Cancel Document](https://sdk.myinvois.hasil.gov.my/einvoicingapi/03-cancel-document/), [Get Submission](https://sdk.myinvois.hasil.gov.my/einvoicingapi/06-get-submission/), [Get Document Details](https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/), [Standard error response](https://sdk.myinvois.hasil.gov.my/standard-error-response/), [Integration practices / rate limits](https://sdk.myinvois.hasil.gov.my/integration-practices/), [Document types](https://sdk.myinvois.hasil.gov.my/documents/) (Invoice / Credit Note / Refund Note v1.0 and v1.1), [Code tables](https://sdk.myinvois.hasil.gov.my/codes/) (tax types, classification, state, country, MSIC), official v1.0 sample JSONs and Postman environments (copies of the samples in `src/lib/myinvois/__fixtures__/lhdn-*.json`), official FAQ (v1.0 vs v1.1).
- IRBM [e-Invoice Specific Guideline v4.8](https://www.hasil.gov.my/en/e-invoice/) §3.5.7 (buyer TIN options), §3.6 (consolidated e-invoice, 7 days, General Public details), §3.7.2 Table 3.6 (no consolidation above RM10,000), §10.5 (foreign buyer TIN) — via the mirror's `11-irbm-specific-guideline`.
- Secondary: [farhan-syah/myinvois-client](https://github.com/farhan-syah/myinvois-client) (TypeScript SDK — base URLs, token caching, response shapes); the mirror's `12-cookbook` (community production notes: general-TIN classification, empty-string rejection Aug 2026, curl reference incl. portal hosts).
- QR encoder: [nayuki/QR-Code-generator](https://github.com/nayuki/QR-Code-generator) (MIT).

---

## Owner actions carried from the report

- Delete test data created by the wizard bug: two `TEST UX Patient` records (`cmul4q8i1000004i9hqqvd9zl` with one visit + one appointment on 28 Sep 7:00 PM with Dr. Suresh Menon, and duplicate `cmul4rnmn000004l0k507qdyd`). Not done from code — production data.
- Verify the LHDN e-invoice RM3m threshold (Guideline v4.8) before Phase 8.
- Create Doctor and Admin test logins to re-test role views after Phase 2.

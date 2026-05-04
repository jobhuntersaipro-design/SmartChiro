# Past Appointments Sub-Tab — Spec

**Status:** Draft — awaiting approval before implementation
**Author:** Claude (Opus 4.7)
**Date:** 2026-05-03
**Related branch (proposed):** `feat/past-appointments-tab`

---

## 1. Summary

Add a sub-tab system under the patient detail page so owners/admins/doctors can review and manage **past appointments** for a specific patient — separate from the existing clinical **Visits** tab. The sub-tab surfaces:

- Every appointment whose `dateTime < now`, regardless of status (so stale `SCHEDULED` rows surface and prompt cleanup).
- At-a-glance stats per patient: count by status (Completed / Cancelled / No-show / Stale) and revenue paid (with outstanding shown alongside).
- Management actions: edit notes/status retroactively, create a Visit record from a Completed appointment that has none, issue / regenerate an Invoice.

The current "Visits" top-level tab is renamed to **History** and contains two sub-tabs: `Visits | Appointments`. Visits tab content stays exactly as it is; the new Appointments sub-tab is the focus of this spec.

---

## 2. Locked Decisions (from clarifying questions, 2026-05-03)

| # | Decision |
|---|---|
| Q1 | Convert top-level "Visits" tab → "History" with sub-tabs **`Visits | Appointments`**. Visits sub-tab is unchanged. |
| Q2 | "Past" = `dateTime < now` regardless of status. Stale `SCHEDULED` rows are surfaced with an amber "Stale" pill. |
| Q3 | Revenue = `SUM(Invoice.amount)` WHERE `Invoice.patientId = ? AND Invoice.status = PAID`. Show **Paid** as the headline; **Outstanding** = `SUM(amount)` over `SENT + OVERDUE` shown underneath. |
| Q4 | All four management actions in scope: ✅ edit notes/status retroactively · ✅ create Visit from appointment · ✅ issue invoice · ✅ regenerate invoice. Hard delete remains under existing OWNER/ADMIN delete flow (DELETE `/api/appointments/:id`). Reschedule is explicitly out of scope (doesn't apply to past). |
| Q5 | RBAC: **OWNER / ADMIN** = full CRUD on past appointments + invoices for any patient at branches they own/admin. **DOCTOR** = read-only on past appointments tab. |

---

## 3. Information Architecture

### 3.1 Tab structure (before → after)

**Before:** `Overview · Visits · X-Rays · Profile`

**After:** `Overview · History · X-Rays · Profile`
- Inside **History**, two sub-tabs at the top of the panel: `Visits | Appointments`
- Default sub-tab: `Visits` (matches today's behavior — anyone deep-linked via `?tab=visits` lands on the same content they expect).

### 3.2 Deep-link compatibility

URL search params:
- `?tab=visits` — preserved, opens History → Visits sub-tab. **Backwards compatible.**
- `?tab=history&sub=appointments` — opens new tab + sub-tab.
- `?tab=visits` (legacy bookmarks) → server resolves to `History/Visits`.

Sub-tab state stored in URL (not localStorage) so the back button works and links can be shared.

### 3.3 Sub-tab layout (Appointments)

```
┌─────────────────────────────────────────────────────────────────┐
│  [ Visits | Appointments ]                                       │   ← sub-tabs
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│   │Completed│ │Cancelled│ │ No-Show │ │  Stale  │ │ Revenue │   │   ← 5 stat cards
│   │   12    │ │    1    │ │    2    │ │    0    │ │ RM 1,820│   │
│   │         │ │         │ │         │ │         │ │ RM 240↓ │   │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                  │
│   Filters: [Status ▾] [Doctor ▾] [Date range ▾]    [× Clear]    │   ← filter bar
│                                                                  │
│   ┌────────────────────────────────────────────────────────────┐│
│   │ When · Doctor · Branch · Status · Visit · Invoice · Actions││   ← sortable table
│   │  …rows…                                                    ││
│   └────────────────────────────────────────────────────────────┘│
│                                                                  │
│   Showing 1–10 of 15      < Page 1 of 2 >                       │   ← pager
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 Findings from existing schema (`prisma/schema.prisma`)

- `Appointment` has `status` (enum) and `notes` already — no new fields needed for retroactive edits.
- `Visit.appointmentId` is `String? @unique` but **has no Prisma relation** declared — only a unique scalar. To traverse `appointment → visit` cheaply, we need to add an explicit relation.
- `Invoice` has no FK to `Appointment` or `Visit` — invoices are loose (linked only to `Patient` + `Branch`). To support "issue invoice for this past appointment" cleanly, we add an optional `appointmentId`.

### 4.2 Schema migration: `add_appointment_visit_invoice_links`

```prisma
model Visit {
  // ... existing fields
  appointmentId String?      @unique
  appointment   Appointment? @relation(fields: [appointmentId], references: [id], onDelete: SetNull)  // NEW relation
  // ...
}

model Appointment {
  // ... existing fields
  visit    Visit?     // NEW back-relation (one-to-one via Visit.appointmentId)
  invoices Invoice[]  // NEW back-relation (one-to-many)
  // ...
}

model Invoice {
  // ... existing fields
  appointmentId String?       // NEW
  appointment   Appointment?  @relation(fields: [appointmentId], references: [id], onDelete: SetNull)  // NEW
  // ...
  @@index([appointmentId])    // NEW
}
```

Migration name: `20260503000000_link_appointments_visits_invoices`

**Backfill:** none required. `appointmentId` defaults to NULL on existing invoices and visits-without-appointment-link continue to work.

### 4.3 No new models

We deliberately don't add a separate `PastAppointmentNote` or audit-log table — `Appointment.notes` + Prisma's `updatedAt` is sufficient for v1. If audit history is required later (who changed status, when), that's a separate spec.

---

## 5. API Endpoints

All endpoints scope by branch membership using the existing `auth()` + `branchMemberships` pattern. RBAC enforced server-side; client never trusts the role from the session alone.

### 5.1 `GET /api/patients/[patientId]/past-appointments`

List past appointments for a patient with computed stats.

**Query params:**
- `status` (optional, comma-separated): `COMPLETED`, `CANCELLED`, `NO_SHOW`, `STALE` (= SCHEDULED with `dateTime < now`)
- `doctorId` (optional)
- `from`, `to` (optional ISO dates) — date-range filter on `dateTime`
- `sort`: `when` | `doctor` | `branch` | `status` (default `when`)
- `dir`: `asc` | `desc` (default `desc` — most recent first)
- `page` (1-indexed, default 1), `pageSize` (default 10, max 50)

**Response:**

```ts
{
  stats: {
    completed: number;
    cancelled: number;
    noShow: number;
    stale: number;       // SCHEDULED with dateTime < now
    paid: number;        // SUM(Invoice.amount WHERE status=PAID)
    outstanding: number; // SUM(Invoice.amount WHERE status IN (SENT, OVERDUE))
    currency: "MYR";
  };
  appointments: Array<{
    id: string;
    dateTime: string;                     // ISO
    duration: number;                     // minutes
    status: AppointmentStatus;
    isStale: boolean;                     // true if status=SCHEDULED && dateTime<now
    notes: string | null;
    doctor: { id: string; name: string };
    branch: { id: string; name: string };
    visit: { id: string; visitDate: string } | null;       // linked clinical visit, if any
    invoices: Array<{ id: string; invoiceNumber: string; amount: number; status: InvoiceStatus }>;
  }>;
  total: number;       // total filtered (for pager)
  page: number;
  pageSize: number;
}
```

**Caching:** none in v1 (data changes on writes). Consider `Cache-Control: private, max-age=15` if the page sees re-fetch pressure.

### 5.2 `PATCH /api/appointments/[appointmentId]`

**Already exists** for status/notes/doctor/datetime updates. Reuse for retroactive edits — no new endpoint. Add a server-side guard:

- If `dateTime` is in the past, **block** changes to `dateTime` and `doctorId` (reschedule semantics don't apply). Allowed past-edits: `status`, `notes` only.
- DOCTOR role: 403 (read-only) for past appointments per Q5.

### 5.3 `POST /api/appointments/[appointmentId]/visit`

Create a Visit record from a past appointment (one-click "create visit"). Idempotent: if `Visit` with `appointmentId = X` already exists, returns that visit instead of creating.

**Body:**
```ts
{
  visitType?: "INITIAL_CONSULTATION" | "FIRST_TREATMENT" | "FOLLOW_UP" | "RE_EVALUATION" | "EMERGENCY" | "DISCHARGE" | "OTHER";
  chiefComplaint?: string;
  // SOAP, vitals, etc. — all optional, doctor fills in later in Visits tab
}
```

**Behavior:**
- Pre-condition: appointment must be `COMPLETED`. If not, 422 `appointment_not_completed`.
- Sets `Visit.appointmentId = appointmentId`, `Visit.patientId = appt.patientId`, `Visit.doctorId = appt.doctorId`, `Visit.visitDate = appt.dateTime`.
- Returns `{ visit: { id, ... } }`. Client can navigate to Visits sub-tab and open the editor for the new visit.

### 5.4 `POST /api/appointments/[appointmentId]/invoice`

Issue a fresh invoice tied to this appointment. Returns the new invoice.

**Body:**
```ts
{
  amount: number;               // RM (decimal)
  dueDays?: number;             // default 14
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  // If lineItems omitted, server generates a single line: "Treatment session — DD/MM/YYYY"
}
```

**Behavior:**
- Generates `invoiceNumber` using existing pattern.
- Pre-condition: appointment must be `COMPLETED`. If not, 422.
- Allows multiple invoices per appointment (e.g., correction issuance) — UI labels them `INV-001`, `INV-002`.

### 5.5 `POST /api/invoices/[invoiceId]/regenerate`

"Regenerate" = void the existing invoice (`status = CANCELLED`) and create a new DRAFT with the same line items + `appointmentId`, returned in the response. The original is preserved (audit), the new one is the active invoice.

**Body:** none (or optional `lineItems` to override).

**Pre-condition:** original invoice must not be `PAID` (regenerating a paid invoice would corrupt revenue numbers). If `status=PAID`, return 422 `invoice_already_paid` with a hint to issue a fresh invoice instead.

---

## 6. UI Spec

### 6.1 Stat cards (5)

Stripe Dashboard style: white card, 1px `#e5edf5` border, `rounded-[6px]`, blue-tinted ambient shadow, 20px padding.

| Card | Headline | Sub-line | Tone |
|---|---|---|---|
| Completed | tabular-num count | "appointments" | neutral navy |
| Cancelled | count | "appointments" | muted |
| No-show | count | "appointments" | ruby `#ea2261` if > 0 |
| Stale | count | "needs review" + button if > 0 | amber lemon `#9b6829` |
| Revenue | `RM {paid}` | `RM {outstanding} outstanding` (slate `#64748d`); hidden if outstanding === 0 | success `#108c3d` |

Responsive: 5 cards stack 2-2-1 below 1024px, then single column below 640px.

### 6.2 Filter bar

- `Status` multi-select (Completed / Cancelled / No-show / Stale). Default: all.
- `Doctor` single-select (only doctors who appear in this patient's history).
- `Date range` preset dropdown (`Last 30 days` / `Last 3 months` / `Last 12 months` / `All time`) — default `Last 12 months` to keep initial query bounded.
- `× Clear` link appears only when any non-default filter is active.

Filters are URL-synced (`?status=COMPLETED,NO_SHOW&doctorId=X&range=last12m`) so back-button restores state.

### 6.3 Table

Reuse the column-grid + sortable-header + pager pattern from `UpcomingAppointmentsSection`. Same DESIGN.md tokens.

| Column | Width | Content |
|---|---|---|
| When | 160px | Time on top, date below (matches Upcoming) |
| Doctor | 140px | Linked to `/dashboard/doctors/:id` |
| Branch | 130px | Linked to `/dashboard/branches/:id` |
| Status | 110px | Dot + text. Stale = amber, Completed = slate, Cancelled/No-show = ruby |
| Visit | 80px | If linked: link "View" → `/dashboard/patients/:id/details?tab=history&sub=visits&visitId=X`. Else: ghost text "—" or button "Create" (OWNER/ADMIN, COMPLETED only) |
| Invoice | 110px | If 1 invoice: pill showing `RM 130 · Paid`. If 0: button "Issue" (OWNER/ADMIN, COMPLETED only). If >1: "RM 130 (2)" + popover listing all |
| Actions | 36px | Kebab menu — Edit notes/status, Regenerate invoice, View visit |

Default sort: `When desc` (most recent first — opposite of Upcoming).

Page size: 10 rows, same pager component.

### 6.4 Edit-status / edit-notes dialog

Single dialog opened from kebab menu. Two fields:
- **Status** — radio group: Scheduled · Completed · Cancelled · No-show · In progress (omits CHECKED_IN since that's a transient state). Pre-fills with current.
- **Notes** — textarea, ≤ 2000 chars, pre-fills with current.

`Save` → `PATCH /api/appointments/[id]` with only changed fields. Success: toast + table re-fetch.

### 6.5 Issue invoice dialog

- Amount input (default = doctor's `consultationFee` if set, else empty).
- Description input (default = `"Treatment — {visitType ?? 'session'} on {DD/MM/YYYY}"`).
- Due in N days input (default 14).
- Save → `POST /api/appointments/[id]/invoice`. Toast on success, table refreshes, the new invoice pill appears.

### 6.6 Empty states

- No past appointments at all → centered icon + "No past appointments yet. Once visits are completed, they'll appear here."
- Filters yield zero rows → "No appointments match the current filters." (matches Upcoming pattern).

### 6.7 Component breakdown

- `src/components/patients/PastAppointmentsTab.tsx` (new) — top-level container, owns fetch + URL state.
- `src/components/patients/PastAppointmentStatCards.tsx` (new) — 5 stat cards.
- `src/components/patients/PastAppointmentTable.tsx` (new) — table + sort + pager. Largely shares logic with `UpcomingAppointmentsSection` — extract common `<SortableHeader>`, `<StatusDot>`, `<TimeCell>` to `src/components/patients/_shared/` if duplication > 60 lines.
- `src/components/patients/EditPastAppointmentDialog.tsx` (new)
- `src/components/patients/IssueInvoiceDialog.tsx` (new)
- `src/components/patients/PatientHistoryTab.tsx` (new) — wraps the sub-tab switch and renders either `PatientVisitsTab` (existing) or `PastAppointmentsTab` (new).

### 6.8 Files to modify

- `src/components/patients/PatientDetailPage.tsx` — rename "Visits" tab → "History"; route to `PatientHistoryTab`. Update `TABS` const and the `activeTab === "visits"` branch.
- `src/types/patient.ts` — add `PastAppointment` and `PastAppointmentStats` interfaces.
- `prisma/schema.prisma` — three relation additions per §4.2.
- `src/app/api/appointments/[appointmentId]/route.ts` — add past-edit guard (block `dateTime`/`doctorId` change when row is past; DOCTOR → 403).

---

## 7. RBAC Matrix

| Action | OWNER (their branches) | ADMIN (their branches) | DOCTOR (their branches) |
|---|---|---|---|
| View past appointments tab | ✅ | ✅ | ✅ (read-only) |
| Edit status retroactively | ✅ | ✅ | ❌ 403 |
| Edit notes retroactively | ✅ | ✅ | ❌ 403 |
| Create Visit from past appt | ✅ | ✅ | ❌ 403 |
| Issue invoice | ✅ | ✅ | ❌ 403 |
| Regenerate invoice | ✅ | ✅ | ❌ 403 |
| Hard delete past appt | ✅ | ✅ | ❌ 403 (existing rule) |

For all roles: branches user is *not* a member of return 404 (not 403 — don't leak existence).

---

## 8. Edge Cases

1. **Stale `SCHEDULED` rows mid-day.** A 9 AM appointment with no status update by 5 PM appears "Stale" while still on calendar today. Acceptable — user prompt is correct. Stale pill is amber to differentiate from terminal red.
2. **Multiple invoices per appointment.** Allowed (refunds, corrections). Total revenue counts only `PAID` ones, so duplicates voided to `CANCELLED` don't double-count.
3. **Visit already linked when user clicks "Create Visit".** Idempotent — return existing Visit instead of creating; toast "Already linked — opening visit."
4. **Patient transferred between branches.** Past appointments stay tied to their original `branchId`. The Branch column shows where it happened. RBAC checks the user's membership at that branch.
5. **Appointment in the past with `IN_PROGRESS` status.** Treat as Completed-equivalent for stats (it's clearly stuck). Show as `In progress` in the status column with an amber tint, but counts under "Stale" (or surface a separate "Stuck" pill — open question).
   - **Decision:** count under Stale. Adding a sixth stat card is overkill. Stale label changes to "Stale or stuck" if any IN_PROGRESS exists.
6. **Regenerating a CANCELLED invoice.** Allowed — issuing a fresh invoice is the same flow. Confirmation copy: "Replace this draft invoice with a new one?"
7. **Pagination + filters + sort changes** — page resets to 1 (same pattern as Upcoming).
8. **Patient has no past appointments but has invoices** (edge: appointment was deleted). Revenue card still shows correctly because revenue query is patient-scoped, not appointment-scoped.

---

## 9. Test Plan (TDD)

Tests live under `src/__tests__/` and `src/app/api/.../__tests__/`. Run with `npm test`. **Write tests first, watch them fail, then implement.**

### 9.1 API integration tests (Neon test DB)

`src/app/api/patients/__tests__/past-appointments.test.ts`:
1. ✅ OWNER — fetches all past appointments at their branches, sorted by `When desc` by default.
2. ✅ DOCTOR — gets 200 read-only response (RBAC checked at write paths only).
3. ✅ Stats — `paid` excludes CANCELLED invoices, `outstanding` includes SENT + OVERDUE only.
4. ✅ Stale — SCHEDULED rows with `dateTime < now` are flagged `isStale: true` and counted under `stats.stale`.
5. ✅ Filter — `?status=NO_SHOW` returns only NO_SHOW rows.
6. ✅ Pagination — `?page=2&pageSize=10` returns rows 11–20 of full set.
7. ❌ Cross-branch leak — user at Branch A cannot see Patient X's appointments at Branch B → 404.

`src/app/api/appointments/__tests__/past-edit-guard.test.ts`:
1. ❌ DOCTOR PATCH past appointment → 403.
2. ❌ ADMIN PATCH `dateTime` on past appointment → 422 `cannot_reschedule_past`.
3. ✅ ADMIN PATCH `status` + `notes` on past appointment → 200.

`src/app/api/appointments/__tests__/create-visit-from-appointment.test.ts`:
1. ✅ COMPLETED appointment with no Visit → creates one, links via `appointmentId`.
2. ✅ Already linked → returns existing Visit (idempotent), no duplicate created.
3. ❌ NOT-COMPLETED appointment → 422 `appointment_not_completed`.
4. ❌ DOCTOR → 403.

`src/app/api/appointments/__tests__/issue-invoice.test.ts`:
1. ✅ Defaults — no `lineItems` body → server generates single line item.
2. ✅ Multiple invoices per appointment allowed.
3. ❌ NOT-COMPLETED → 422.

`src/app/api/invoices/__tests__/regenerate.test.ts`:
1. ✅ DRAFT invoice → marked CANCELLED, new DRAFT created with same line items + appointmentId.
2. ❌ PAID invoice → 422 `invoice_already_paid`.

### 9.2 Component tests

`src/__tests__/components/past-appointments-tab.test.tsx`:
1. Renders 5 stat cards with correct numbers from mock fetch.
2. Sub-tab switch: clicking "Visits" / "Appointments" updates URL `?sub=`.
3. Filter change resets pager to page 1.
4. DOCTOR role hides kebab menu actions (read-only).
5. Stale row shows amber pill.
6. Empty filtered → shows "No appointments match the current filters."

### 9.3 Manual E2E checklist

- [ ] Migration runs cleanly on dev DB.
- [ ] Existing `?tab=visits` deep-links land on History → Visits sub-tab.
- [ ] Stat cards add up correctly for the demo patient with mixed history.
- [ ] OWNER can flip a Stale → Completed and the card counts update.
- [ ] DOCTOR sees no kebab menu, no buttons, but still sees data.
- [ ] Issue invoice → invoice pill appears in row immediately.
- [ ] Regenerate paid invoice → blocked with toast "Invoice is already paid — issue a new one instead."

---

## 10. Out of Scope (v1)

- **Audit log** of who changed what, when. (Future spec if requested.)
- **Bulk actions** (multi-select past appointments). v1 is single-row.
- **Export** to CSV/PDF.
- **Email/WhatsApp notifications** when stale appointments accumulate.
- **Soft-undo** for status edits — tests rely on Prisma's `updatedAt` for verification only.
- **Multi-appointment refund flow** for a paid invoice — keep manual for now (cancel old + issue new).
- **Charts.** Stat cards only; no trend chart in v1.

---

## 11. Implementation Order (TDD-strict)

1. Write API tests for §5 endpoints — they all fail.
2. Write Prisma migration for §4.2 — `prisma migrate dev`.
3. Implement `GET /api/patients/[patientId]/past-appointments` — first test passes.
4. Implement past-edit guard in existing `PATCH /api/appointments/[id]` — those tests pass.
5. Implement `POST /api/appointments/[id]/visit`, `.../invoice`, `POST /api/invoices/[id]/regenerate` — remaining API tests pass.
6. Component tests for `PastAppointmentsTab` — fail.
7. Build `PatientHistoryTab` (sub-tab shell) + `PastAppointmentsTab` + stat cards + table — component tests pass.
8. Wire dialogs (`EditPastAppointmentDialog`, `IssueInvoiceDialog`).
9. Modify `PatientDetailPage.tsx` to use the new tab.
10. Run `npm run build` + `npm run lint` + `npm test` — all green.
11. Manual E2E checklist on a seeded patient at `personal-branch-001`.
12. Open PR `feat/past-appointments-tab`.

Estimated diff size: ~1100–1400 LOC across ~14 new + 3 modified files. Subagent-driven implementation in 3 waves: (a) migration + API + tests, (b) UI components + tests, (c) integration + manual E2E.

---

## 12. Open Questions for Reviewer

None blocking. Ship-ready once approved.

> One non-blocking design call: when a stale `SCHEDULED` row also has `IN_PROGRESS` siblings (multi-room clinic mid-shift edge case), do we want a separate "Stuck" pill or the unified "Stale or stuck"? Spec assumes unified for simplicity — flag if you'd prefer split.

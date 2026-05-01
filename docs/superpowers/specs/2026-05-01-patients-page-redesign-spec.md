# Patients Page Redesign — Spec

**Status:** Draft (2026-05-01)
**Page:** `/dashboard/patients`
**Files in scope:** `src/app/dashboard/patients/page.tsx`, `src/components/patients/*`, `src/app/api/patients/route.ts`, possibly new `src/app/api/patients/stats/route.ts` and new `src/app/api/appointments/upcoming/route.ts`

---

## 1. Goals (verbatim from user)

1. Patient table: add **"Upcoming Appointment"** column. Sort table by upcoming appointment, earliest first.
2. Patient table: **remove "X-Rays"** column.
3. **Above the patient table**, add a section listing patients with upcoming appointments for a **selected timeframe**. Sort by earliest first.
4. **Stat cards**: remove Total Patients / Inactive Patients / Discharged Patients. Add **per-branch patients statistic**.
5. Use my UI/UX experience to the maximum — full redesign welcome.

---

## 2. Page layout (after redesign)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Patients                                          [+ Add Patient]   │
│ Manage your clinic's patient records                                │
├─────────────────────────────────────────────────────────────────────┤
│ ┌── Per-Branch Patient Stats (Owners only, multi-branch) ──────────┐│
│ │ [Branch A: 124 active]  [Branch B: 87 active]  [Branch C: 42]   ││
│ │ See §3 for single-branch / doctor variants                       ││
│ └──────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│ Upcoming Appointments                  [Today | This Week | 30 Days]│
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ DATE & TIME │ PATIENT       │ DOCTOR    │ STATUS  │ ACTIONS    │ │
│ │ Tue 10:30am │ Ali Rahman    │ Dr. Lim   │ Sched   │ [...]      │ │
│ │ Tue 02:00pm │ Maria Tan     │ Dr. Wong  │ Conf    │ [...]      │ │
│ │ Wed 09:15am │ John Cheong   │ Dr. Lim   │ Sched   │ [...]      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│ All Patients                                                        │
│ [search.....] [doctor▼] [status▼]              [list/grid toggle]   │
│ N patients · sorted by next appointment ↑                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ PATIENT │ NEXT APT       │ CONTACT │ DOCTOR │ STATUS │ VISITS │…│ │
│ │ Ali R.  │ Tue 10:30am    │ +60…    │ Dr.Lim │ Active │ 12     │…│ │
│ │ Maria T │ Tue 02:00pm    │ +60…    │ Dr.Wo  │ Active │ 8      │…│ │
│ │ Sara L. │ — (no upcoming)│ +60…    │ Dr.Lim │ Active │ 4      │…│ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Stat cards — branch-aware behavior

The page currently scopes patients to the user's active branch. For per-branch stats, we need to know all branches the user has access to. Three role-based variants:

### 3a. OWNER / ADMIN with multiple branches → one card per branch

Each card shows:
- Branch name (header)
- **Active patients** (large number)
- Δ vs last 30 days (e.g., `+12 this month`) — small subtext
- **Upcoming this week**: `5 appointments`

```
┌─ Demo Branch ────┐  ┌─ Penang Clinic ──┐  ┌─ KL Central ─────┐
│ 124              │  │ 87               │  │ 42               │
│ active patients  │  │ active patients  │  │ active patients  │
│ +12 this month   │  │ +5 this month    │  │ +0 this month    │
│ 23 upcoming · 7d │  │ 14 upcoming · 7d │  │ 6 upcoming · 7d  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

If 1–4 branches: 4-column grid. If >4: horizontal scroll on mobile, wrap on desktop.

### 3b. OWNER / ADMIN with single branch → fall back to a useful 4-card set (no per-branch breakdown to make)

- **Active patients** (this branch)
- **New this month**
- **Upcoming this week** (count)
- **Avg visits / patient** (computed from current patients)

### 3c. DOCTOR → personal cards

Doctors are tied to their own patients only. Per-branch doesn't apply.

- **My Patients** (active count)
- **My Upcoming this week** (count)
- **Visits last 30d** (count)
- **No-show rate last 30d** (%) — if computable, otherwise drop and show 3 cards

---

## 4. Upcoming Appointments section (new, above patient table)

A scrollable card at the top with:

- **Header:** `Upcoming Appointments` + tab-style timeframe selector
- **Timeframe options:** `Today` · `This Week` · `Next 30 Days` (default = `This Week`)
- **Table columns** (in this order, sorted by `dateTime` ascending):
  - **When** — relative + absolute. e.g., `Today 10:30 AM` / `Tue, May 6 · 10:30 AM`
  - **Patient** — clickable name → `/dashboard/patients/{id}/details`
  - **Doctor** — only shown for OWNER/ADMIN (DOCTOR sees only own)
  - **Status** — pill: `Scheduled`, `Checked-in`, `Completed`, `Cancelled`, `No-show`
  - **Actions** — `[…]` menu: View patient, Cancel appointment (admin only)
- **Empty state:** `No appointments scheduled for this timeframe.` + small CTA "Schedule one →"
- **Max rows shown:** 10 (with "View all" link to `/dashboard/appointments` if that route exists; otherwise scroll inside card)

### Why this design

- Operational dashboards are most useful when "next thing to do" is at the top. Surfacing upcoming appointments aligns with the user's actual workflow: walk in → see who's coming next → click their record.
- Time-bucket tabs (Today / Week / 30d) match how clinic owners think about staffing.

---

## 5. Patient table changes

### Columns (in order, after redesign)

| # | Column | Notes |
|---|---|---|
| 1 | **Patient** | Name + IC number / email subtitle (unchanged from now) |
| 2 | **Next Appointment** *(NEW)* | Earliest SCHEDULED appointment in the future. Shows `Today 10:30am` / `Tue, May 6 · 10:30am` / `—` if none |
| 3 | **Contact** | Phone (+ email subtitle) |
| 4 | **Doctor** | Doctor name |
| 5 | **Status** | active / inactive / discharged pill |
| 6 | **Visits** | Total visits |
| 7 | **Actions** | `[…]` menu (unchanged) |

### Removed: `X-Rays` column

### Default sort

**By Next Appointment, ascending (earliest first).** Patients with no upcoming appointment go to the bottom (their cell shows `—`). Within the no-upcoming group, secondary sort is by `lastName, firstName`.

### Sortable headers (NEW affordance)

All column headers become click-to-sort with chevron indicator. Default: Next Appointment ↑. Other sortable: Patient name, Visits, Status.

---

## 6. Visual / UX upgrades

### 6a. Color-code doctors

Each doctor in the branch gets a stable color (hash → palette index). Their name gets a small dot + tinted text in tables. Helps owners scan multi-doctor schedules quickly. Palette: 8 desaturated hues that work on white.

### 6b. Time-aware highlighting

In both the upcoming-appointments table and the patient table's "Next Appointment" column:
- **Today** → bold, `#533afd` (primary accent)
- **Tomorrow** → medium weight, `#0570DE` (info blue)
- **This week** → normal weight
- **Beyond** → muted gray

### 6c. Sticky filter bar

When scrolling the long patient table, the filter row becomes sticky to the top of the viewport (`position: sticky; top: 64px`). Search and timeframe stay accessible.

### 6d. Empty states with personality

Replace plain "No patients found" with a small illustration + CTA: "No patients match these filters. [Clear filters]" — keeps the page feeling alive when filters are aggressive.

### 6e. Loading states

Replace the centered spinner with **skeleton rows** that match the final layout (3 stat cards, 5 upcoming-apt rows, 8 patient rows). This matches the "no content jumping" UX rule.

### 6f. Density toggle (subtle)

Above the patient table: small icon-only toggle for "Compact / Comfortable" row height. Persisted in `localStorage`. Defaults to Compact for ≥10 patients, Comfortable otherwise.

### 6g. Keyboard navigation

`/` focuses search · `J/K` moves selection in the patient table · `Enter` opens detail page · `?` shows shortcut help. Accessibility win + power-user delight.

### 6h. Sticky table header

The patient table header sticks to the top of its container while scrolling so column labels are always visible.

---

## 7. Data model & API changes

### 7a. New endpoint: `GET /api/appointments/upcoming?range=today|week|month`

Returns appointments for the user's active branch (or own appointments if DOCTOR), filtered by:
- `status: "SCHEDULED"` (and `CHECKED_IN` for the running-late case)
- `dateTime` between `now` and end-of-range

Response shape:
```ts
{
  appointments: Array<{
    id: string;
    dateTime: string; // ISO
    duration: number;
    status: "SCHEDULED" | "CHECKED_IN" | ...;
    patient: { id, firstName, lastName, phone, status };
    doctor: { id, name };
  }>;
  range: "today" | "week" | "month";
  total: number;
}
```

Sort: `dateTime ASC`. Limit: 100.

### 7b. Extend `/api/patients` to include `upcomingAppointment`

Add a new include + selection so each patient row carries:
```ts
upcomingAppointment: {
  id: string;
  dateTime: string; // ISO
  status: string;
} | null
```

Implemented as:
```ts
appointments: {
  where: { status: "SCHEDULED", dateTime: { gte: now } },
  orderBy: { dateTime: "asc" },
  take: 1,
  select: { id: true, dateTime: true, status: true },
}
```

The mapper extracts `appointments[0]` into `upcomingAppointment`.

### 7c. New endpoint: `GET /api/patients/branch-stats`

Returns aggregated stats per branch the user has access to (owner/admin only):
```ts
{
  branches: Array<{
    branchId: string;
    branchName: string;
    activePatients: number;
    newThisMonth: number;
    upcomingThisWeek: number;
  }>;
}
```

For DOCTOR or single-branch users, this endpoint returns just one entry (their branch). The UI uses §3a/3b/3c logic to decide what to render.

### 7d. Extend `Patient` TypeScript type

Add `upcomingAppointment: { id: string; dateTime: string; status: string } | null` to `src/types/patient.ts`.

---

## 8. Component file changes

| File | Change |
|---|---|
| `src/components/patients/PatientSummaryStats.tsx` | Replace with `BranchStatsCards.tsx` (or rewrite contents) — new role-aware logic |
| `src/components/patients/PatientTable.tsx` | Add `Next Appointment` column, remove `X-Rays`, add sortable header click handlers, adjust grid column widths |
| `src/components/patients/PatientListView.tsx` | Wire in new `UpcomingAppointmentsSection`, pass sort state to table, change default sort to upcoming-asc |
| `src/components/patients/UpcomingAppointmentsSection.tsx` | NEW — timeframe-tabbed table of upcoming appointments |
| `src/components/patients/DoctorColorBadge.tsx` | NEW — doctor-name pill with color-coded dot (deterministic hash → palette) |
| `src/components/patients/PatientTableSkeleton.tsx` | NEW — skeleton loader |
| `src/types/patient.ts` | Add `upcomingAppointment` field |
| `src/app/api/patients/route.ts` | Include upcoming appointment in patient query, map into response |
| `src/app/api/appointments/upcoming/route.ts` | NEW route |
| `src/app/api/patients/branch-stats/route.ts` | NEW route |
| `src/lib/format.ts` | Add `formatRelativeAppointmentTime()` helper if not already present |
| `src/lib/doctor-color.ts` | NEW — `getDoctorColor(doctorId): {bg,text,dot}` |

---

## 9. Visual design tokens (reusing existing system)

All from the existing Stripe-inspired design tokens already in the codebase. Key ones for new components:

- **Card bg:** `bg-white`
- **Card border:** `border-[#e5edf5]`
- **Card shadow:** `shadow-card` (existing) — `0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)`
- **Headings:** `text-[#061b31]`, weight 300, tracking `-0.22px`
- **Body:** `text-[#273951]`, 14–15px
- **Muted:** `text-[#64748d]`
- **Primary accent:** `#533afd` (use sparingly — primary CTA + Today highlight only)
- **Today blue:** `#533afd`
- **Tomorrow blue:** `#0570DE`
- **Status pills:** existing color map (active/inactive/discharged/scheduled/checked-in/completed/cancelled/no-show)
- **Border radius:** 4px on inputs/buttons, 6px on cards (consistent with existing UI)
- **Spacing:** 12px between cards, 16px section padding, 4–8px row padding

No new colors. Doctor colors use 8 desaturated existing palette options (mint, lavender, peach, sky, coral, sand, sage, rose).

---

## 10. Accessibility

- Table is real `<table>` markup (not divs) for screen-reader support
- Sortable headers use `<button>` with `aria-sort="ascending|descending|none"`
- Time pills use `<time datetime="...">` with full ISO in attribute
- Color-coded doctor names also have text — color is decorative, not load-bearing
- Keyboard shortcuts have a `?` help modal
- All status pills hit 4.5:1 contrast minimum
- Focus rings visible on all interactive elements

---

## 11. Performance

- Server component for `page.tsx` does the role/branch resolve (already does). Branch stats fetched on the server and streamed in.
- Client component `PatientListView` fetches patient list + upcoming appointments in parallel (`Promise.all`).
- Default initial render shows skeleton rows; stats and tables fade in independently.
- Sort/filter is client-side (already is). With < 1000 patients per branch, this is fine.
- Upcoming-appointments section uses Suspense boundary so it can render before patient list completes.

---

## 12. Out of scope (intentionally)

- Calendar/agenda full-page view (the existing dashboard has a schedule grid — out of scope here)
- In-place appointment rescheduling from this page
- Bulk actions on patients (bulk message, bulk archive)
- Patient export/import
- Sentry / monitoring instrumentation

---

## 13. Open questions (please confirm before implementation)

### Q1. Per-branch cards layout for owners with many branches

If you own >4 branches, do you want:
- **(a)** Horizontal scroll (Stripe-style "more →") — keeps everything on one row
- **(b)** Wrap to a second row of cards
- **(c)** Show top 4 by patient count, plus a "+N more" card linking to a full per-branch view

Recommended: **(b)** — most ergonomic on a clinic owner's wide laptop screen.

### Q2. Should a DOCTOR see the per-branch stat card section at all?

- **(a)** No — show personal stats per §3c
- **(b)** Yes — show one card for their current branch (count of their own patients in it)

Recommended: **(a)**.

### Q3. Default timeframe for the upcoming appointments section

- `Today` (most "now"-focused; risks empty state on slow days)
- `This Week` (recommended)
- `Next 30 Days`

Recommended: **`This Week`**.

### Q4. Cancel/reschedule actions in the upcoming appointments section

- **(a)** Just show the appointments (read-only). Cancel/reschedule via patient detail page.
- **(b)** Add inline `[…]` menu with Cancel + Reschedule options.

Recommended: **(a)** for v1 — keeps scope tight. Inline editing is a follow-up.

### Q5. Sortable patient table — which columns?

I'm proposing: Next Appointment, Patient (last name), Visits, Status. Anything else you want sortable (Doctor? Created date)?

Recommended: keep it focused — just the 4 above.

### Q6. Doctor color coding — opt-in or always on?

**Confirmed: always on for all roles** (including DOCTOR). Stable hash-based color per doctor across all rows.

---

## 13b. Decisions confirmed by user (2026-05-01)

- Q1: **Wrap to second row** (default)
- Q2: **DOCTOR sees personal stats, not per-branch** (default)
- Q3: **Default timeframe = This Week** (default)
- Q4: **View-only upcoming section, no inline cancel/reschedule** (default)
- Q5: **Sortable: Next Apt, Patient name, Visits, Status** (default)
- Q6: **Doctor color coding always on, all roles**

## 14. Rollout

Single PR. Order of implementation:

1. Type + API: extend Patient type, extend `/api/patients`, add `/api/appointments/upcoming`, add `/api/patients/branch-stats`.
2. Components: `BranchStatsCards`, `UpcomingAppointmentsSection`, doctor-color helper.
3. Wire into `PatientListView` (replace `PatientSummaryStats`, add upcoming section, change default sort, swap table column).
4. Update `PatientTable` columns + sortable headers.
5. Polish: skeleton loaders, sticky headers, keyboard nav, time-aware highlighting.
6. Manual smoke test in browser.
7. Run `npm run build` + `npm run test:e2e` to ensure no regressions.

Estimated implementation: ~4–6 hours for one engineer.

# Appointments Calendar — Google-Calendar-Style Scheduling

**Date:** 2026-05-05
**Branches (two-PR plan):**
- PR1: `feat/appointment-crud-api` (rebased + landed parked work)
- PR2: `feat/appointments-calendar-page` (the new page on top of PR1)

**Author:** Claude Code (TDD orchestrator) for `jobhunters.ai.pro@gmail.com`
**Status:** Draft — awaiting approval

---

## 0. Context

The sidebar links to `/dashboard/calendar` which currently 404s — there is no calendar page. A parked branch `feat/appointment-crud` (15 commits, last 2026-05-02) contains substantially complete appointment CRUD work that never merged. The Past Appointments tab on patient detail shipped 2026-05-04 already exercises some of the same APIs but only for already-occurred appointments.

This spec creates a Google-Calendar-style scheduling page at `/dashboard/appointments` with:
- Day / Week / Month views
- Drag-and-drop rescheduling + doctor reassignment
- Doctor-as-resource side-by-side columns when multiple doctors are selected in Day view
- Branch + Doctor filter bar (multi-select)
- Conflict prevention via the `findConflictingAppointments` helper (already on the parked branch)
- Click-through into the patient detail page from each appointment card
- shadcn/ui throughout

To keep PRs reviewable, ship in two stages:
- **PR1** rebases and lands the parked CRUD APIs + dialogs + comboboxes (foundation).
- **PR2** builds the calendar page + drag-and-drop + filters on top.

---

## 1. Goals (in scope)

### PR1 — Appointment CRUD foundation
- Rebase `feat/appointment-crud` onto current main, resolve conflicts with the now-shipped Past Appointments + Branches CRUD work.
- Ship: `findConflictingAppointments` helper, `POST /api/appointments`, `GET /api/appointments/check-conflict`, `GET /api/appointments/[id]`, plus the existing PATCH/DELETE.
- Ship: `CreateAppointmentDialog`, `EditAppointmentDialog`, `CancelAppointmentDialog`, `DeleteAppointmentDialog`, `PatientCombobox`, `DoctorCombobox`, `AppointmentActionsMenu`.
- Wire dialogs into `UpcomingAppointmentsSection` on patient detail (already done on the parked branch — verify still correct).
- E2E test: `e2e/appointment-crud.spec.ts` covers Create / Edit / Cancel / Delete / conflict.
- All shadcn/ui components used (Dialog, AlertDialog, Combobox, Select, Button, Input, Textarea).

### PR2 — Calendar page
- New route `/dashboard/appointments` (server component shell + client calendar).
- Three views — **Day / Week / Month** — selectable via shadcn Tabs.
- Library: **`react-big-calendar`** with `withDragAndDrop` HOC. Custom Stripe-styled CSS overrides (see §6.2).
- **Filter bar** at top: Branch (Select), Doctor (multi-select Combobox). Filter persists in URL query params (`?branch=…&doctors=…&view=week&date=2026-05-05`) for shareable links.
- **Resource view (Q3.c)**: when 2+ doctors selected in Day view, render side-by-side doctor columns; otherwise single timeline coloured by doctor.
- **Drag-and-drop (Q5)**:
  - Move within same column → PATCH `dateTime`
  - Drag to another doctor's column → PATCH `doctorId` (reassign)
  - Drop on past time → blocked (uses existing past-edit guard, surfaces inline toast)
  - Drop creates conflict → confirmation dialog "{Patient} already has an appointment at {time} with {doctor}. Override and double-book?" — OWNER/ADMIN can override, DOCTOR gets hard-block.
  - Resize via bottom edge to change `duration`.
- **Click an event card** → opens shadcn Popover with: Patient name (links to `/dashboard/patients/[id]/details`), Doctor (links to `/dashboard/doctors/[id]`), Branch, status pill, time block, Edit / Cancel / Delete actions (RBAC-gated).
- **Click an empty time slot** → opens `CreateAppointmentDialog` pre-filled with that time + the column's doctor (if resource view).
- **Today / prev / next** arrows in header. **Date jumper** (shadcn DatePicker) for fast navigation.
- **Sidebar rename**: `/dashboard/calendar` → `/dashboard/appointments`, label "Calendar" → "Appointments". Add a redirect from old path to new for stale bookmarks.
- TDD-strict: failing API tests → make green, then failing component tests → make green.

## 2. Non-Goals (v1)

- **Recurring appointments** — every-Tuesday repeats, exceptions, series management. (Q6: skip)
- **Google Calendar import / export / two-way sync.** (Q6: skip)
- **Email invites / .ics file downloads.** (Q6: skip)
- **Print view.** (Q6: skip)
- **Patient self-booking page** (public-facing booking form). (Q6: skip)
- **Resource view for branches** (cross-branch overlay) — single branch at a time. (Q3 was per-doctor.)
- **Inline-edit of fields directly on the card** — popover only opens dialogs.
- **Server-side rendering of the calendar grid** — full client-side, server only delivers the appointment payload.
- **Live updates** (websockets / polling) — page re-fetches on date/filter change only.
- **Audit log** for appointments (Branch CRUD got one; Appointment doesn't get one in v1 — flag if you want this).

## 3. Locked Decisions (from Q&A 2026-05-05)

| # | Decision |
|---|----------|
| Q1 | (b) Two-PR plan: PR1 rebase parked CRUD work, PR2 calendar UI |
| Q2 | (a) `react-big-calendar` + `withDragAndDrop`, Stripe-themed CSS |
| Q3 | (c) Filter bar (Branch + multi-Doctor) AND resource columns when 2+ doctors selected in Day view |
| Q4 | (b) DOCTOR can only manage their own appointments (`appointment.doctorId === user.id`). OWNER + ADMIN can manage all in branches they own/admin. |
| Q5 | All drag-and-drop semantics allowed: time-shift, doctor-reassign, past-time blocked, conflict → confirm-modal for OWNER/ADMIN / hard-block for DOCTOR. Resize for duration. |
| Q6 | Skip all out-of-scope items (recurring, GCal sync, .ics, print, patient self-booking) |
| Q7 | (a) Rename sidebar to "Appointments" at `/dashboard/appointments` + redirect from `/dashboard/calendar` |
| Q8 | Click event card → opens Popover; "View patient" link in popover navigates to patient detail page |

---

## 4. Schema

**No migration needed.** `Appointment` table already has `dateTime`, `duration`, `status`, `doctorId`, `branchId`, `patientId`, `notes`, plus indexes on `branchId`, `doctorId`, `dateTime`, `status` ([prisma/schema.prisma:524](prisma/schema.prisma#L524)).

If audit log for appointments is desired later, that's a separate spec (mirror `BranchAuditLog` pattern).

---

## 5. PR1 — Appointment CRUD foundation

### 5.1 Rebase strategy

The parked branch is **15 commits behind 68 commits of main work**. Two options:
- **(A) `git rebase main` on the parked branch** — replay 15 commits onto current main; resolve conflicts as we go. Risk: conflicts in `UpcomingAppointmentsSection`, `PatientDetailPage`, `appointments/[id]/route.ts` (past-edit guard already shipped).
- **(B) Cherry-pick file-by-file** — start fresh branch, cherry-pick selectively. Safer but slower.

**Recommendation: (A) rebase.** If conflicts get gnarly, fall back to (B).

### 5.2 Files added (cherry-picked from parked branch)

| File | Status |
|------|--------|
| `src/lib/appointments.ts` (`findConflictingAppointments` helper) | NEW |
| `src/app/api/appointments/route.ts` (POST list/create) | NEW |
| `src/app/api/appointments/__tests__/route.test.ts` | NEW |
| `src/app/api/appointments/check-conflict/route.ts` | NEW |
| `src/app/api/appointments/check-conflict/__tests__/route.test.ts` | NEW |
| `src/app/api/appointments/[appointmentId]/route.ts` (GET single + extend existing PATCH/DELETE) | MODIFIED |
| `src/components/patients/CreateAppointmentDialog.tsx` | NEW (uses shadcn Dialog) |
| `src/components/patients/EditAppointmentDialog.tsx` | NEW (uses shadcn Dialog) |
| `src/components/patients/CancelAppointmentDialog.tsx` | NEW (uses shadcn AlertDialog) |
| `src/components/patients/DeleteAppointmentDialog.tsx` | NEW (uses shadcn AlertDialog + typed-confirm) |
| `src/components/patients/PatientCombobox.tsx` | NEW (uses shadcn Command + Popover) |
| `src/components/patients/DoctorCombobox.tsx` | NEW (uses shadcn Command + Popover) |
| `src/components/patients/AppointmentActionsMenu.tsx` | NEW (uses shadcn DropdownMenu) |
| `src/components/patients/UpcomingAppointmentsSection.tsx` | MODIFIED (add actions kebab) |
| `src/components/patients/PatientDetailPage.tsx` | MODIFIED (mount dialogs) |
| `e2e/appointment-crud.spec.ts` | NEW |

### 5.3 RBAC for PR1 (server)

| Action | OWNER | ADMIN | DOCTOR (own) | DOCTOR (others') |
|--------|:-----:|:-----:|:------------:|:----------------:|
| `POST /api/appointments` | ✅ | ✅ | ✅ (only with `doctorId === self.id`) | ❌ 403 |
| `GET /api/appointments` (list) | ✅ branch-scoped | ✅ | ✅ branch-scoped | n/a |
| `GET /api/appointments/[id]` | ✅ | ✅ | ✅ if doctorId===self OR caller is owner/admin of branch | ❌ 404 |
| `GET /api/appointments/check-conflict` | ✅ | ✅ | ✅ | n/a |
| `PATCH /api/appointments/[id]` | ✅ | ✅ | ✅ if `doctorId===self` | ❌ 403 |
| `DELETE /api/appointments/[id]` | ✅ | ✅ | ✅ if `doctorId===self` | ❌ 403 |

Cross-branch leak: 404 (matches existing pattern).

### 5.4 Client-side conflict UX

Each Create/Edit dialog calls `GET /check-conflict?doctorId=…&dateTime=…&duration=…&excludeId=…` on every relevant field change (debounced 300ms). If conflict found, inline yellow banner shows below the date/time picker with the conflicting appointment summary + a checkbox "Allow double-booking" (OWNER/ADMIN only). DOCTOR users see no override checkbox.

---

## 6. PR2 — Calendar page

### 6.1 Dependencies

```bash
npm install react-big-calendar date-fns
npm install --save-dev @types/react-big-calendar
```

`date-fns` is the localizer (no Moment.js — too big). `withDragAndDrop` is bundled with `react-big-calendar`.

### 6.2 Page architecture

```
/dashboard/appointments  (server component shell)
└─ AppointmentsCalendarView (client)
   ├─ AppointmentsHeader
   │  ├─ ViewSwitcher (shadcn Tabs: Day / Week / Month)
   │  ├─ DateNavigator (Today / ‹ / › / shadcn DatePicker for jump)
   │  ├─ FilterBar
   │  │  ├─ BranchSelect (shadcn Select)        [OWNER/ADMIN only — DOCTOR sees their branches as read-only label]
   │  │  └─ DoctorMultiSelect (shadcn Command + Popover with checkboxes)
   │  └─ NewAppointmentButton (opens CreateAppointmentDialog)
   ├─ AppointmentsCalendar  (react-big-calendar wrapped with DnD)
   │  └─ Custom event component → AppointmentEventCard
   ├─ AppointmentEventPopover (shadcn Popover, opened on event click)
   │  ├─ Patient (link to /dashboard/patients/[id]/details)
   │  ├─ Doctor (link to /dashboard/doctors/[id])
   │  ├─ Branch label
   │  ├─ Time block + duration
   │  ├─ Status pill (matches Past Appointments colour scheme)
   │  └─ Actions: Edit / Cancel / Delete (RBAC-gated)
   └─ ConflictOverrideDialog (shadcn AlertDialog) — fired by DnD on conflict
```

### 6.3 Resource view (Day mode + 2+ doctors)

react-big-calendar's `Day` view supports `resources` natively. We pass:
```ts
const resources = selectedDoctors.map(d => ({ resourceId: d.id, resourceTitle: d.name }))
```
When `resources.length >= 2`, the Day view automatically renders side-by-side columns (one per doctor). Each appointment is rendered in the column matching its `resourceId`. Single-doctor Day view falls back to a regular timeline coloured by doctor.

Week and Month views always render single timeline (no resource columns) — appointments coloured by doctor.

### 6.4 Stripe-themed CSS

Override react-big-calendar's default styles via a single SCSS / CSS file `src/components/calendar/calendar.css` imported at the page level. Key overrides:

- Border colours → `#e5edf5` (matches design system)
- Time-grid hour labels → `#64748d`, `text-[13px]`, `font-mono`
- Today highlight → `#F0EEFF` (purple tint)
- Selected slot → `#ededfc`
- Event cards: `rounded-[4px]`, `1px solid` doctor colour, doctor-tinted background (10% opacity), `text-[12px]` patient name + time
- Drag preview → solid white card with 2px purple ring
- "More" badge in Month view → shadcn Badge component
- Header weekdays → `text-[#0a2540]`, `font-medium`, uppercase

### 6.5 Drag-and-drop behaviour

```ts
// react-big-calendar exposes onEventDrop({ event, start, end, resourceId })
async function handleEventDrop({ event, start, end, resourceId }) {
  const newDoctorId = resourceId ?? event.doctorId;
  const newStart = start;
  const newDuration = differenceInMinutes(end, start);

  // 1. Past-time guard
  if (newStart < new Date()) {
    toast.error("Can't move appointments to the past");
    revertEventOptimisticUpdate();
    return;
  }

  // 2. RBAC for doctor reassign
  if (newDoctorId !== event.doctorId && callerRole === "DOCTOR") {
    toast.error("Only owners and admins can reassign appointments to another doctor");
    revertEventOptimisticUpdate();
    return;
  }

  // 3. Conflict check
  const conflict = await fetch(`/api/appointments/check-conflict?doctorId=${newDoctorId}&dateTime=${newStart.toISOString()}&duration=${newDuration}&excludeId=${event.id}`);
  if (conflict.found) {
    if (callerRole === "DOCTOR") {
      toast.error(`${conflict.patient} already booked with this doctor at ${conflict.time}`);
      revertEventOptimisticUpdate();
      return;
    }
    // OWNER/ADMIN: ask
    const ok = await openOverrideConfirmDialog(conflict);
    if (!ok) {
      revertEventOptimisticUpdate();
      return;
    }
  }

  // 4. PATCH
  const res = await fetch(`/api/appointments/${event.id}`, {
    method: "PATCH",
    body: JSON.stringify({ dateTime: newStart, duration: newDuration, doctorId: newDoctorId, allowDoubleBook: true }),
  });
  if (!res.ok) { revertEventOptimisticUpdate(); /* show error */ }
}
```

Resize (bottom-edge drag) uses the same handler but only changes `end` → `duration`.

### 6.6 New API endpoint

`GET /api/appointments?branchId=…&doctorIds=…&start=…&end=…` — returns all appointments matching the filter window for the calendar. Branch-scoped to caller's memberships. Excludes `CANCELLED` + `NO_SHOW` by default unless `?includeCancelled=true` passed (popover detail can reveal them).

```
Response:
{
  appointments: [
    { id, dateTime, duration, status, notes,
      patient: { id, firstName, lastName, phone },
      doctor: { id, name, image, color },  // color is computed deterministically from doctor.id
      branch: { id, name }
    }, ...
  ]
}
```

Cap response at 500 events per query — if user picks too wide a window, return 422 with a hint to narrow filters.

### 6.7 RBAC for the calendar page

| Action | OWNER | ADMIN | DOCTOR |
|--------|:-----:|:-----:|:------:|
| View `/dashboard/appointments` | ✅ all branches owned/admin | ✅ all branches admin | ✅ branches they belong to |
| Branch filter dropdown | ✅ shows all owned/admin branches | ✅ shows all admin branches | hidden — pinned to user's only/active branch |
| Doctor filter dropdown | ✅ shows all doctors in selected branch | ✅ shows all doctors in selected branch | shows only doctors in shared branch (incl self) |
| Create event by clicking empty slot | ✅ any doctor | ✅ any doctor | ✅ self only — slot pre-fills doctorId=self |
| Drag own event (time only) | ✅ | ✅ | ✅ |
| Drag own event (doctor reassign) | ✅ | ✅ | ❌ blocked + toast |
| Drag others' event | ✅ | ✅ | ❌ blocked + toast |
| Override conflict | ✅ confirmation dialog | ✅ | ❌ hard-block |
| Edit / Cancel / Delete via popover | ✅ all | ✅ all | ✅ own only — others' show greyed-out actions with tooltip |

### 6.8 Sidebar rename + redirect

- `src/components/dashboard/Sidebar.tsx:37` — change `{ label: "Calendar", href: "/dashboard/calendar", icon: Calendar }` → `{ label: "Appointments", href: "/dashboard/appointments", icon: Calendar }`.
- Add redirect at `src/middleware.ts` (or a `next.config.js` redirects entry) from `/dashboard/calendar` → `/dashboard/appointments` so old browser bookmarks still work.

---

## 7. shadcn/ui Components Used

| Component | Where |
|-----------|-------|
| `Dialog` | Create / Edit appointment dialogs |
| `AlertDialog` | Cancel / Delete confirmations, conflict-override |
| `Popover` | Event card click popover, doctor multi-select |
| `Command` | Patient + Doctor typeahead in dialogs |
| `Select` | Branch picker, status picker |
| `Tabs` | Day/Week/Month view switcher |
| `Button` | All actions |
| `Input` | Text fields, time inputs |
| `Textarea` | Notes |
| `Calendar` (date picker) | Date jumper in header |
| `DropdownMenu` | AppointmentActionsMenu (kebab) |
| `Avatar` | Doctor mini-avatar in event cards |
| `Badge` | Status pills, "+N more" in month view |
| `Tooltip` | RBAC hover hints on disabled actions |
| `Toaster` (sonner) | Drag/drop feedback, save errors |

If any of these aren't installed yet, `npx shadcn@latest add <name>` adds them.

---

## 8. Type definitions (new)

**`src/types/appointment.ts`** (new):
```ts
export type AppointmentStatus = "SCHEDULED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface CalendarAppointment {
  id: string;
  dateTime: string;        // ISO
  duration: number;        // minutes
  status: AppointmentStatus;
  notes: string | null;
  patient: { id: string; firstName: string; lastName: string; phone: string | null };
  doctor:  { id: string; name: string | null; image: string | null; color: string };
  branch:  { id: string; name: string };
}

export interface ConflictCheckResult {
  conflict: boolean;
  appointment: { id: string; patientName: string; time: string; doctor: string } | null;
}
```

---

## 9. File Inventory

### PR1 (16 files cherry-picked + 0 modified existing-shipped)
See §5.2 table.

### PR2 — New (12 files)
- `src/app/dashboard/appointments/page.tsx` — server shell
- `src/components/calendar/AppointmentsCalendarView.tsx` — client root
- `src/components/calendar/AppointmentsHeader.tsx`
- `src/components/calendar/AppointmentsCalendar.tsx` (react-big-calendar wrapper + DnD)
- `src/components/calendar/AppointmentEventCard.tsx`
- `src/components/calendar/AppointmentEventPopover.tsx`
- `src/components/calendar/ConflictOverrideDialog.tsx`
- `src/components/calendar/calendar.css`
- `src/components/calendar/doctor-color.ts` (deterministic hash → 1-of-12 palette colours)
- `src/types/appointment.ts`
- `src/app/api/appointments/route.ts` — extend with `GET` (filtered list for calendar)
- `src/app/api/appointments/__tests__/list.test.ts` — list + filter + RBAC

### PR2 — Modified (2 files)
- `src/components/dashboard/Sidebar.tsx` — relabel + reroute
- `src/middleware.ts` — redirect `/dashboard/calendar` → `/dashboard/appointments`

Estimated PR2 diff: ~1500–2000 LOC across 14 files. PR1 diff is roughly the parked branch's 15-commit cumulative diff modulo conflicts (~600–800 LOC).

---

## 10. Implementation Order (TDD-strict)

### PR1
1. Create `feat/appointment-crud-api` branch from main.
2. Cherry-pick or rebase the 15 commits from parked branch (in order: helper → API tests → API routes → dialogs → wiring).
3. Resolve conflicts (most likely in `appointments/[id]/route.ts` past-edit guard, `UpcomingAppointmentsSection`, `PatientDetailPage`).
4. Run `npm run build`, `npm run lint`, `npm test`. All green.
5. Manual E2E: create appointment from patient detail, edit time, conflict-check rejects double-book, cancel, delete typed-confirm.
6. Open PR1.

### PR2
After PR1 lands on main:
1. Create `feat/appointments-calendar-page` branch.
2. `npm install react-big-calendar @types/react-big-calendar date-fns`.
3. Add `Tabs`, `Popover`, `Command`, `DatePicker`, `Tooltip`, `Sonner` shadcn primitives if missing.
4. Write failing API tests for `GET /api/appointments?…` (RBAC + filter + cap).
5. Implement `GET /api/appointments` → tests green.
6. Write failing component tests for `doctor-color.ts` (deterministic hashing).
7. Implement `doctor-color.ts` → tests green.
8. Build `AppointmentsCalendarView` skeleton (no DnD yet) — verify Day/Week/Month switch, filter bar, fetch on filter change.
9. Add custom event card + popover with click-through to patient detail.
10. Wire `withDragAndDrop` HOC. Implement drag handlers per §6.5 in stages: (a) time-shift only, (b) doctor-reassign, (c) conflict override, (d) resize.
11. Implement `ConflictOverrideDialog`.
12. Add resource view for 2+ doctors in Day view.
13. Sidebar rename + middleware redirect.
14. Stripe-themed CSS pass; UI-reviewer agent for visual polish.
15. `npm run build` + `npm run lint` + `npm test` all green.
16. Manual E2E checklist (§11).
17. Open PR2.

---

## 11. Manual E2E Checklist

Run on `http://localhost:3000` signed in as `jobhunters.ai.pro@gmail.com` (3 personal branches × ~10 patients × seeded appointments).

- [ ] Sidebar shows "Appointments" instead of "Calendar"; clicking goes to `/dashboard/appointments`
- [ ] Old URL `/dashboard/calendar` redirects to new path
- [ ] Day / Week / Month tabs switch views; "Today" snaps to current date
- [ ] Branch select dropdown shows all 3 branches; switching changes events
- [ ] Doctor multi-select dropdown shows doctors in selected branch
- [ ] Selecting 2 doctors in Day view → side-by-side columns appear
- [ ] Selecting 1 doctor in Day view → single timeline (no columns)
- [ ] Click empty slot → CreateAppointmentDialog opens with time + doctor pre-filled
- [ ] Click event → popover opens with patient/doctor links + actions
- [ ] Click patient name in popover → navigates to `/dashboard/patients/[id]/details`
- [ ] Drag event to different time → PATCH succeeds, card moves
- [ ] Drag event to past time → blocked, toast appears, card snaps back
- [ ] Drag event onto another doctor's column → reassigns + PATCH
- [ ] (DOCTOR account) Drag own event → works; drag others' event → blocked
- [ ] Resize event bottom edge → duration updates
- [ ] Drag onto a slot with conflict → ConflictOverrideDialog opens; "Override" succeeds, "Cancel" snaps back
- [ ] (DOCTOR account) Drag onto conflict → hard-block toast, no dialog
- [ ] Edit appointment from popover → EditAppointmentDialog opens, conflict check works on time change
- [ ] Cancel appointment → status flips to CANCELLED, card greys out (or hides per `?includeCancelled` toggle)
- [ ] Delete appointment → typed-confirm AlertDialog → row gone
- [ ] URL state persists: copy URL with `?branch=…&doctors=…&view=week&date=…`, paste in new tab → same view loads
- [ ] Sign out → page redirects to `/login`

---

## 12. Risks

- **react-big-calendar bundle size** — adds ~80KB gzipped to the route. Acceptable for a dashboard route; flag if Lighthouse complains.
- **Drag-and-drop touch support** — react-big-calendar's DnD is mouse-first. Tablet support is OK but not perfect. Acceptable since clinic workstations are desktop-first per project spec.
- **Doctor color palette collisions** — 12-colour palette deterministically hashed from doctor.id. With >12 doctors per branch, two doctors can collide. v2: extend palette, or assign explicit colours per doctor.
- **Conflict-check race condition** — between client-side check and server-side PATCH, another user could book the same slot. Mitigation: server-side conflict check is authoritative; PATCH returns 409 with conflict details. Client surfaces a toast and re-fetches.
- **`react-big-calendar`'s Month view doesn't render hourly slots** — events show as bars with patient name; clicking opens popover. Acceptable.
- **Time zone**: all times stored in UTC, rendered in user's local time via `date-fns-tz`. Mixed-timezone clinics are rare; defer multi-timezone polish.

## 13. Open Questions (non-blocking, flag during PR review)

- **Q13.1** Audit log for appointment changes — branches got one. Want appointments too? Adds another model + ~200 LOC. Default: skip in v1.
- **Q13.2** "Show cancelled appointments?" toggle on the calendar header — UX defaults to hide. Some clinics might want to see no-shows for re-engagement. Add toggle?
- **Q13.3** Doctor working-hours overlay (greyed-out off-hours blocks) — would be very nice but requires reading `DoctorProfile.workingSchedule` JSON. Defer to v2.
- **Q13.4** Booking buffer (15-min buffer between appointments) — define in branch settings? Defer to v2.
- **Q13.5** Cap of 500 events per query — pick a number (current default). Adjust if real seed data shows different.

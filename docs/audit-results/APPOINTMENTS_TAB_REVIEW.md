# Appointments Tab Feature — Post-Ship Audit

**Branch audited:** `feat/appointment-tabs-redesign` (commits ef46b98, 456530e)
**Date:** 2026-05-25
**Scope:** `src/app/dashboard/appointments/`, `src/components/appointments/`, `src/app/api/appointments/`, `src/lib/appointment-*.ts`, `src/lib/availability.ts`, `src/lib/treatment-colors.ts`, `src/types/appointment.ts`, availability/time-off/break-times routes, `DoctorDayCalendar`, `AppointmentsCalendarView`

---

## Summary

| Severity | Count |
|---|---|
| 🚨 Critical | 2 |
| ❌ Bug | 4 |
| ⚠️ Quality | 8 |
| 💡 Suggestion | 3 |

---

## 🚨 Critical

### 1. `check-conflict` endpoint has no branch-membership RBAC check

- **File:** `src/app/api/appointments/check-conflict/route.ts`
- **Line(s):** 13–49
- **Issue:** The GET handler authenticates the user (`getCurrentUser()`) but never verifies that the caller is a member of the branch the target doctor belongs to. Any authenticated user can probe any doctor's schedule by querying `?doctorId=<any-cuid>` and get back the patient names attached to conflicting appointments (via `patient: { firstName, lastName }` in the response).
- **Fix:** After resolving the doctor's branch memberships, verify that the caller shares at least one branch with the doctor. Alternatively, require a `branchId` param and run `getUserBranchRole(user.id, branchId)` before calling `findConflictingAppointments`.

---

### 2. `forceBookOnBreak: true` can be sent by a DOCTOR to bypass the confirmation gate — server does not re-enforce role

- **File:** `src/app/api/appointments/route.ts`
- **Line(s):** 240–255
- **Issue:** The spec says only OWNER/ADMIN can override the break-time conflict. The server checks `if (!forceBookOnBreak)` before querying break rows, but any role that can POST an appointment (including DOCTOR) can include `forceBookOnBreak: true` in the request body to skip the gate entirely. The frontend shows the dialog only to admins, but there is no server-side role assertion before the bypass.
- **Fix:** Add `if (forceBookOnBreak && role === "DOCTOR") return 403` before the `if (!forceBookOnBreak)` block.

---

## ❌ Bug

### 3. `AppointmentsPageShell` URL sync runs on every render, causing a full navigation loop with `router.replace`

- **File:** `src/components/appointments/AppointmentsPageShell.tsx`
- **Line(s):** 100–111
- **Issue:** The `useEffect` that calls `router.replace(...)` lists `router` in its dependency array. In Next.js 13+/App Router, `useRouter()` returns a stable reference, so this is not an infinite loop today — but `router` is included unnecessarily, and more importantly the effect fires on every change to `selectedDate` even when the date didn't actually change (e.g. the post-create bump `setSelectedDate(new Date(selectedDate.getTime()))` at line 211 fires a new Date instance with the same value, triggering a URL push and then a re-render cascade).
- **Fix:** Remove `router` from the dep array (add an ESLint disable comment if needed). For the "force re-fetch" pattern, use a dedicated `refreshKey` counter instead of bumping the date.

---

### 4. `GET /api/appointments/[appointmentId]` (single-appointment GET) returns `403` on cross-branch access instead of `404`

- **File:** `src/app/api/appointments/[appointmentId]/route.ts`
- **Line(s):** 31
- **Issue:** The spec and all other routes in this feature explicitly state cross-branch access must return `404` (not `403`) to prevent branch-ID enumeration. This GET handler returns `{ error: "forbidden" }` with status 403.
- **Fix:** Change `status: 403` to `status: 404` and set the error key to `"not_found"` to match the pattern of every other route.

---

### 5. `AppointmentDetailPanel` fires two independent `fetch` calls for the same patient on every `appointment.id` change — N+1 pattern

- **File:** `src/components/appointments/AppointmentDetailPanel.tsx`
- **Line(s):** 95–123
- **Issue:** The panel fetches `/api/patients/${patientId}` and `/api/patients/${patientId}?include=detail` in two separate fire-and-forget calls (no `Promise.all`). Each appointment-panel open triggers two sequential or concurrent round-trips to load data that is largely redundant. The `?include=detail` response already contains all the fields fetched by the plain GET.
- **Fix:** Replace both calls with a single `fetch(/api/patients/${patientId}?include=detail)` inside a `Promise` and extract both `patientDetail` and `linkedVisit` from that one response.

---

### 6. `AppointmentsListView` fetches a 3-month window with `includeCancelled=true` always — the 500-event cap will 422 for active branches

- **File:** `src/components/appointments/AppointmentsListView.tsx`
- **Line(s):** 50–58 (`getWindow`), 124 (`baseParams`)
- **Issue:** `getWindow` builds a [selectedDate-1month, selectedDate+2months] range (roughly 90 days). For a busy clinic (e.g. 5 doctors × 30 appts/day × 90 days = 13,500 events), the count check in `GET /api/appointments` will return `422 window_too_wide` every time the list view loads. The `includeCancelled=true` flag makes this worse because it includes all historical cancelled appointments.
- **Fix:** Narrow the default window (e.g. -7 days to +30 days) or split the `includeCancelled` fetch to a separate range. The counts endpoint is already a separate request; don't over-fetch for the list.

---

## ⚠️ Quality

### 7. `DoctorAvailabilityTab.canEdit` is hardcoded to `true` — acknowledged known follow-up

- **File:** `src/components/dashboard/doctors/DoctorAvailabilityTab.tsx`
- **Line(s):** 66–71
- **Issue:** `canEdit` is `useMemo(() => { void doctor; void currentUserId; return true; }, [...])`. The UI shows edit buttons to all roles; the API enforces RBAC, so mutations are still blocked, but the UX is misleading — a VIEWER can click "Add time off" and get an error modal they shouldn't see.
- **Acknowledged follow-up:** Listed in `context/current-feature.md`. Fix: thread the caller's branch role from the page and gate `canEdit = role === "OWNER" || role === "ADMIN" || callerId === doctorId`.

---

### 8. `sendDoctorBookingNotification` missing unit test (Resend mock)

- **File:** `src/lib/email.ts` — `sendDoctorBookingNotification`
- **Line(s):** 154–165 (early return when `RESEND_API_KEY` unset)
- **Issue:** The booking notification is fired with `void` (fire-and-forget) in POST `/api/appointments/route.ts:307`. There is no test coverage for the happy path, the `doctor === booker` skip, or the transport-error-swallowed case.
- **Acknowledged follow-up:** Listed in `context/current-feature.md`. Fix: add a `__tests__/email.test.ts` with Resend mocked via `vi.mock('resend')`.

---

### 9. `AppointmentsCalendarView` uses `as never` and `as React.ComponentType<any>` to silence TS on `DnDCalendar`

- **File:** `src/components/calendar/AppointmentsCalendarView.tsx`
- **Line(s):** 55–56
- **Issue:** `const DnDCalendar = withDragAndDrop(BigCalendar as never) as React.ComponentType<any>`. The `any` cast bypasses all type-checking on drag-drop event shape. A mis-typed prop will silently produce a runtime bug rather than a compile error.
- **Fix:** Type the HOC result explicitly using the `withDragAndDrop` generic: `const DnDCalendar = withDragAndDrop<CalendarEvent, Resource>(BigCalendar)`. If the library types are incomplete, use `// @ts-expect-error — react-big-calendar DnD types incomplete` with a comment rather than a blanket `any`.

---

### 10. `AppointmentsPageShell` mounts a `CreateAppointmentDialog` AND `AppointmentsListView` mounts its own — two dialogs co-exist

- **File:** `src/components/appointments/AppointmentsPageShell.tsx` line 201, `AppointmentsListView.tsx` line 313
- **Issue:** Both the Shell and the ListView render `<CreateAppointmentDialog>`. When in list mode, two dialog roots are in the DOM simultaneously. The Shell's dialog is opened by the "New Appointment" button in the top bar; the ListView's dialog is opened by the "empty state" button inside the list. Both call `fetchAll()` on creation, but the Shell's `onCreated` bumps `selectedDate` to force a re-fetch while the ListView's calls `fetchAll()` directly — inconsistent refresh paths.
- **Fix:** Hoist dialog state to the Shell and pass `onOpenCreate` callbacks down, or remove the ListView's own dialog and forward its empty-state button to the Shell's `setCreateOpen(true)`.

---

### 11. `ReminderStatusBadge` fetches on every render with no error handling

- **File:** `src/components/appointments/ReminderStatusBadge.tsx`
- **Line(s):** 23–36
- **Issue:** The `useEffect` has no `.catch()` on the fetch chain — if the network or API returns an error, the component silently stays in its initial state (`summary: "none"`, renders nothing) with no indication of failure. Also, the effect has no cancel-on-unmount guard, so a stale response can set state after the component unmounts.
- **Fix:** Add a `cancelled` guard (same pattern as `AppointmentAuditLog`) and add `.catch(() => { /* no-op or set error state */ })`.

---

### 12. `GET /api/appointments/counts` does 4 separate DB round-trips where 2 could be merged

- **File:** `src/app/api/appointments/counts/route.ts`
- **Line(s):** 53–104
- **Issue:** The handler issues `groupBy`, `todayCount`, `upcomingCount`, and then a 4th `stale` count query — four sequential/parallel DB hits. The `stale` count (SCHEDULED + dateTime < now) could be derived from the `grouped` result by adding a date clause to the `groupBy`, or computed from a raw count merged into the existing `Promise.all`.
- **Fix:** Add `stale` to the `Promise.all` group or use a `$queryRaw` to get all counts in one query.

---

### 13. Inline `type ApptStatus` duplicates `AppointmentStatus` from `src/types/appointment.ts`

- **File:** `src/app/api/appointments/route.ts`
- **Line(s):** 66–72
- **Issue:** A local `type ApptStatus` is defined inline inside the `GET` handler body. `AppointmentStatus` is already exported from `src/types/appointment.ts` with the identical members.
- **Fix:** Import `AppointmentStatus` from `@/types/appointment` and remove the local type alias.

---

### 14. `DoctorDayCalendar` file is 488 lines with `AppointmentBlock` embedded — should be extracted

- **File:** `src/components/calendar/DoctorDayCalendar.tsx`
- **Line(s):** 389–487 (`AppointmentBlock`), 364–387 (`DoctorAvatar`)
- **Issue:** The file contains the main calendar grid, plus two fully self-contained sub-components (`DoctorAvatar`, `AppointmentBlock`) that have distinct props and rendering logic. At 488 lines the file exceeds the project's 200-line soft limit and is harder to diff.
- **Fix:** Extract `AppointmentBlock` and `DoctorAvatar` to `AppointmentBlock.tsx` and `DoctorAvatar.tsx` inside `src/components/calendar/`.

---

## 💡 Suggestion

### 15. Spec compliance: audit log endpoint returns `403` (not `404`) for non-members — inconsistent with spec

- **File:** `src/app/api/appointments/[appointmentId]/reminders/route.ts`
- **Line(s):** 19
- **Issue:** Cross-branch access returns `{ error: "forbidden" }` with status `403`, while the spec §RBAC says cross-branch should return `404` (not `403`) to prevent enumeration. All other routes in this feature use 404. The audit-log route (`audit-log/route.ts:22`) is correct; the reminders route is not.
- **Fix:** Change `{ status: 403 }` → `{ status: 404 }` on line 19 of the reminders route and rename the error key to `"not_found"`.

---

### 16. `appointmentMatchesTab` "today" filter matches the `selectedDate`, not actual today — stat cards and tabs can diverge

- **File:** `src/lib/appointment-tabs.ts`
- **Line(s):** 38–40
- **Issue:** When the user selects a past date in the sidebar mini-calendar, the "Today" tab renders appointments for that past date (because `tab === "today"` uses `isSameLocalDay(dt, selectedDate)`). The tab label still says "Today" but shows a historical day's appointments. Meanwhile, the counts endpoint always computes `today` from `Date.now()`, so the tab badge count and the filtered card list disagree.
- **Fix:** Either rename the tab dynamically to the selected date, or make "Today" always use `Date.now()` and add a separate "Selected day" tab/label.

---

### 17. `AppointmentsCalendarView` `handleEventResize = handleEventDrop` loses resize-specific duration logic

- **File:** `src/components/calendar/AppointmentsCalendarView.tsx`
- **Line(s):** 414
- **Issue:** `const handleEventResize = handleEventDrop` — both handlers are identical. The `handleEventDrop` handler already computes `newDuration = differenceInMinutes(newEnd, newStart)`, which correctly handles both drop and resize. This is fine functionally, but the alias obscures intent and makes it harder to add resize-specific behavior later (e.g., a min-duration guard).
- **Fix:** Rename to `handleEventMutation` and use it for both `onEventDrop` and `onEventResize`, or extract the shared logic into a helper and call it from two named handlers.

---

## Spec Compliance Checklist

| Item | Status |
|---|---|
| Sidebar relabel "Calendar" → "Appointments" + 308 redirect | Not directly verified in files read; assumed shipped per commit history |
| Default page mode = Calendar, default calendar view = Day | Confirmed: `AppointmentsPageShell` defaults to `"calendar"`, `AppointmentsCalendarView` defaults to `Views.DAY` |
| Shows ALL branch doctors as columns when no filter (Day view) | Confirmed: line 491–494 of `AppointmentsCalendarView` passes `branch?.doctors ?? []` when `doctorIds.length === 0` |
| `DoctorAvailabilityTab.canEdit` hardcoded `true` | Confirmed present as known follow-up |
| Resend mock test missing | Confirmed missing |
| 500-event cap enforced | Confirmed enforced in `GET /api/appointments` lines 98–111 |
| `cannot_reschedule_past` guard on PATCH dateTime/doctorId | Confirmed at `[appointmentId]/route.ts` lines 121–126 |
| DOCTOR cannot delete — must cancel | Confirmed at `[appointmentId]/route.ts` lines 259–263 |
| Cross-branch leak returns 404 (not 403) | Partial: most routes correct; GET single-appointment (finding #4) and reminders (finding #15) still return 403 |

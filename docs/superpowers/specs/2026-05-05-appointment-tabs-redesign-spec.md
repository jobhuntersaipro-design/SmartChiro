# Appointment Tabs Redesign Spec

**Inspired by:** Bagus Fikri / Fikri Studio — Zendenta (dental clinic SaaS) & Schedulo (booking app)  
**Branch:** `claude/appointment-tabs-redesign-YRF8p`  
**Status:** Draft — ready for implementation

---

## 1. Background & Motivation

The current `/dashboard/appointments` page is a Google-Calendar-style grid built on `react-big-calendar`. It is great for *scheduling* but poor for *managing* — there is no way to quickly skim all appointments by status, no appointment list with rich patient context, and no slide-in detail panel. Busy clinic days require fast scanning and one-click actions, not clicking into grid cells.

Bagus Fikri's Zendenta (a dental-clinic SaaS, functionally identical to SmartChiro) shows the gold standard:

- **Tabbed list view** — status tabs (All / Today / Upcoming / Completed / Cancelled / No-show) let staff instantly filter the appointment queue
- **Rich appointment cards** — patient avatar + name + time + doctor + treatment type visible at a glance
- **Mini calendar sidebar** — date-picker drives the list without full calendar noise
- **Slide-in detail panel** — click a card → right panel opens with full details + quick actions (no modal context-switch)
- **Summary stat pills** — counts per status tab update in real time
- **View toggle** — switch between the new List View and the existing Calendar View seamlessly

The Calendar View is NOT removed — it stays as the power-user scheduling grid. The redesign adds a **List View** as the default landing experience, with a persistent view toggle.

---

## 2. Goals

1. Add a **List View** mode to `/dashboard/appointments` as the default tab
2. Implement **status tabs** with live counts: All | Today | Upcoming | Completed | Cancelled | No-show
3. Build **rich appointment cards** inspired by Zendenta's clean card design
4. Add a **mini calendar sidebar** for fast date filtering
5. Replace the floating popover with a **slide-in detail panel** (right side)
6. Add **summary stat cards** above the list (Today's count, Upcoming, Completion rate, Revenue)
7. Keep the existing **Calendar View** (react-big-calendar) accessible via a view toggle
8. All RBAC, conflict detection, and reminder logic stays unchanged

---

## 3. Layout Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  TOP BAR: "Appointments"  [+ New Appointment]  [List | Calendar] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐  ┌────────────────────────────────────┐ │
│  │  SIDEBAR (280px)    │  │  MAIN PANEL                       │ │
│  │                     │  │                                    │ │
│  │  Branch selector    │  │  STAT CARDS (4 across)            │ │
│  │  Doctor filter      │  │  ──────────────────────────────── │ │
│  │                     │  │  TABS: All · Today · Upcoming ·   │ │
│  │  ─────────────────  │  │        Completed · Cancelled      │ │
│  │  Mini Calendar      │  │  ──────────────────────────────── │ │
│  │  (month picker)     │  │  APPOINTMENT CARDS (scrollable)   │ │
│  │                     │  │  [Card] [Card] [Card] ...         │ │
│  │  ─────────────────  │  │                                   │ │
│  │  Quick Filters      │  │                                   │ │
│  │  □ Show cancelled   │  │                                   │ │
│  │  □ Show no-show     │  │                                   │ │
│  └─────────────────────┘  └────────────────────────────────────┘ │
│                                                                  │
│  DETAIL PANEL (slides in from right, 420px, overlays main):      │
│  Patient header, appointment info, notes, quick actions          │
└──────────────────────────────────────────────────────────────────┘
```

When the **Calendar View** is active, the existing `AppointmentsCalendarView` replaces the main panel. The sidebar and top bar remain consistent across both views.

---

## 4. New Components

### 4.1 `AppointmentsPageShell`
New top-level client component replacing `AppointmentsCalendarView` as the page root.

**Props:**
```typescript
interface AppointmentsPageShellProps {
  currentUserId: string;
  branches: BranchOption[];
}
```

**Responsibilities:**
- Holds `viewMode: "list" | "calendar"` state (default: `"list"`, persisted to localStorage)
- Holds `selectedDate: Date`, `selectedBranchId`, `selectedDoctorIds[]` state (synced to URL params)
- Renders `AppointmentsListView` or existing `AppointmentsCalendarView` based on `viewMode`
- Renders the shared top bar with `+ New Appointment` button and view toggle
- Mounts `CreateAppointmentDialog` once at this level

### 4.2 `AppointmentsListView`
The new list-mode layout.

**Props:**
```typescript
interface AppointmentsListViewProps {
  currentUserId: string;
  branches: BranchOption[];
  selectedBranchId: string | null;
  selectedDoctorIds: string[];
  selectedDate: Date;
  onBranchChange: (id: string) => void;
  onDoctorChange: (ids: string[]) => void;
  onDateChange: (date: Date) => void;
  onNewAppointment: () => void;
}
```

**Responsibilities:**
- Fetches appointments from `GET /api/appointments` with current filters
- Manages `activeTab: "all" | "today" | "upcoming" | "completed" | "cancelled" | "noshow"` state
- Renders `AppointmentSidebarFilters` + `AppointmentStatCards` + `AppointmentTabs` + `AppointmentCardList`
- Manages `selectedAppointmentId` for the detail panel
- Renders `AppointmentDetailPanel` when an appointment is selected

### 4.3 `AppointmentSidebarFilters`
Left sidebar with branch/doctor selectors and mini calendar.

**Design:**
- `280px` wide, white bg, `border-r border-[#E3E8EE]`
- Branch dropdown (shadcn Select, hidden if user has only one branch)
- Doctor multi-select (existing `DoctorCombobox` component, reused)
- **Mini Calendar** — shadcn `Calendar` component in single-date mode, week starts Monday
  - Selected date highlighted with `#635BFF` filled circle
  - Days with appointments get a small `#635BFF` dot indicator below the date number
  - Clicking a date sets `selectedDate` and switches tab to "all" for that date
- Quick toggles: "Show Cancelled" checkbox, "Show No-show" checkbox (default: off)
- "Clear filters" link when non-default filters are active

### 4.4 `AppointmentStatCards`
Four stat cards spanning the top of the main panel.

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Today           │ │  This Week       │ │  Completion Rate │ │  Revenue (MYR)  │
│  12 appointments │ │  47 appointments │ │  87%             │ │  RM 3,240       │
│  3 remaining     │ │  8 doctors       │ │  ↑ from 81%     │ │  RM 560 pending │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Data source:** Derived from the already-fetched appointments array (no extra API call).  
**Design:** White bg, `border border-[#E3E8EE]`, `rounded-[6px]`, `shadow-card`. Icon + label + primary number + secondary context.

### 4.5 `AppointmentTabs`
Horizontal tab strip with live counts.

```
All (47) | Today (12) | Upcoming (23) | Completed (8) | Cancelled (3) | No-show (1)
```

**Design:**
- Full-width strip, `border-b border-[#E3E8EE]`, `bg-white`
- Active tab: `border-b-2 border-[#635BFF]`, text `#635BFF`, weight 600
- Inactive tab: text `#425466`, no underline, hover `#0A2540`
- Count badge: small `rounded-full` pill, `bg-[#F0EEFF]`, text `#635BFF` — active tab only; others show plain `(n)`
- Smooth `transition-colors` on tab switch

**Tab definitions:**
| Tab | Filter logic |
|---|---|
| All | All statuses (respects show-cancelled/show-noshow toggles) |
| Today | `dateTime` date equals `selectedDate` (or today if no date selected) |
| Upcoming | `dateTime > now`, status = SCHEDULED or CHECKED_IN or IN_PROGRESS |
| Completed | status = COMPLETED |
| Cancelled | status = CANCELLED |
| No-show | status = NO_SHOW |

### 4.6 `AppointmentCardList`
Scrollable list of appointment cards, grouped by date when `activeTab === "all"` or `"upcoming"`.

**Date group headers:**
```
── Today, Tuesday 6 May 2026 ────────────────────
  [Card]
  [Card]
── Tomorrow, Wednesday 7 May 2026 ───────────────
  [Card]
```
- Group header: `text-[13px]` `font-medium` `text-[#697386]`, thin `#E3E8EE` rule

**Empty state:**
- Centered icon + "No appointments" message + context-sensitive CTA
- E.g., Today tab empty: "No appointments scheduled for today" + "+ New Appointment" button

### 4.7 `AppointmentCard`
The core card component. Inspired by Zendenta's clean card style.

```
┌─────────────────────────────────────────────────────────────────┐
│ [Avatar]  Ahmad Razali              [● SCHEDULED]   [⋮ Actions] │
│           Cervical Adjustment                                    │
│           🕐 10:30 AM · 45 min    👨‍⚕ Dr. Sarah Wong             │
│           📍 KLCC Branch                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Design specs:**
- `bg-white`, `border border-[#E3E8EE]`, `rounded-[8px]` (slightly more rounded than base for a "card" feel)
- `shadow-sm` (Stripe-style blue-tinted shadow)
- `p-4`, `mb-2`
- Hover: `shadow-md`, `border-[#C1C9D2]`, `cursor-pointer`, `transition-all duration-150`
- Selected state: `border-[#635BFF]`, `bg-[#F0EEFF]`, left `4px solid #635BFF` accent bar
- **Left accent bar**: `4px` wide colored strip flush-left, color = status color (green for completed, indigo for scheduled, etc.)

**Patient avatar:**
- `40px` circle, `rounded-full`
- If patient has a photo: show it
- Else: initials in `bg-[#F0EEFF]` + `text-[#635BFF]`, `font-semibold`

**Status badge:** `rounded-full` pill, same color tokens as existing codebase:
- SCHEDULED: `bg-[#EEF2FF]` + `text-[#635BFF]` + animated `●` dot
- CHECKED_IN: `bg-[#ECFDF5]` + `text-[#15BE53]`
- IN_PROGRESS: `bg-[#FFF7ED]` + `text-[#F5A623]` + animated pulse
- COMPLETED: `bg-[#ECFDF5]` + `text-[#30B130]`
- CANCELLED: `bg-[#FEF2F2]` + `text-[#DF1B41]`
- NO_SHOW: `bg-[#F9FAFB]` + `text-[#697386]`

**Notes indicator:** If appointment has notes, show a small `📝` icon after patient name (tooltip: "Has notes")

**Actions kebab (⋮):** On hover only — shows Edit, Cancel, Delete (RBAC-gated), same as existing `AppointmentActionsMenu`

**Click behavior:** Selects the appointment → opens `AppointmentDetailPanel`

### 4.8 `AppointmentDetailPanel`
Slides in from the right, 420px wide, overlays the main content (does not push/shrink it).

```
┌──────────────────────────────────────┐
│  ✕  Appointment Details              │
├──────────────────────────────────────┤
│  [Patient Avatar — 64px]             │
│  Ahmad Razali          [SCHEDULED ●] │
│  IC: 901205-14-5521                  │
│  📞 +60 12-345 6789  (opens WA)     │
│  ✉  ahmad@email.com  (opens mailto) │
│  → View Patient Profile              │
├──────────────────────────────────────┤
│  APPOINTMENT INFO                    │
│  Date & Time   Tue, 6 May · 10:30 AM│
│  Duration      45 minutes            │
│  Doctor        Dr. Sarah Wong   [→]  │
│  Branch        KLCC Branch      [→]  │
│  Treatment     Cervical Adjustment   │
├──────────────────────────────────────┤
│  NOTES                               │
│  "Patient reports neck stiffness..." │
├──────────────────────────────────────┤
│  REMINDERS                           │
│  [ReminderStatusBadge]               │
├──────────────────────────────────────┤
│  ACTIONS                             │
│  [Edit]  [Mark Complete]  [Cancel]   │
│  [View / Create Visit]               │
└──────────────────────────────────────┘
```

**Animation:** `translate-x-full` → `translate-x-0`, `transition-transform duration-200 ease-out`. Overlay backdrop `bg-black/20`.

**Close:** ✕ button top-right, or click backdrop, or Escape key.

**"Mark Complete" button:** PATCH status to COMPLETED. Only shown when status is SCHEDULED/CHECKED_IN/IN_PROGRESS and user has OWNER/ADMIN role.

**"View / Create Visit" button:** Links to existing visit flow — if appointment has a linked visit, shows "View Visit"; otherwise "Create Visit" (calls existing `POST /api/appointments/[id]/visit`).

**Reuses:** `ReminderStatusBadge`, `ExternalLink` wrapper, existing action dialogs mounted in parent.

---

## 5. View Toggle

Top-right of the appointments page header:

```
[≡ List]  [▦ Calendar]
```

- Segmented control, `rounded-[4px]`, `border border-[#E3E8EE]`
- Active: `bg-[#635BFF]` + white text
- Inactive: white bg + `#425466` text
- State persisted to `localStorage` key `appointments_view_mode`
- Calendar view renders the existing `AppointmentsCalendarView` (no changes to that component)

---

## 6. API Changes

### 6.1 Extend `GET /api/appointments`

Add `tab` query param to allow server-side tab filtering (reduces client-side compute for large datasets):

```
GET /api/appointments?branchId=&doctorIds=&start=&end=&tab=today|upcoming|completed|cancelled|noshow&includeCancelled=true
```

`tab` values map to:
- `today` — `dateTime >= startOfDay(now)` AND `dateTime < endOfDay(now)`
- `upcoming` — `dateTime > now` AND status IN (SCHEDULED, CHECKED_IN, IN_PROGRESS)
- `completed` — status = COMPLETED
- `cancelled` — status = CANCELLED
- `noshow` — status = NO_SHOW

When `tab` is absent, existing behavior applies (all non-cancelled by default).

### 6.2 `GET /api/appointments/counts`
New lightweight endpoint returning per-status counts for the selected filters (powers tab badges without fetching all appointments):

```typescript
// GET /api/appointments/counts?branchId=&doctorIds=&start=&end=
// Response:
{
  all: number,
  today: number,
  upcoming: number,
  completed: number,
  cancelled: number,
  noshow: number,
  stale: number
}
```

Uses `prisma.appointment.groupBy({ by: ['status'], _count: true })` filtered by branch/doctor/date range.

### 6.3 Mini Calendar Dot Indicators
`GET /api/appointments/calendar-markers?branchId=&start=&end=`

Returns an array of dates that have appointments (for rendering the dot indicators below dates):

```typescript
// Response:
{ dates: string[] }  // ISO date strings "2026-05-06"
```

---

## 7. URL State

Keep URL params for shareability and browser back/forward:

| Param | Values | Default |
|---|---|---|
| `view` | `list`, `calendar` | `list` |
| `branch` | branch ID | first branch |
| `doctors` | comma-separated user IDs | (all) |
| `date` | ISO date string | today |
| `tab` | `all`, `today`, `upcoming`, `completed`, `cancelled`, `noshow` | `today` |
| `appointment` | appointment ID | (none) — opens detail panel |

Deep-linking `?appointment=xxx` opens the detail panel directly on load.

---

## 8. Design Tokens (additions)

No new CSS variables needed — all card styles use existing design tokens.

One new utility class needed in `globals.css`:
```css
/* Left accent bar on appointment cards */
.appointment-card-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 8px 0 0 8px;
}
```

---

## 9. Files to Create

| File | Description |
|---|---|
| `src/components/appointments/AppointmentsPageShell.tsx` | Root shell, view mode toggle |
| `src/components/appointments/AppointmentsListView.tsx` | List view layout orchestrator |
| `src/components/appointments/AppointmentSidebarFilters.tsx` | Left sidebar: branch, doctor, mini calendar |
| `src/components/appointments/AppointmentStatCards.tsx` | 4 stat cards above the list |
| `src/components/appointments/AppointmentTabs.tsx` | Status tab strip with counts |
| `src/components/appointments/AppointmentCardList.tsx` | Scrollable grouped list |
| `src/components/appointments/AppointmentCard.tsx` | Individual appointment card |
| `src/components/appointments/AppointmentDetailPanel.tsx` | Slide-in right panel |
| `src/app/api/appointments/counts/route.ts` | New counts endpoint |
| `src/app/api/appointments/calendar-markers/route.ts` | Mini calendar dot markers |

---

## 10. Files to Modify

| File | Change |
|---|---|
| `src/app/dashboard/appointments/page.tsx` | Render `AppointmentsPageShell` instead of `AppointmentsCalendarView` |
| `src/app/api/appointments/route.ts` | Add `tab` query param filtering |
| `src/components/calendar/AppointmentsCalendarView.tsx` | Extract shared state (branch, doctors, date) to shell; accept them as props |

---

## 11. Files NOT Changed

- `AppointmentEventCard.tsx` — calendar view cards untouched
- `AppointmentEventPopover.tsx` — calendar view popover untouched
- `ConflictOverrideDialog.tsx` — unchanged
- `CreateAppointmentDialog.tsx` — reused as-is from shell
- `EditAppointmentDialog.tsx` — reused as-is, mounted in shell
- `CancelAppointmentDialog.tsx` — reused as-is
- `DeleteAppointmentDialog.tsx` — reused as-is
- All reminder, invoice, and visit dialog components — untouched

---

## 12. Interaction Flows

### 12.1 Landing on the page
1. Page loads with `view=list&tab=today&date=<today>`
2. Sidebar shows current branch, all doctors selected, mini calendar on today
3. Today's appointments load as cards, grouped by time if multiple dates shown
4. Stat cards show today's count, this week, completion rate, revenue
5. Tab badges show counts for all statuses

### 12.2 Clicking an appointment card
1. Card gets selected state (indigo border + bg tint + accent bar)
2. Detail panel slides in from right (200ms ease-out)
3. Patient info, appointment details, notes, reminder status, actions all visible
4. URL updates: `?appointment=xxx`
5. Clicking another card: panel updates to new appointment without closing

### 12.3 Switching tabs
1. Click "Upcoming" tab
2. Tab animates: old tab loses underline, new tab gains it (150ms transition)
3. Appointment list re-filters in place (client-side from already-fetched data if same date range, or re-fetches if moving between "today" and "upcoming" which may need different date windows)
4. Counts remain visible on all tabs at all times

### 12.4 Using the mini calendar
1. Click a date in the mini calendar
2. Selected date highlight updates
3. List view switches to "All" tab filtered to that specific date
4. Dots on dates with appointments remain visible for context

### 12.5 Switching to Calendar View
1. Click "Calendar" toggle button
2. `viewMode` → `"calendar"`, persisted to localStorage
3. Calendar view fades in (existing `AppointmentsCalendarView`)
4. Sidebar hides (calendar has its own filter bar)
5. URL: `?view=calendar`

### 12.6 Creating an appointment
1. Click "+ New Appointment" (top bar)
2. Existing `CreateAppointmentDialog` opens
3. On success: list re-fetches, new card appears, detail panel opens for new appointment

### 12.7 Mark as Complete (from detail panel)
1. Click "Mark Complete" in panel
2. Optimistic UI: card status badge updates immediately
3. PATCH request sent: `{ status: "COMPLETED" }`
4. On success: counts re-fetch, card may disappear from "Upcoming" tab (moves to "Completed")
5. On error: revert optimistic update + toast

---

## 13. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `≥ 1280px` | Full 3-panel: sidebar + list + detail panel side by side |
| `1024px–1279px` | Sidebar collapses to icon rail (filters in popover); detail panel overlays |
| `768px–1023px` | Sidebar hidden (filters in drawer); detail panel is full-screen modal |
| `< 768px` | List view only (no calendar view); cards are full-width; detail panel is bottom sheet |

---

## 14. Accessibility

- All cards are `role="button"` or `<button>` with proper `aria-selected` when active
- Detail panel: `role="dialog"`, `aria-labelledby`, focus trap on open
- Tab strip: `role="tablist"` + `role="tab"` + `aria-selected`
- Escape key closes detail panel
- Tab count badges: `aria-label="12 appointments"` not just "12"
- Keyboard navigation: `←/→` arrow keys cycle through tabs; `Enter`/`Space` on card opens detail

---

## 15. Animations & Micro-interactions

| Interaction | Animation |
|---|---|
| Detail panel open | `transform: translateX(100%) → translateX(0)`, `200ms ease-out` |
| Detail panel close | `transform: translateX(0) → translateX(100%)`, `150ms ease-in` |
| Tab switch | `border-b` color transition `150ms` |
| Card hover | `box-shadow` + `border-color` transition `150ms` |
| Card selected | `background-color` + `border-color` `100ms` |
| Status badge pulse | Existing `animate-subtle-blink` for SCHEDULED/IN_PROGRESS |
| Stat card count | `tabular-nums` font, no animation needed (data is server-fetched) |
| Empty state | Fade-in `opacity-0 → opacity-100` `300ms` with slight `translateY(8px → 0)` |

---

## 16. Testing Plan

### Unit tests (Vitest)
- `AppointmentCard`: renders all status variants, shows/hides kebab on hover, shows notes indicator
- `AppointmentTabs`: active tab styling, count badges, keyboard navigation
- `AppointmentStatCards`: correct count derivation from appointment array
- Tab filter logic: each tab's filter function with edge cases (midnight boundaries, timezone)

### Integration tests (API)
- `GET /api/appointments/counts`: returns correct counts per status; respects branch/doctor filters; RBAC (cross-branch → 404)
- `GET /api/appointments/calendar-markers`: returns correct date array; respects date range
- `GET /api/appointments?tab=today`: returns only today's appointments
- `GET /api/appointments?tab=upcoming`: excludes past appointments

### Manual E2E checklist
- [ ] List view loads as default (Calendar view was previous default)
- [ ] Tab counts match actual appointment counts
- [ ] Clicking a card opens detail panel with correct patient data
- [ ] Detail panel closes on Escape and backdrop click
- [ ] "Mark Complete" updates card status optimistically
- [ ] Mini calendar dot indicators appear on dates with appointments
- [ ] Switching to calendar view and back preserves filter state
- [ ] Deep-link `?appointment=xxx` opens detail panel on load
- [ ] "+ New Appointment" dialog works from list view
- [ ] DOCTOR role cannot see Delete button in detail panel
- [ ] Responsive: sidebar hides at 1024px, detail panel becomes full-screen at 768px

---

## 17. Out of Scope (this PR)

- AI-suggested appointment times (Schedulo feature — Phase 3)
- In-app messaging thread per appointment (Schedulo feature — Phase 3)
- WhatsApp notification from detail panel (WhatsApp worker not yet connected)
- Drag-to-reschedule within list view (calendar view already has this)
- Time-based heatmap dashboard widget (separate dashboard feature)
- Patient-facing appointment booking portal (Phase 4)

# Dashboard Redesign Spec

## Status: Not Started

## Overview

Complete redesign of `/dashboard` to serve as the **role-aware command center** for SmartChiro. The current dashboard has generic Stripe-clone stat cards (Payments, Net volume, MRR, Failed payments, New customers) that don't match the chiropractic domain. This redesign replaces all existing dashboard components with clinically relevant, role-scoped views.

**Delete these components entirely:**
- `src/components/dashboard/OverviewSection.tsx`
- `src/components/dashboard/TodaysSchedule.tsx`
- `src/components/dashboard/RecentActivity.tsx`

**Keep unchanged:**
- `src/components/dashboard/DashboardShell.tsx` (layout wrapper)
- `src/components/dashboard/Sidebar.tsx` (navigation)
- `src/components/dashboard/TopBar.tsx` (header)
- `src/app/dashboard/layout.tsx`

---

## Roles & Access Model

| Role | Scope | Can See | Can Manage |
|------|-------|---------|------------|
| **OWNER** | All branches | All branches, all doctors, all patients, all stats | Create/edit/delete branches, assign doctors to branches, view cross-branch analytics |
| **ADMIN** | All branches | All branches, all doctors, all patients | Assign doctors to branches, manage patients (cannot create/delete branches) |
| **DOCTOR** | Assigned branch only | Own branch patients, own schedule, own stats | Own patients, own X-rays, own annotations |

The session already provides `branchRole` and `activeBranchId` via the auth types.

---

## Owner/Admin Dashboard

### Layout

```
+-------------------------------------------------------+
|  Greeting Bar (Good morning, Dr. X)   [Branch Picker]  |
+-------------------------------------------------------+
|  [Stat Card]  [Stat Card]  [Stat Card]  [Stat Card]   |
+-------------------------------------------------------+
|  Branch Management (table)              | Quick Actions |
|  - branch name, doctors, patients       | - Add Branch  |
|  - status, last activity                | - Add Doctor  |
|                                         | - Add Patient |
+-------------------------------------------------------+
|  Today's Schedule (all branches)  | Recent Activity    |
|  - grouped by branch              | - system-wide feed |
+-------------------------------------------------------+
```

### A) Greeting Bar

- Left: "Good morning, **{name}**" with time-aware greeting (morning/afternoon/evening)
- Right: Branch picker dropdown — **"All Branches"** (default for Owner) or specific branch
  - Owner sees: "All Branches" + list of all branches
  - Admin sees: "All Branches" + list of all branches
  - Selecting a branch filters the entire dashboard to that branch's data

### B) Stat Cards (4-column grid)

| Card | Icon | Value | Subtitle | Color |
|------|------|-------|----------|-------|
| Total Patients | Users | count | "across {n} branches" or "in {branch}" | `#635BFF` primary |
| Today's Appointments | Calendar | count | "{n} completed, {m} remaining" | `#0570DE` info |
| X-Rays This Week | Image | count | "+{n} from last week" or "-{n}" | `#30B130` success |
| Active Doctors | Stethoscope | count | "across {n} branches" | `#697386` muted |

- Cards are white bg, 1px `#E3E8EE` border, `rounded-[6px]`, Stripe card shadow
- Icon in a tinted circle (e.g., `#F0EEFF` bg for primary icon)
- Value is `text-[23px] font-semibold text-[#0A2540]`
- Subtitle is `text-[14px] text-[#697386]`
- Trend indicator: green up arrow / red down arrow with `text-[14px]` percentage

### C) Branch Management Table (Owner only, hidden for Admin)

Full-width card below stat cards. This is the **key owner feature**.

**Table columns:**

| Column | Content |
|--------|---------|
| Branch Name | Name + address snippet |
| Doctors | Avatar stack (max 3) + "+N more" overflow |
| Patients | Count |
| Today's Appts | Count with status breakdown mini-badges |
| Status | Active (green) / Inactive (gray) badge |
| Actions | "..." menu: Edit Branch, Manage Doctors, View Details |

**Empty state:** "No branches yet. Create your first branch to get started." + "Create Branch" button.

**Actions from this table:**
1. **Create Branch** button (top-right of card) -> Opens dialog
2. **Row click** -> Filters dashboard to that branch (sets branch picker)
3. **"..." menu > Manage Doctors** -> Opens slide-out sheet with:
   - List of assigned doctors (name, email, role, joined date)
   - "Add Doctor" button -> Search existing users by email or invite new
   - Remove doctor from branch (with confirmation)
4. **"..." menu > Edit Branch** -> Dialog with name, address, phone, email fields

### D) Doctor Assignment Sheet (slide-in from right)

Triggered from Branch Management table "Manage Doctors" action.

```
+----------------------------------+
| Manage Doctors — {Branch Name}   |
+----------------------------------+
| [Search by email or name...]     |
| [+ Invite Doctor]                |
+----------------------------------+
| Dr. Ahmad bin Ismail             |
| ahmad@clinic.com  |  DOCTOR  | x |
+----------------------------------+
| Dr. Sarah Tan                    |
| sarah@clinic.com   |  ADMIN  | x |
+----------------------------------+
```

- Each row: avatar, name, email, role badge (DOCTOR/ADMIN), remove button
- Role can be changed via dropdown (DOCTOR <-> ADMIN) — Owner cannot be changed
- "Invite Doctor" opens inline form: email + role selector + "Send Invite" button
- If user with email exists: auto-add to branch
- If user doesn't exist: show "User not found. They need to register first." message

### E) Create Branch Dialog

Modal dialog with:
- Branch name (required)
- Address (optional)
- Phone (optional)
- Email (optional)
- "Create" primary button + "Cancel" ghost button
- On success: branch appears in table, toast "Branch created"

### F) Today's Schedule Table

Card with table showing today's appointments:

| Column | Content |
|--------|---------|
| Time | "9:00 AM" format |
| Patient | Name (linked to patient detail) |
| Doctor | Name (for owner/admin view) |
| Branch | Name (only when "All Branches" selected) |
| Service | Appointment notes snippet |
| Status | Badge: Scheduled (blue), Checked In (yellow), In Progress (purple), Completed (green), Cancelled (red), No Show (gray) |

- Sorted by time ascending
- Max 10 rows with "View all appointments" link
- Empty state: "No appointments scheduled for today."
- Owner view: shows Branch column, grouped or filterable
- Doctor view: Branch column hidden (only their branch)

### G) Recent Activity Feed

Right column card (or below schedule on mobile):

```
Dr. Ahmad annotated X-ray for Siti Aminah          2 min ago
New patient Lee Wei Ming registered                 15 min ago
Dr. Sarah completed visit for Raj Kumar             1 hour ago
X-ray uploaded for Ahmad bin Hassan                 2 hours ago
```

- Each entry: icon (annotation, patient, visit, xray) + description + relative time
- Max 8 entries with "View all activity" link
- Owner: sees activity across all branches (with branch label)
- Doctor: sees only own branch activity

### H) Quick Actions Panel (right side of Branch Management)

Vertical card with action buttons:

| Action | Icon | Behavior |
|--------|------|----------|
| Add Branch | Building2 | Opens Create Branch dialog (Owner only) |
| Add Doctor | UserPlus | Opens doctor assignment sheet for selected branch |
| Add Patient | UserRoundPlus | Navigates to /dashboard/patients with add dialog open |
| New Appointment | CalendarPlus | Navigates to /dashboard/calendar (future) |
| Upload X-Ray | Upload | Navigates to /dashboard/patients (select patient first) |

- Each button: icon + label, white bg, `#E3E8EE` border, hover `#F0F3F7`
- "Add Branch" only visible for OWNER role

---

## Doctor Dashboard

### Layout

```
+-------------------------------------------------------+
|  Greeting Bar (Good morning, Dr. X)   [{Branch Name}]  |
+-------------------------------------------------------+
|  [Stat Card]  [Stat Card]  [Stat Card]  [Stat Card]   |
+-------------------------------------------------------+
|  My Schedule Today                | Recent Patients    |
|  - time, patient, service         | - patient cards    |
|  - status badges                  | - last visit date  |
+-------------------------------------------------------+
|  Recent X-Rays                                         |
|  - thumbnail grid of recent uploads                    |
+-------------------------------------------------------+
```

### A) Greeting Bar

- Left: "Good morning, **Dr. {name}**"
- Right: Branch name (non-interactive, just a label badge) — doctor cannot switch branches

### B) Stat Cards (4-column grid)

| Card | Icon | Value | Subtitle |
|------|------|-------|----------|
| My Patients | Users | count of patients where doctorId = current user | "in {branch}" |
| Today's Appointments | Calendar | count for today | "{n} remaining" |
| X-Rays This Month | Image | count uploaded this month | "+{n} from last month" |
| Pending Annotations | PenTool | count of X-rays with 0 annotations | "need review" |

### C) My Schedule Today

Same table as owner view but:
- No Doctor column (it's always the current user)
- No Branch column
- Shows only current user's appointments
- Prominent "No appointments today" empty state with relaxed illustration

### D) Recent Patients (right column)

Card showing last 5 patients the doctor interacted with (by visit date or X-ray upload):

```
+----------------------------------+
| Siti Aminah                      |
| Last visit: Apr 15  |  3 X-rays  |
+----------------------------------+
| Lee Wei Ming                     |
| Last visit: Apr 14  |  1 X-ray   |
+----------------------------------+
```

- Each row clickable -> navigates to patient detail
- Shows: name, last visit date, X-ray count
- "View all patients" link at bottom

### E) Recent X-Rays Grid

Horizontal scrollable row of X-ray thumbnails (last 8 uploads):

```
[thumb] [thumb] [thumb] [thumb] [thumb] [thumb] ->
 Siti    Lee     Raj     Ahmad   Siti    Lee
 Apr 15  Apr 14  Apr 13  Apr 12  Apr 11  Apr 10
```

- Thumbnail: 120x90px, `rounded-[6px]`, `#E3E8EE` border
- Below: patient name + date
- Click -> navigates to `/dashboard/xrays/{id}/annotate`
- Empty state: "No X-rays uploaded yet. Upload your first X-ray from a patient's profile."

---

## Edge Cases & Scenarios

### 1. New User (No Branch)

**Scenario:** User registers but has no branch membership.

**Behavior:**
- Dashboard shows an onboarding state
- Large centered card: "Welcome to SmartChiro"
- Two options:
  - "Create your first branch" (becomes OWNER) -> Create Branch dialog
  - "Wait for an invitation" (text explaining that a branch owner needs to add them)
- No stat cards, no tables — just the onboarding prompt

### 2. Owner with No Doctors in Branch

**Scenario:** Owner created a branch but hasn't added any doctors.

**Behavior:**
- Branch Management table shows the branch with "0 doctors" and empty avatar stack
- Inline prompt in the doctors column: "Add doctors" link
- Quick Actions panel highlights "Add Doctor" with a subtle pulse or badge

### 3. Owner with No Patients

**Scenario:** Branch exists, doctors assigned, but no patients yet.

**Behavior:**
- Stat cards show "0" values (not hidden)
- Today's Schedule: "No appointments scheduled for today."
- Recent Activity: "No activity yet. Add your first patient to get started."
- Quick Actions highlights "Add Patient"

### 4. Doctor Removed from Branch

**Scenario:** Owner removes a doctor from a branch while the doctor is logged in.

**Behavior:**
- On next dashboard load/refresh, the doctor's session `activeBranchId` check fails
- Redirect to a "Branch Access Removed" page with message:
  "You've been removed from {branch name}. Contact your branch owner."
- If doctor has other branch memberships: show branch picker
- If no memberships: show "Wait for an invitation" state

### 5. Multiple Branch Memberships (Doctor)

**Scenario:** A doctor belongs to 2+ branches.

**Behavior:**
- On login/dashboard load, if `activeBranchId` is null, show branch picker
- Branch picker: card list of branches with name, address, role badge
- Selected branch saves to `activeBranchId` on User model
- Doctor dashboard shows a branch switcher (dropdown, unlike single-branch label)

### 6. Owner Viewing Doctor's Branch

**Scenario:** Owner uses branch picker to filter to a specific branch.

**Behavior:**
- Stat cards filter to that branch only
- Today's Schedule shows only that branch's appointments
- Recent Activity shows only that branch's activity
- Branch Management table highlights the selected branch row
- "All Branches" option resets to aggregate view

### 7. Empty Schedule (Weekend/Holiday)

**Scenario:** No appointments on current day.

**Behavior:**
- Schedule card shows: "No appointments today"
- Subtle suggestion: "Your next appointment is on Monday, Apr 20 at 9:00 AM" (if future appointments exist)

### 8. Large Data (50+ Patients, 10+ Branches)

**Behavior:**
- Stat cards always show aggregate counts (fast query)
- Branch Management table: paginated (10 per page) with search filter
- Today's Schedule: max 10 rows + "View all" link
- Recent Activity: max 8 entries + "View all" link
- Patient/X-ray counts: use Prisma `_count` aggregation, not full fetches

### 9. Session Expired / Auth Error

**Behavior:**
- API calls return 401 -> redirect to `/login`
- Show toast: "Session expired. Please log in again."

### 10. Slow Network / Loading States

**Behavior:**
- Greeting bar: renders immediately (name from session, no API call)
- Stat cards: skeleton loaders (4 cards with pulsing placeholders)
- Tables: skeleton rows (5 rows of pulsing bars)
- Activity feed: skeleton list items
- Use Suspense boundaries per section so each loads independently

---

## API Endpoints Needed

### GET `/api/dashboard/stats`

Returns stat card data based on role and branch filter.

**Query params:** `?branchId=all` or `?branchId={id}`

**Response (Owner/Admin):**
```json
{
  "totalPatients": 47,
  "todayAppointments": 8,
  "completedAppointments": 3,
  "remainingAppointments": 5,
  "xraysThisWeek": 12,
  "xraysLastWeek": 9,
  "activeDoctors": 4,
  "totalBranches": 2
}
```

**Response (Doctor):**
```json
{
  "myPatients": 15,
  "todayAppointments": 4,
  "remainingAppointments": 2,
  "xraysThisMonth": 8,
  "xraysLastMonth": 5,
  "pendingAnnotations": 3
}
```

### GET `/api/dashboard/branches`

Owner/Admin only. Returns branch list with doctor counts and patient counts.

**Response:**
```json
{
  "branches": [
    {
      "id": "...",
      "name": "SmartChiro KL",
      "address": "Kuala Lumpur",
      "status": "active",
      "doctorCount": 3,
      "patientCount": 25,
      "todayAppointments": 5,
      "doctors": [
        { "id": "...", "name": "Dr. Ahmad", "image": null }
      ]
    }
  ]
}
```

### GET `/api/dashboard/schedule`

Returns today's appointments.

**Query params:** `?branchId=all` or `?branchId={id}`

**Response:**
```json
{
  "appointments": [
    {
      "id": "...",
      "dateTime": "2026-04-16T09:00:00Z",
      "duration": 30,
      "status": "SCHEDULED",
      "notes": "Follow-up",
      "patient": { "id": "...", "firstName": "Siti", "lastName": "Aminah" },
      "doctor": { "id": "...", "name": "Dr. Ahmad" },
      "branch": { "id": "...", "name": "SmartChiro KL" }
    }
  ]
}
```

### GET `/api/dashboard/activity`

Returns recent activity feed.

**Query params:** `?branchId=all` or `?branchId={id}&limit=8`

**Response:**
```json
{
  "activities": [
    {
      "type": "annotation",
      "description": "Dr. Ahmad annotated X-ray for Siti Aminah",
      "timestamp": "2026-04-16T08:30:00Z",
      "branchName": "SmartChiro KL"
    }
  ]
}
```

### GET `/api/dashboard/recent-patients` (Doctor only)

Returns last 5 patients by interaction.

### GET `/api/dashboard/recent-xrays` (Doctor only)

Returns last 8 X-ray thumbnails with patient info.

### POST `/api/branches`

Create a new branch (Owner only).

### POST `/api/branches/{id}/members`

Add a doctor to a branch (Owner/Admin).

### DELETE `/api/branches/{id}/members/{memberId}`

Remove a doctor from a branch (Owner/Admin).

### PATCH `/api/branches/{id}/members/{memberId}`

Update a member's role (Owner only).

---

## Component Architecture

```
src/app/dashboard/page.tsx          -- Server component, fetches session + role
  DashboardView.tsx                 -- Client component, role switch

src/components/dashboard/
  GreetingBar.tsx                   -- Greeting + branch picker
  BranchPicker.tsx                  -- Dropdown with "All Branches" + branch list
  StatCards.tsx                     -- 4-column grid, accepts role-specific data
  StatCard.tsx                      -- Single stat card component

  owner/
    BranchManagementTable.tsx       -- Branch list with actions
    CreateBranchDialog.tsx          -- Modal form for new branch
    ManageDoctorsSheet.tsx          -- Slide-in doctor management
    QuickActionsPanel.tsx           -- Vertical action buttons

  doctor/
    RecentPatientsCard.tsx          -- Last 5 patients list
    RecentXraysGrid.tsx             -- Horizontal scrollable thumbnails

  shared/
    ScheduleTable.tsx               -- Today's appointments table
    ActivityFeed.tsx                 -- Recent activity list
    OnboardingPrompt.tsx            -- No-branch welcome state
    EmptyState.tsx                  -- Reusable empty state with icon + message
    SkeletonCard.tsx                -- Loading skeleton for stat cards
    SkeletonTable.tsx               -- Loading skeleton for tables
```

---

## Design Specifications (Stripe-Inspired)

All components follow the existing design system from `context/project-overview.md`:

- **Page bg:** `#F6F9FC`
- **Card bg:** `#FFFFFF` with `border border-[#E3E8EE] rounded-[6px]` + card shadow
- **Text primary:** `#0A2540` (headings, stat values)
- **Text secondary:** `#425466` (descriptions, table body)
- **Text muted:** `#697386` (timestamps, subtitles, hints)
- **Border:** `#E3E8EE`
- **Hover bg:** `#F0F3F7`
- **Selected/active bg:** `#F0EEFF`
- **Primary button:** `bg-[#635BFF] text-white rounded-[4px]`
- **Secondary button:** `bg-white border-[#E3E8EE] text-[#0A2540] rounded-[4px]`
- **Badges:** `rounded-full` with tinted bg + matching text color
- **Icons:** Lucide, 16px, strokeWidth 1.5
- **Font sizes:** 14px (xs), 15px (sm), 16px (base), 18px (md), 23px (lg)
- **Radius:** 4px buttons/inputs, 6px cards, `rounded-full` badges/avatars

### Stat Card Anatomy

```
+------------------------------------------+
|  [icon circle]                    +12%   |
|                                          |
|  47                                      |
|  Total Patients                          |
|  across 2 branches                       |
+------------------------------------------+
```

- Icon circle: 36px, tinted bg (e.g., `bg-[#F0EEFF]`), icon in brand color
- Trend: `text-[14px]` green `#30B130` for positive, red `#DF1B41` for negative
- Value: `text-[28px] font-semibold text-[#0A2540]`
- Label: `text-[15px] font-medium text-[#425466]`
- Subtitle: `text-[14px] text-[#697386]`

### Status Badge Colors

| Status | Badge bg | Badge text |
|--------|----------|------------|
| Scheduled | `#EFF6FF` | `#0570DE` |
| Checked In | `#FFF8E1` | `#F5A623` |
| In Progress | `#F0EEFF` | `#635BFF` |
| Completed | `#ECFDF5` | `#30B130` |
| Cancelled | `#FEF2F2` | `#DF1B41` |
| No Show | `#F3F4F6` | `#697386` |

---

## Data Fetching Strategy

1. **Session:** Fetched server-side in `page.tsx` via `auth()` — provides role, name, activeBranchId
2. **Stat cards:** Client-side fetch with SWR or fetch in a Suspense boundary
3. **Branch table:** Server-side fetch (Owner page only), or client-side with SWR
4. **Schedule + Activity:** Client-side fetch, wrapped in Suspense with skeleton fallbacks
5. **Recent patients/X-rays:** Client-side fetch (Doctor view only)

Each section loads independently with its own loading skeleton.

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1280px (xl) | Full layout as designed (4-col stats, 2-col tables) |
| 1024-1279px (lg) | 4-col stats, tables stack vertically |
| 768-1023px (md) | 2-col stats, everything stacks |
| < 768px (sm) | 1-col stats, tables as cards, branch table becomes card list |

- Branch Management table collapses to card list on mobile
- Quick Actions panel moves to horizontal scroll on mobile
- Recent X-Rays grid stays horizontal scroll on all sizes

---

## Implementation Order

1. Delete existing OverviewSection, TodaysSchedule, RecentActivity components
2. Build shared components (StatCard, EmptyState, SkeletonCard, SkeletonTable)
3. Build GreetingBar + BranchPicker
4. Build StatCards (with mock data first)
5. Build OnboardingPrompt (no-branch state)
6. Build Doctor dashboard view (schedule, recent patients, recent X-rays)
7. Build Owner dashboard view (branch management, quick actions)
8. Build API endpoints (stats, branches, schedule, activity)
9. Wire up real data, replace mocks
10. Build CreateBranchDialog + ManageDoctorsSheet
11. Add loading skeletons and Suspense boundaries
12. Responsive testing and polish

---

## Out of Scope

- Appointment creation/editing (future Calendar feature)
- Invoice/billing stats (Phase 3)
- AI analysis stats (Phase 3)
- Real-time updates / WebSocket (future enhancement)
- Notification system (future enhancement)
- Dark mode (optional toggle, not in MVP)

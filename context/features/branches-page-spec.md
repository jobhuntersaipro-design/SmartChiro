# Feature: Dedicated Branches Page (`/dashboard/branches`)

## Status

Not Started

## Overview

Move branch management out of the dashboard into a dedicated `/dashboard/branches` page. The dashboard currently doubles as a branch admin panel for owners — this clutters the command center. The new Branches page becomes the single source of truth for all branch operations: CRUD, doctor staffing, schedule overview, and patient distribution.

---

## Goals

1. **Dedicated route** at `/dashboard/branches` with full branch CRUD
2. **Branch cards** showing live stats: doctor count, patient count, today's appointments, operating status
3. **Branch detail view** at `/dashboard/branches/[branchId]` with tabs for Overview, Doctors, Schedule, Patients, Settings
4. **Calendar schedule view** showing doctor availability, appointments, and patient flow per branch
5. **Clean up dashboard** — remove BranchManagementTable and branch-specific dialogs from DashboardView
6. **Keep sidebar link** — `/dashboard/branches` already exists in sidebar nav

---

## Design (Stripe-Inspired)

All UI follows the existing design system: `#533afd` primary, `#061b31` headings, `#273951` body text, `#64748d` muted, `#e5edf5` borders, `#f6f9fc` page bg, 4px radius on buttons/inputs, 6px on cards, blue-tinted shadows.

---

## Page 1: Branch List (`/dashboard/branches`)

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Branches                                    [+ Create Branch] │
│  Manage your clinic locations                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Total        │  │ Active      │  │ Total       │         │
│  │ Branches: 3  │  │ Doctors: 12 │  │ Patients: 248│        │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  [Search branches...]           [Grid ☐] [List ☰]          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐  ┌─────────────────────┐  │
│  │ 🏥 SmartChiro KL             │  │ 🏥 SmartChiro PJ    │  │
│  │ 123 Jalan Bukit Bintang      │  │ 45 Jalan SS2/55     │  │
│  │                               │  │                      │  │
│  │ 👨‍⚕️ 4 Doctors  👤 86 Patients │  │ 👨‍⚕️ 3 Doctors  👤 62  │  │
│  │ 📅 8 appts today             │  │ 📅 5 appts today     │  │
│  │                               │  │                      │  │
│  │ Mon-Fri 9:00-18:00           │  │ Mon-Sat 8:00-17:00   │  │
│  │ ● Active                     │  │ ● Active              │  │
│  │                               │  │                      │  │
│  │ [Manage] [⋯]                 │  │ [Manage] [⋯]          │  │
│  └──────────────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Branch Card Content

Each card shows:
- **Branch name** (bold, `#061b31`, 16px)
- **Address** (muted `#64748d`, 14px) — full: street, city, state, zip
- **Doctor count** with avatar stack (max 3 + overflow)
- **Patient count**
- **Today's appointments** count
- **Operating hours** summary (e.g., "Mon-Fri 9:00-18:00")
- **Status badge** — "Active" (green) or "Closed Today" (based on operating hours + current day)
- **Actions**: "Manage" button → navigates to `/dashboard/branches/[branchId]`, overflow menu (⋯) with Edit, Delete

### Summary Stats Bar

Three stat cards at top:
1. **Total Branches** — count of user's branches
2. **Active Doctors** — sum of all doctors across branches
3. **Total Patients** — sum of all patients across branches

### Interactions

- **Create Branch** button → opens existing `CreateBranchDialog` (4-step wizard)
- **Search** — client-side filter by branch name or address
- **View toggle** — Grid (default, cards) / List (table view matching current BranchManagementTable style)
- **Card click** or **Manage button** → navigate to `/dashboard/branches/[branchId]`
- **Overflow menu → Edit** → opens branch edit dialog (inline or separate)
- **Overflow menu → Delete** → confirmation dialog, OWNER only

### Role-Based Visibility

| Element | OWNER | ADMIN | DOCTOR |
|---------|-------|-------|--------|
| Create Branch button | ✅ | ❌ | ❌ |
| Delete Branch (menu) | ✅ | ❌ | ❌ |
| Edit Branch (menu) | ✅ | ✅ | ❌ |
| View/Manage Branch | ✅ | ✅ | ✅ (own branch only) |
| Summary stats bar | ✅ | ✅ | ❌ (sees single branch) |

---

## Page 2: Branch Detail (`/dashboard/branches/[branchId]`)

### Header

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Branches                                         │
│                                                              │
│  SmartChiro KL                          [Edit] [⋯ Delete]   │
│  123 Jalan Bukit Bintang, KL, 50200                          │
│  📞 03-1234 5678  ✉ kl@smartchiro.my                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Doctors  │ │ Patients │ │ Today's  │ │ This     │       │
│  │    4     │ │   86     │ │ Appts: 8 │ │ Week: 42 │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  [Overview] [Doctors] [Schedule] [Patients] [Settings]       │
└─────────────────────────────────────────────────────────────┘
```

### Tab: Overview (default)

Two-column layout:

**Left column (2/3):**
- **Today's Schedule** — table of today's appointments (time, patient, doctor, status)
- **Recent Activity** — last 10 activities for this branch

**Right column (1/3):**
- **Quick Info** card — operating hours, treatment rooms, clinic type, license number
- **Top Doctors** — list of doctors sorted by patient count, with avatar + name + patient count

### Tab: Doctors

```
┌─────────────────────────────────────────────────────────────┐
│  Doctors (4)                              [+ Add Doctor]     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 🟢 Dr. Ahmad bin Ali          OWNER     Joined Mar 2026 │ │
│  │    📧 ahmad@smartchiro.my                                │ │
│  │    👤 32 patients  🩻 18 X-rays this month               │ │
│  │    📅 Schedule: Mon-Fri 9:00-17:00                       │ │
│  │                                          [View Profile]  │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ 🟢 Dr. Sarah Lee              DOCTOR    Joined Mar 2026 │ │
│  │    📧 sarah@smartchiro.my                                │ │
│  │    👤 28 patients  🩻 12 X-rays this month               │ │
│  │    📅 Schedule: Mon,Wed,Fri 9:00-17:00                   │ │
│  │                                [View Profile] [Remove]   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- Doctor cards with: name, email, role badge, join date, patient count, X-ray count this month
- Schedule summary from DoctorProfile (if available)
- **Add Doctor** → opens ManageDoctorsSheet (reuse existing component)
- **View Profile** → links to `/dashboard/doctors/[userId]`
- **Remove** button (OWNER/ADMIN only, not on OWNER member)
- **Role dropdown** — change between DOCTOR/ADMIN (OWNER only)

### Tab: Schedule (Calendar View)

```
┌─────────────────────────────────────────────────────────────┐
│  April 2026                        [< Prev] [Today] [Next >]│
│  [Day] [Week] [Month]                                        │
├─────────────────────────────────────────────────────────────┤
│        Mon 14    Tue 15    Wed 16    Thu 17    Fri 18        │
│  9:00  Dr.Ahmad  Dr.Sarah  Dr.Ahmad  Dr.Ahmad  Dr.Sarah     │
│        Patient A Patient C Patient E Patient G Patient I     │
│  9:30  Dr.Sarah  -         Dr.Sarah  Dr.Sarah  Dr.Ahmad     │
│        Patient B           Patient F Patient H Patient J     │
│  10:00 ...       ...       ...       ...       ...           │
│                                                              │
│  ─── Legend ───                                              │
│  🟦 Scheduled  🟩 Completed  🟨 In Progress  🟥 Cancelled  │
└─────────────────────────────────────────────────────────────┘
```

**Week view (default):**
- Columns = days (Mon-Sun), rows = 30-min time slots
- Each appointment cell shows: doctor name (color-coded), patient name, status color
- Doctor color coding: each doctor gets a consistent color from a palette
- Current time indicator (red line)
- Click empty slot → future: create appointment
- Click appointment → show appointment details popover

**Day view:**
- Single day with all time slots
- Doctor columns side-by-side (like Google Calendar with multiple calendars)

**Month view:**
- Calendar grid with appointment count per day
- Color intensity based on appointment density
- Click day → switches to Day view for that date

**Doctor availability overlay:**
- Based on branch operating hours + DoctorProfile scheduleHours (if available)
- Grey out non-available hours
- Show "Available Doctors" count per time slot

**Implementation note:** Use a simple custom calendar grid — no external calendar library needed. The data is appointment records from the DB. Start with Week view only for MVP, add Day/Month later.

### Tab: Patients

```
┌─────────────────────────────────────────────────────────────┐
│  Patients (86)                    [Search...]                │
├─────────────────────────────────────────────────────────────┤
│  Name              Doctor         Last Visit    X-Rays      │
│  ─────────────────────────────────────────────────────────── │
│  Ahmad Razak       Dr. Ahmad      Apr 10, 2026    3         │
│  Sarah Tan         Dr. Sarah      Apr 8, 2026     1         │
│  Raj Kumar         Dr. Ahmad      Apr 5, 2026     5         │
│  ...               ...            ...            ...         │
├─────────────────────────────────────────────────────────────┤
│  Showing 1-20 of 86                         [< 1 2 3 4 5 >]│
└─────────────────────────────────────────────────────────────┘
```

- Table of patients belonging to this branch
- Columns: Name, Assigned Doctor, Last Visit date, X-Ray count, Status
- Search by name/email/phone
- Server-side pagination (20 per page)
- Click row → navigate to `/dashboard/patients` with patient detail (or future patient detail page)
- **Doctor filter dropdown** — filter patients by assigned doctor

### Tab: Settings (OWNER/ADMIN only)

- **Branch Info** — edit name, phone, email, website (inline form)
- **Location** — edit address, city, state, zip
- **Operating Hours** — day-by-day toggle with open/close times (reuse from CreateBranchDialog)
- **Practice Details** — treatment rooms, clinic type, license number, specialties, insurance providers
- **Billing Contact** — name, email, phone
- **Danger Zone** — Delete Branch (OWNER only) with confirmation dialog

---

## API Routes

### New Routes

#### `GET /api/branches` (enhance existing)

Add query params:
- `?include=stats` — include doctorCount, patientCount, todayAppointments, operating hours summary
- Already returns basic branch list; enhance response to include stats inline

**Response with `?include=stats`:**
```json
{
  "branches": [
    {
      "id": "abc123",
      "name": "SmartChiro KL",
      "address": "123 Jalan Bukit Bintang",
      "city": "Kuala Lumpur",
      "state": "WP KL",
      "zip": "50200",
      "phone": "03-12345678",
      "email": "kl@smartchiro.my",
      "website": "https://smartchiro.my",
      "operatingHours": { "mon": { "open": "09:00", "close": "18:00" }, ... },
      "treatmentRooms": 4,
      "clinicType": "Chiropractic",
      "doctorCount": 4,
      "patientCount": 86,
      "todayAppointments": 8,
      "weekAppointments": 42,
      "doctors": [
        { "id": "u1", "name": "Dr. Ahmad", "image": null }
      ],
      "userRole": "OWNER",
      "createdAt": "2026-03-31T..."
    }
  ]
}
```

#### `GET /api/branches/[branchId]` (enhance existing)

Add `?include=stats` to include:
- doctorCount, patientCount, todayAppointments, weekAppointments
- Full member list with patient counts per doctor
- Recent activity (last 10)

#### `PATCH /api/branches/[branchId]` (enhance existing)

Accept all editable fields (not just name/address/phone/email):
- Add: `city`, `state`, `zip`, `website`, `operatingHours`, `treatmentRooms`, `clinicType`, `licenseNumber`, `specialties`, `insuranceProviders`, `billingContactName`, `billingContactEmail`, `billingContactPhone`, `ownerName`

#### `GET /api/branches/[branchId]/schedule`

New route for calendar schedule data.

**Query params:**
- `start` — ISO date string (start of range)
- `end` — ISO date string (end of range)
- `doctorId` — optional, filter by doctor

**Response:**
```json
{
  "appointments": [
    {
      "id": "apt1",
      "dateTime": "2026-04-16T09:00:00Z",
      "duration": 30,
      "status": "SCHEDULED",
      "patient": { "id": "p1", "firstName": "Ahmad", "lastName": "Razak" },
      "doctor": { "id": "u1", "name": "Dr. Ahmad" },
      "notes": "Follow-up"
    }
  ],
  "doctors": [
    {
      "id": "u1",
      "name": "Dr. Ahmad",
      "color": "#533afd",
      "scheduleHours": { "mon": { "start": "09:00", "end": "17:00" }, ... }
    }
  ],
  "operatingHours": { "mon": { "open": "09:00", "close": "18:00" }, ... }
}
```

#### `GET /api/branches/[branchId]/patients`

New route for branch-specific patient list with pagination.

**Query params:**
- `search` — fuzzy search across firstName, lastName, email, phone
- `doctorId` — filter by assigned doctor
- `page` — page number (default 1)
- `limit` — items per page (default 20, max 100)

**Response:**
```json
{
  "patients": [
    {
      "id": "p1",
      "firstName": "Ahmad",
      "lastName": "Razak",
      "email": "ahmad@email.com",
      "phone": "012-3456789",
      "doctor": { "id": "u1", "name": "Dr. Ahmad" },
      "lastVisitDate": "2026-04-10T...",
      "xrayCount": 3,
      "visitCount": 5
    }
  ],
  "total": 86,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

#### `GET /api/branches/[branchId]/stats`

Dedicated branch stats endpoint.

**Response:**
```json
{
  "doctorCount": 4,
  "patientCount": 86,
  "todayAppointments": 8,
  "weekAppointments": 42,
  "completedToday": 3,
  "xraysThisMonth": 24,
  "recentActivity": [...]
}
```

### Existing Routes (No Changes)

- `POST /api/branches` — Create branch (used by CreateBranchDialog)
- `DELETE /api/branches/[branchId]` — Delete branch
- `GET /api/branches/[branchId]/members` — List members
- `POST /api/branches/[branchId]/members` — Add member
- `DELETE /api/branches/[branchId]/members/[memberId]` — Remove member
- `PATCH /api/branches/[branchId]/members/[memberId]` — Change role

---

## File Structure

```
src/
├── app/dashboard/branches/
│   ├── page.tsx                          # Branch list page (server component)
│   └── [branchId]/
│       └── page.tsx                      # Branch detail page (server component)
├── components/dashboard/branches/
│   ├── BranchListView.tsx                # Client component: branch list with search, grid/list toggle
│   ├── BranchCard.tsx                    # Single branch card for grid view
│   ├── BranchListTable.tsx               # Table view (reuses BranchManagementTable patterns)
│   ├── BranchSummaryStats.tsx            # Top summary stat cards
│   ├── BranchDetailView.tsx              # Client component: tabbed branch detail
│   ├── BranchOverviewTab.tsx             # Overview tab content
│   ├── BranchDoctorsTab.tsx              # Doctors tab content
│   ├── BranchScheduleTab.tsx             # Calendar schedule tab
│   ├── BranchPatientsTab.tsx             # Patients tab with pagination
│   ├── BranchSettingsTab.tsx             # Settings/edit form
│   ├── WeekCalendar.tsx                  # Week view calendar grid
│   ├── EditBranchDialog.tsx              # Edit branch dialog (field-by-field or full form)
│   └── DeleteBranchDialog.tsx            # Delete confirmation dialog
├── app/api/branches/
│   └── [branchId]/
│       ├── schedule/route.ts             # GET branch schedule
│       ├── patients/route.ts             # GET branch patients (paginated)
│       └── stats/route.ts                # GET branch stats
└── types/
    └── branch.ts                         # Add new types (BranchDetail, BranchSchedule, etc.)
```

---

## Dashboard Cleanup

After the branches page is complete:

1. **Remove from DashboardView.tsx:**
   - `BranchManagementTable` import and render block (lines ~321-342)
   - `CreateBranchDialog` usage (keep it accessible from branches page)
   - `ManageDoctorsSheet` usage (move to branch detail)
   - Branch-related state: `manageDoctorsOpen`, `manageDoctorsBranchId`, `manageDoctorsBranchName`, `members`
   - Branch-related handlers: `handleManageDoctors`, `fetchMembers`, `handleAddDoctor`, `handleRemoveDoctor`, `handleChangeRole`

2. **Keep in DashboardView.tsx:**
   - `GreetingBar` with branch picker (for stat filtering)
   - `OwnerStatCards` / `DoctorStatCards`
   - `ScheduleTable` (today's schedule overview)
   - `ActivityFeed`
   - `QuickActionsPanel` — update "Add Branch" to link to `/dashboard/branches` instead of opening dialog
   - `OnboardingPrompt` — update "Create Branch" to link to `/dashboard/branches`

3. **Remove files (after migration confirmed):**
   - `src/components/dashboard/owner/BranchManagementTable.tsx`

---

## Implementation Order

### Phase 1: Branch List Page
1. Create `src/app/dashboard/branches/page.tsx` (server component with auth)
2. Enhance `GET /api/branches` to support `?include=stats`
3. Build `BranchListView.tsx` — fetch branches, render grid/list
4. Build `BranchCard.tsx` — single branch card with stats
5. Build `BranchSummaryStats.tsx` — top stat cards
6. Reuse `CreateBranchDialog` for branch creation
7. Add `DeleteBranchDialog` for branch deletion
8. Write tests for enhanced API route

### Phase 2: Branch Detail Page
1. Create `src/app/dashboard/branches/[branchId]/page.tsx`
2. Create `GET /api/branches/[branchId]/stats` route
3. Build `BranchDetailView.tsx` with tab navigation
4. Build `BranchOverviewTab.tsx` — today's schedule + quick info
5. Build `BranchDoctorsTab.tsx` — doctor list with actions (reuse ManageDoctorsSheet)
6. Build `BranchSettingsTab.tsx` — edit form with all branch fields
7. Build `EditBranchDialog.tsx` or inline editing
8. Enhance `PATCH /api/branches/[branchId]` to accept all fields
9. Write tests for new API routes

### Phase 3: Schedule Calendar
1. Create `GET /api/branches/[branchId]/schedule` route
2. Build `WeekCalendar.tsx` — time slot grid with doctor columns
3. Build `BranchScheduleTab.tsx` — calendar with navigation and doctor filter
4. Write tests for schedule API

### Phase 4: Branch Patients Tab
1. Create `GET /api/branches/[branchId]/patients` route with pagination
2. Build `BranchPatientsTab.tsx` — table with search, doctor filter, pagination
3. Write tests for patients API

### Phase 5: Dashboard Cleanup
1. Remove branch management from DashboardView
2. Update QuickActionsPanel links
3. Update OnboardingPrompt to redirect to branches page
4. Delete BranchManagementTable component
5. Verify dashboard still works correctly

---

## Test Plan

### API Tests (Integration — hitting Neon DB)

**`GET /api/branches?include=stats`**
- Returns branches with stats when include=stats
- Returns basic list without stats when no include param
- Returns empty array for user with no branches
- Filters to user's branches only (no data leak)

**`GET /api/branches/[branchId]/stats`**
- Returns correct doctor/patient/appointment counts
- Returns 403 for non-member
- Returns 404 for invalid branchId

**`GET /api/branches/[branchId]/schedule`**
- Returns appointments within date range
- Filters by doctorId when provided
- Includes doctor color assignments
- Returns 403 for non-member

**`GET /api/branches/[branchId]/patients`**
- Returns paginated patients
- Search filters by name/email/phone
- Filters by doctorId
- Returns correct pagination metadata
- Returns 403 for non-member

**`PATCH /api/branches/[branchId]` (enhanced)**
- Updates all new fields (operatingHours, treatmentRooms, etc.)
- Validates email format
- Validates phone format
- Returns 403 for DOCTOR role
- Returns 404 for invalid branchId

### Browser Verification

- Branch list page loads with correct stats
- Grid/list toggle works
- Search filters branches
- Create branch wizard works from branches page
- Branch card click navigates to detail page
- Detail page tabs switch correctly
- Doctors tab shows correct members
- Schedule tab shows calendar with appointments
- Patients tab shows paginated list with search
- Settings tab allows editing and saving
- Delete branch with confirmation works
- Role-based visibility (OWNER vs ADMIN vs DOCTOR)
- Mobile responsive: cards stack vertically, calendar scrolls horizontally

---

## Notes

- The sidebar already has a "Branches" nav item pointing to `/dashboard/branches` — no sidebar changes needed
- The `CreateBranchDialog` is already a standalone component — just reuse it on the branches page
- `ManageDoctorsSheet` will be reused in the Doctors tab of branch detail
- Calendar view starts as Week view only — Day and Month views can be added later
- No external calendar library — custom CSS grid with time slots
- Operating hours "Closed Today" logic: check current day against operatingHours JSON

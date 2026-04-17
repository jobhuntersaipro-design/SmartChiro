# Doctor Detail Page

## Overview

Replace the `DoctorDetailSheet` slide-in panel with a dedicated detail page at `/dashboard/doctors/[userId]`. Clicking a doctor card or table row navigates to this page instead of opening a sheet. The page shows a comprehensive doctor command center: stats, today's agenda, patient roster, schedule, professional info, and recent activity.

---

## Goals

1. Navigate to `/dashboard/doctors/[userId]` on doctor card/row click (remove DoctorDetailSheet)
2. Display doctor profile header with avatar, name, status, contact info, and action buttons
3. Show 4 stat cards: Patients, Visits This Month, X-Rays, Avg Visits/Patient
4. Today's Agenda section: appointments for today with patient name, time, status
5. Patients tab: paginated table of patients assigned to this doctor with search
6. Schedule tab: weekly schedule grid from doctor profile
7. Professional tab: license, education, specialties, languages, insurance, bio
8. Recent Activity tab: recent visits with SOAP note previews

---

## Navigation Changes

### DoctorCard.tsx
- Change `onView` callback to use `router.push(`/dashboard/doctors/${doctor.id}`)`
- Remove `onView` prop, use Next.js `Link` or `useRouter` directly
- Keep dropdown menu actions (toggle status, remove) — these still use callbacks

### DoctorListView.tsx
- Remove `DoctorDetailSheet` import and usage
- Remove `detailDoctor` state
- Update `onView` handler in DoctorCard to navigate
- Update table row click to navigate
- Keep CreateDoctorDialog and RemoveDoctorDialog as-is

### Delete DoctorDetailSheet.tsx
- No longer needed

---

## Page Structure

### Route: `src/app/dashboard/doctors/[userId]/page.tsx`

Server component:
- Auth guard (redirect to `/login` if not authenticated)
- Extract `userId` from params
- Pass `userId`, `currentUserId`, `userName` to `DoctorDetailView` client component

### Component: `src/components/dashboard/doctors/DoctorDetailView.tsx`

Client component with tabs. Fetches data from `GET /api/doctors/[userId]?include=detail`.

---

## Layout

```
[Back to Doctors]

┌─────────────────────────────────────────────────────────────┐
│  [Avatar]  Dr. Lim Wei Jie              [Active]            │
│            dr.lim@smartchiro.org  |  +60 12-888 1234        │
│            Gonstead Technique, Sports Chiropractic           │
│                                          [Edit] [Settings]  │
└─────────────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Patients │ │  Visits  │ │  X-Rays  │ │ Avg/Pt   │
│    12    │ │    8     │ │    15    │ │   2.3    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

[Overview] [Patients] [Schedule] [Professional]

─── TAB CONTENT ───────────────────────────────────────────────
```

---

## Tab: Overview (Default)

Two-column layout (desktop), stacked on mobile.

### Left Column

**Today's Agenda** card:
- List of today's appointments for this doctor
- Each row: time, patient name (link to patient), duration, status badge
- Empty state: "No appointments scheduled for today"
- Fetch from new API: `GET /api/doctors/[userId]/appointments?date=today`

**Recent Visits** card:
- Last 5 visits with date, patient name, brief assessment (truncated)
- "View all" link → switches to Professional tab or future visits page
- Fetch from new API: `GET /api/doctors/[userId]/visits?limit=5`

### Right Column (320px sidebar)

**Quick Info** card:
- License: DC-MY-2018-4521
- Experience: 8 years
- Education: Doctor of Chiropractic, RMIT
- Room: Room A
- Fee: RM 150

**Working Hours** card:
- Mon-Sun schedule from `workingSchedule` JSON
- Highlight today's row
- Show "Off" for null days

**Branches** card:
- List of branches with role badges (OWNER/ADMIN/DOCTOR)

---

## Tab: Patients

Paginated table of patients assigned to this doctor.

- Search input (name, IC, email, phone)
- Status filter (active/inactive/all)
- Table columns: Name, IC, Phone, Gender, Status, Last Visit, Actions
- Click row → navigate to patient detail (future)
- Pagination: 20 per page with prev/next
- Fetch from: `GET /api/doctors/[userId]/patients?search=&status=&page=1&limit=20`

---

## Tab: Schedule

Weekly schedule grid showing the doctor's working hours.

- 7-day grid (Mon-Sun)
- Each day shows start-end time or "Off"
- Color-coded: working = `#533afd` tint, off = gray
- Shows consultation fee and treatment room below grid

---

## Tab: Professional

Full professional profile (mirrors what DoctorDetailSheet showed, expanded).

**Sections:**

1. **About** — Bio text (full, not truncated)
2. **Credentials**
   - License Number
   - Education
   - Years of Experience
3. **Specialties** — Tag pills
4. **Languages** — Tag pills
5. **Insurance Plans** — Tag pills
6. **Branches** — Branch list with role badges

---

## New API Endpoints

### GET /api/doctors/[userId]/appointments

Query params:
- `date`: ISO date string or `"today"` (defaults to today)

Response:
```json
{
  "appointments": [
    {
      "id": "...",
      "dateTime": "2026-04-17T10:00:00Z",
      "duration": 30,
      "status": "SCHEDULED",
      "patient": {
        "id": "...",
        "firstName": "Ahmad",
        "lastName": "bin Ibrahim"
      }
    }
  ]
}
```

Auth: caller must share a branch with target doctor.

### GET /api/doctors/[userId]/patients

Query params:
- `search` (optional): fuzzy search on name, IC, email, phone
- `status` (optional): `"active"` | `"inactive"` | `"all"` (default: `"all"`)
- `page` (optional): page number (default: 1)
- `limit` (optional): items per page (default: 20, max: 100)

Response:
```json
{
  "patients": [
    {
      "id": "...",
      "firstName": "Ahmad",
      "lastName": "bin Ibrahim",
      "icNumber": "850315-14-5523",
      "phone": "+60 11-1111 2001",
      "gender": "Male",
      "status": "active",
      "lastVisit": "2026-04-14T10:00:00Z",
      "visitCount": 2,
      "xrayCount": 0
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

Auth: caller must share a branch with target doctor.

### GET /api/doctors/[userId]/visits

Query params:
- `limit` (optional): number of recent visits (default: 5, max: 50)

Response:
```json
{
  "visits": [
    {
      "id": "...",
      "visitDate": "2026-04-14T10:00:00Z",
      "assessment": "Improving lumbar subluxation...",
      "patient": {
        "id": "...",
        "firstName": "Ahmad",
        "lastName": "bin Ibrahim"
      }
    }
  ]
}
```

Auth: caller must share a branch with target doctor.

### Enhanced GET /api/doctors/[userId]

Add `?include=detail` query param to include additional computed stats:
- `visitsThisMonth`: count of visits this month
- `avgVisitsPerPatient`: totalVisits / patientCount (rounded to 1 decimal)

Updated stats in response:
```json
{
  "stats": {
    "patientCount": 12,
    "totalVisits": 45,
    "totalXrays": 15,
    "visitsThisMonth": 8,
    "avgVisitsPerPatient": 3.8
  }
}
```

---

## Styling

Follow existing Stripe-inspired design system:

- **Header card**: `rounded-[6px] border border-[#e5edf5] bg-white px-6 py-5` with `boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px"`
- **Stat cards**: 4-col grid `grid-cols-2 sm:grid-cols-4`, each with icon + label + value
- **Tab bar**: border-bottom active indicator `#533afd`, inactive `#64748d`
- **Cards**: `rounded-[6px] border border-[#e5edf5] bg-white`
- **Table**: white rows, `#F0F3F7` hover, `#e5edf5` separators
- **Status badge**: green active, gray inactive with rounded-[4px]
- **Tag pills**: `bg-[#ededfc] text-[#533afd] rounded-full px-2 py-0.5 text-[12px]`
- **Colors**: headings `#061b31`, body `#273951`, muted `#64748d`, primary `#533afd`

---

## Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/app/dashboard/doctors/[userId]/page.tsx` | Server component | Route page with auth guard |
| `src/components/dashboard/doctors/DoctorDetailView.tsx` | Client component | Main detail view with tabs |
| `src/components/dashboard/doctors/DoctorOverviewTab.tsx` | Client component | Today's agenda + recent visits + sidebar |
| `src/components/dashboard/doctors/DoctorPatientsTab.tsx` | Client component | Paginated patient table |
| `src/components/dashboard/doctors/DoctorScheduleTab.tsx` | Client component | Weekly schedule grid |
| `src/components/dashboard/doctors/DoctorProfessionalTab.tsx` | Client component | Full professional profile |
| `src/app/api/doctors/[userId]/appointments/route.ts` | API route | Today's appointments |
| `src/app/api/doctors/[userId]/patients/route.ts` | API route | Doctor's patients paginated |
| `src/app/api/doctors/[userId]/visits/route.ts` | API route | Recent visits |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/dashboard/doctors/DoctorCard.tsx` | Navigate to detail page instead of calling onView |
| `src/components/dashboard/doctors/DoctorListView.tsx` | Remove DoctorDetailSheet, update click handlers |
| `src/app/api/doctors/[userId]/route.ts` | Add `?include=detail` for extended stats |

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/dashboard/doctors/DoctorDetailSheet.tsx` | Replaced by detail page |

---

## Tests

### API Tests

1. `GET /api/doctors/[userId]?include=detail` returns extended stats
2. `GET /api/doctors/[userId]/appointments` returns today's appointments
3. `GET /api/doctors/[userId]/appointments?date=2026-04-17` returns specific date
4. `GET /api/doctors/[userId]/appointments` — unauthorized returns 401
5. `GET /api/doctors/[userId]/appointments` — no shared branch returns 403
6. `GET /api/doctors/[userId]/patients` returns paginated patients
7. `GET /api/doctors/[userId]/patients?search=ahmad` filters by name
8. `GET /api/doctors/[userId]/patients?status=active` filters by status
9. `GET /api/doctors/[userId]/patients?page=2&limit=5` paginates correctly
10. `GET /api/doctors/[userId]/patients` — unauthorized returns 401
11. `GET /api/doctors/[userId]/visits` returns recent visits
12. `GET /api/doctors/[userId]/visits?limit=3` respects limit
13. `GET /api/doctors/[userId]/visits` — unauthorized returns 401

### Component Tests

14. DoctorCard navigates to `/dashboard/doctors/[id]` on click
15. DoctorListView does not render DoctorDetailSheet
16. DoctorDetailView renders header with doctor info
17. DoctorDetailView renders 4 stat cards
18. DoctorDetailView renders tab navigation
19. DoctorOverviewTab shows today's agenda
20. DoctorOverviewTab shows recent visits
21. DoctorPatientsTab renders patient table with pagination
22. DoctorPatientsTab search filters patients
23. DoctorScheduleTab renders 7-day schedule
24. DoctorScheduleTab highlights today
25. DoctorProfessionalTab renders all profile sections
26. DoctorProfessionalTab shows tag pills for specialties/languages
27. DoctorDetailView shows loading skeleton while fetching
28. DoctorDetailView shows not-found state for invalid userId
29. DoctorOverviewTab shows empty state when no appointments
30. DoctorPatientsTab shows empty state when no patients

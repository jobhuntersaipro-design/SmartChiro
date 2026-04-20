# Patient Detail Page

## Overview

Replace the `PatientDetailSheet` slide-in panel with a dedicated detail page at `/dashboard/patients/[patientId]/details`. Clicking a patient row or card navigates to this page instead of opening a sheet. The page shows a comprehensive patient command center: profile header, stats, visit history with recovery questionnaires, categorized clinical notes, X-rays, and appointments — all in a tabbed interface following the Doctor Detail Page pattern.

---

## Goals

1. Navigate to `/dashboard/patients/[patientId]/details` on patient row/card click (remove PatientDetailSheet)
2. Display patient profile header with avatar, name, status, demographics, contact info, and action buttons (Edit, Delete, Status toggle)
3. Show 4 stat cards: Total Visits, X-Rays, Next Appointment, Recovery Trend
4. Tabbed interface: Overview, Visits, X-Rays, Profile
5. Full visit recording system with SOAP notes, categorized clinical notes, vitals, and recovery questionnaire
6. Recovery questionnaire per visit (pain level, mobility, sleep quality, daily function, overall improvement — each 0-10)
7. Visit timeline showing progression over time

---

## Navigation Changes

### PatientTable.tsx
- Row click: change from `onSelectPatient(patient)` to `router.push(/dashboard/patients/${patient.id}/details)`
- Keep actions dropdown menu (Edit, Delete) — these still use dialog callbacks
- Remove `onSelectPatient` prop

### PatientCard.tsx
- Card click: navigate to `/dashboard/patients/${patient.id}/details`
- Keep dropdown actions (Edit, Delete)

### PatientListView.tsx
- Remove `PatientDetailSheet` import and usage
- Remove `selectedPatient` / `sheetOpen` state
- Remove `onSelectPatient` handler
- Keep AddPatientDialog, EditPatientDialog, DeletePatientDialog as-is
- "View" action in dropdown menus navigates to detail page

### Delete PatientDetailSheet.tsx
- No longer needed — replaced by detail page

### Delete PatientDetailView.tsx (old `/dashboard/[patientId]`)
- The old `/dashboard/[patientId]` route is replaced by the new `/dashboard/patients/[patientId]/details`

---

## Schema Changes (Prisma Migration)

### New Model: VisitQuestionnaire

```prisma
model VisitQuestionnaire {
  id        String @id @default(cuid())

  // Recovery scores (0-10 scale)
  painLevel           Int     // 0 = no pain, 10 = worst pain
  mobilityScore       Int     // 0 = immobile, 10 = full range
  sleepQuality        Int     // 0 = no sleep, 10 = perfect sleep
  dailyFunction       Int     // 0 = cannot function, 10 = fully functional
  overallImprovement  Int     // 0 = much worse, 5 = same, 10 = fully recovered

  // Optional text
  patientComments     String? // free-form patient feedback

  visitId   String  @unique
  visit     Visit   @relation(fields: [visitId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Enhanced Visit Model

Add new categorized note fields to the existing Visit model:

```prisma
model Visit {
  // ... existing fields (id, visitDate, subjective, objective, assessment, plan, treatmentNotes) ...

  // NEW: Visit classification
  visitType           String?   // "initial", "follow_up", "emergency", "reassessment", "discharge"
  chiefComplaint      String?   // Primary reason for this visit

  // NEW: Clinical findings (structured)
  areasAdjusted       String?   // Comma-separated: "C1, C5, T4, L5, SI"
  techniqueUsed       String?   // "Gonstead", "Diversified", "Activator", "Thompson", etc.
  subluxationFindings String?   // Specific subluxation patterns found

  // NEW: Vitals
  bloodPressureSys    Int?      // mmHg systolic
  bloodPressureDia    Int?      // mmHg diastolic
  heartRate           Int?      // bpm
  weight              Float?    // kg
  temperature         Float?    // celsius

  // NEW: Recommendations
  recommendations     String?   // Home exercises, ergonomic advice, lifestyle changes
  referrals           String?   // External referrals (orthopedist, neurologist, etc.)
  nextVisitDays       Int?      // Recommended days until next visit

  // NEW: Relations
  questionnaire       VisitQuestionnaire?

  // ... existing relations ...
}
```

### Migration Name
`add_visit_questionnaire_and_enhanced_notes`

---

## Page Structure

### Route: `src/app/dashboard/patients/[patientId]/details/page.tsx`

Server component:
- Auth guard (redirect to `/login` if not authenticated)
- Extract `patientId` from params
- Pass `patientId`, `currentUserId` to `PatientDetailPage` client component

### Component: `src/components/patients/PatientDetailPage.tsx`

Client component with tabs. Fetches data from `GET /api/patients/[patientId]?include=detail`.

---

## Layout

```
← Back to Patients

┌─────────────────────────────────────────────────────────────────┐
│  [Avatar]  Ahmad bin Ibrahim                        [Active]    │
│            IC: 850315-14-5523  |  Male  |  41 years old         │
│            +60 11-1111 2001  |  ahmad@email.com                 │
│            Dr. Lim Wei Jie  |  KL Main Branch                   │
│                                        [Edit] [Delete] [Status] │
└─────────────────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Visits  │ │  X-Rays  │ │ Next Apt │ │ Recovery │
│    12    │ │    5     │ │  Apr 22  │ │  7.2/10  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

[Overview] [Visits] [X-Rays] [Profile]

─── TAB CONTENT ───────────────────────────────────────────────
```

---

## Tab: Overview (Default)

Two-column layout (desktop), stacked on mobile.

### Left Column

**Recovery Trend** card:
- Line chart (or simple visual) showing recovery scores over last 10 visits
- X-axis: visit dates, Y-axis: 0-10 scale
- Lines for: pain (inverted — lower is better), mobility, daily function, overall
- If no visits with questionnaires: empty state "No recovery data yet"
- Use simple SVG sparkline (no charting library dependency)

**Recent Visits** card:
- Last 5 visits with: date, visit type badge, chief complaint, doctor name
- Each row shows recovery score pill (colored: green 7-10, yellow 4-6, red 0-3)
- Click visit → switches to Visits tab with that visit expanded
- Empty state: "No visits recorded yet"
- Fetch from: `GET /api/patients/[patientId]/visits?limit=5`

**Upcoming Appointments** card:
- Next 3 scheduled appointments: date/time, doctor, duration, status
- Empty state: "No upcoming appointments"
- Fetch from: `GET /api/patients/[patientId]/appointments?upcoming=true&limit=3`

### Right Column (320px sidebar)

**Quick Info** card:
- IC Number
- Date of Birth (with age)
- Gender
- Blood Type
- Occupation
- Race
- Marital Status
- Referral Source
- Member Since (createdAt)

**Emergency Contact** card:
- Name
- Phone (clickable tel: link)
- Relationship

**Medical Alerts** card (highlighted with amber/red border if populated):
- Allergies (red warning if present)
- Medical History
- Clinical Notes

---

## Tab: Visits

Full visit management — list, create, view, edit visits.

### Visit List Header
- "Add Visit" button (opens CreateVisitDialog)
- Filter by visit type (all, initial, follow-up, emergency, reassessment, discharge)
- Sort: newest first (default) / oldest first

### Visit Cards (Expandable Accordion)

Each visit displayed as an expandable card:

**Collapsed State:**
```
┌─────────────────────────────────────────────────────────────┐
│  📅 Apr 17, 2026  |  Follow-up  |  Dr. Lim Wei Jie        │
│  Chief: Lower back pain radiating to left leg               │
│  Recovery: ●●●●●●●○○○ 7/10      Areas: C5, T4, L5         │
│                                                    [▼ Expand]│
└─────────────────────────────────────────────────────────────┘
```

**Expanded State — Sections:**

1. **Recovery Questionnaire** (visual scores)
   - 5 horizontal bars showing scores 0-10 with color coding
   - Pain Level: 3/10 (green = low pain is good)
   - Mobility: 7/10
   - Sleep Quality: 6/10
   - Daily Function: 8/10
   - Overall Improvement: 7/10
   - Patient Comments (if any)

2. **SOAP Notes**
   - **Subjective**: Patient's description of symptoms
   - **Objective**: Clinical findings, examination results
   - **Assessment**: Diagnosis, subluxation findings
   - **Plan**: Treatment plan, next steps

3. **Treatment Details**
   - Visit Type badge
   - Chief Complaint
   - Areas Adjusted (tag pills)
   - Technique Used (tag pill)
   - Subluxation Findings

4. **Vitals** (compact row)
   - BP: 120/80 mmHg | HR: 72 bpm | Weight: 75 kg | Temp: 36.5°C

5. **Recommendations**
   - Recommendations text
   - Referrals (if any)
   - Next Visit: "Recommended in X days"

6. **Associated X-Rays**
   - Thumbnails of X-rays linked to this visit
   - Click to open annotation page in new tab

7. **Actions**: Edit Visit, Delete Visit

### CreateVisitDialog

Multi-section dialog for recording a new visit. Sections with collapsible accordion:

**Section 1: Visit Info**
- Visit Date (default: today)
- Visit Type (select: Initial, Follow-up, Emergency, Reassessment, Discharge)
- Chief Complaint (text input)
- Doctor (auto-set to current user, selectable for OWNER/ADMIN)

**Section 2: Recovery Questionnaire**
- 5 slider inputs (0-10) with labels and emoji indicators
  - Pain Level: 😊 0 ──────── 10 😢 (inverted label: 0="No Pain", 10="Worst Pain")
  - Mobility: 😢 0 ──────── 10 😊 (0="Immobile", 10="Full Range")
  - Sleep Quality: 😢 0 ──────── 10 😊 (0="No Sleep", 10="Perfect")
  - Daily Function: 😢 0 ──────── 10 😊 (0="Cannot Function", 10="Fully Functional")
  - Overall Improvement: 😢 0 ──────── 10 😊 (0="Much Worse", 5="Same", 10="Fully Recovered")
- Patient Comments (textarea, optional)

**Section 3: SOAP Notes**
- Subjective (textarea with placeholder: "Patient reports...")
- Objective (textarea with placeholder: "On examination...")
- Assessment (textarea with placeholder: "Diagnosis / findings...")
- Plan (textarea with placeholder: "Treatment plan / next steps...")

**Section 4: Treatment Details**
- Areas Adjusted (tag input — type and press Enter, shows as pills)
- Technique Used (select or text input: Gonstead, Diversified, Activator, Thompson, Drop Table, Flexion-Distraction, SOT, Other)
- Subluxation Findings (textarea)
- Treatment Notes (textarea)

**Section 5: Vitals** (optional, collapsible)
- Blood Pressure: Systolic / Diastolic (two number inputs side by side)
- Heart Rate (number input, bpm)
- Weight (number input, kg)
- Temperature (number input, °C)

**Section 6: Recommendations** (optional, collapsible)
- Recommendations (textarea)
- Referrals (textarea)
- Next Visit In (number input, days)

**Footer:** Cancel | Save Visit

### EditVisitDialog
- Same layout as CreateVisitDialog, pre-populated with existing data
- Only the visit's doctor or OWNER/ADMIN can edit

---

## Tab: X-Rays

Patient's X-ray gallery with upload capability.

### Layout
- Upload button + drag-and-drop zone (using existing XrayUpload component)
- Grid of X-ray thumbnails (3 columns on desktop, 2 on tablet, 1 on mobile)
- Each thumbnail card shows:
  - Thumbnail image
  - Title (or "Untitled")
  - Body region badge + View type badge
  - Date uploaded
  - Annotation count
  - Click → opens `/dashboard/xrays/[id]/annotate` in new tab

### Sorting
- Most recent first (default)

---

## Tab: Profile

Full patient profile (mirrors what PatientDetailSheet showed, expanded into full-width sections).

### Sections

1. **Personal Information**
   - Full Name, IC Number, Date of Birth (with age), Gender
   - Occupation, Race, Marital Status, Blood Type

2. **Contact Information**
   - Email, Phone
   - Full address (addressLine1, addressLine2, city, state, postcode, country)

3. **Emergency Contact**
   - Name, Phone, Relationship

4. **Clinical Information**
   - Allergies (highlighted if present)
   - Medical History
   - Referral Source
   - Clinical Notes

5. **Administrative**
   - Patient ID
   - Assigned Doctor
   - Branch
   - Status
   - Created date
   - Last updated

Each section in a white card with `rounded-[6px] border border-[#e5edf5]`.
Edit button at top-right of page opens EditPatientDialog.

---

## New API Endpoints

### GET /api/patients/[patientId]/visits

Query params:
- `limit` (optional): number of visits (default: 20, max: 100)
- `offset` (optional): pagination offset (default: 0)
- `type` (optional): visit type filter ("initial", "follow_up", "emergency", "reassessment", "discharge")
- `sort` (optional): "newest" (default) or "oldest"

Response:
```json
{
  "visits": [
    {
      "id": "...",
      "visitDate": "2026-04-17T10:00:00Z",
      "visitType": "follow_up",
      "chiefComplaint": "Lower back pain radiating to left leg",
      "subjective": "Patient reports...",
      "objective": "On examination...",
      "assessment": "L5-S1 subluxation with...",
      "plan": "Continue Gonstead adjustments...",
      "treatmentNotes": "...",
      "areasAdjusted": "C5, T4, L5",
      "techniqueUsed": "Gonstead",
      "subluxationFindings": "...",
      "bloodPressureSys": 120,
      "bloodPressureDia": 80,
      "heartRate": 72,
      "weight": 75.0,
      "temperature": 36.5,
      "recommendations": "Ice 15min 3x daily...",
      "referrals": null,
      "nextVisitDays": 7,
      "questionnaire": {
        "painLevel": 3,
        "mobilityScore": 7,
        "sleepQuality": 6,
        "dailyFunction": 8,
        "overallImprovement": 7,
        "patientComments": "Feeling much better this week"
      },
      "doctor": {
        "id": "...",
        "name": "Dr. Lim Wei Jie"
      },
      "xrays": [
        {
          "id": "...",
          "title": "Lumbar AP",
          "thumbnailUrl": "...",
          "bodyRegion": "LUMBAR"
        }
      ],
      "createdAt": "2026-04-17T10:00:00Z"
    }
  ],
  "total": 12,
  "limit": 20,
  "offset": 0
}
```

Auth: assigned doctor or branch OWNER/ADMIN.

### POST /api/patients/[patientId]/visits

Create a new visit with optional questionnaire.

Request body:
```json
{
  "visitDate": "2026-04-17T10:00:00Z",
  "visitType": "follow_up",
  "chiefComplaint": "Lower back pain",
  "subjective": "Patient reports...",
  "objective": "On examination...",
  "assessment": "L5-S1 subluxation...",
  "plan": "Continue adjustments...",
  "treatmentNotes": "...",
  "areasAdjusted": "C5, T4, L5",
  "techniqueUsed": "Gonstead",
  "subluxationFindings": "...",
  "bloodPressureSys": 120,
  "bloodPressureDia": 80,
  "heartRate": 72,
  "weight": 75.0,
  "temperature": 36.5,
  "recommendations": "Ice 15min 3x daily...",
  "referrals": null,
  "nextVisitDays": 7,
  "questionnaire": {
    "painLevel": 3,
    "mobilityScore": 7,
    "sleepQuality": 6,
    "dailyFunction": 8,
    "overallImprovement": 7,
    "patientComments": "Feeling much better"
  }
}
```

Auth: assigned doctor or branch OWNER/ADMIN. Sets `doctorId` to current user.

Response: `201` with created visit object.

### PUT /api/patients/[patientId]/visits/[visitId]

Update an existing visit and its questionnaire.

Request body: same shape as POST (partial updates allowed).

Auth: visit's doctor or branch OWNER/ADMIN.

Response: `200` with updated visit object.

### DELETE /api/patients/[patientId]/visits/[visitId]

Soft concern: only the visit's doctor or OWNER/ADMIN can delete.

Response: `200` with `{ success: true }`.

### GET /api/patients/[patientId]/appointments

Query params:
- `upcoming` (optional): `"true"` to filter future appointments only
- `limit` (optional): default 10, max 50

Response:
```json
{
  "appointments": [
    {
      "id": "...",
      "dateTime": "2026-04-22T10:00:00Z",
      "duration": 30,
      "status": "SCHEDULED",
      "notes": "Follow-up adjustment",
      "doctor": {
        "id": "...",
        "name": "Dr. Lim Wei Jie"
      }
    }
  ]
}
```

Auth: assigned doctor or branch OWNER/ADMIN.

### Enhanced GET /api/patients/[patientId]

Add `?include=detail` query param to include:
- `recoveryTrend`: average of last 5 questionnaire `overallImprovement` scores (or null if none)
- `nextAppointment`: nearest future appointment date (or null)
- `visitsByType`: count breakdown by visit type

Updated response adds to existing:
```json
{
  "patient": {
    "...existing fields...",
    "recoveryTrend": 7.2,
    "nextAppointment": "2026-04-22T10:00:00Z",
    "visitsByType": {
      "initial": 1,
      "follow_up": 9,
      "emergency": 1,
      "reassessment": 1,
      "discharge": 0
    }
  }
}
```

---

## Styling

Follow DESIGN.md Stripe-inspired design system:

- **Header card**: `rounded-[6px] border border-[#e5edf5] bg-white px-6 py-5` with `boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px"`
- **Stat cards**: 4-col grid `grid-cols-2 sm:grid-cols-4`, each with icon + label + value, `rounded-[6px] border border-[#e5edf5]`
- **Tab bar**: border-bottom active indicator `#533afd`, inactive `#64748d`, font-weight 400
- **Cards**: `rounded-[6px] border border-[#e5edf5] bg-white`
- **Visit cards**: white bg, left border accent (4px) colored by visit type:
  - Initial: `#533afd` (purple)
  - Follow-up: `#0570DE` (blue)
  - Emergency: `#DF1B41` (red)
  - Reassessment: `#F5A623` (amber)
  - Discharge: `#30B130` (green)
- **Recovery bars**: Horizontal progress bars, color gradient: red (0-3) → amber (4-6) → green (7-10)
- **Tag pills**: `bg-[#ededfc] text-[#533afd] rounded-full px-2.5 py-0.5 text-[12px]`
- **Status badge**: green active, gray inactive, red discharged — `rounded-[4px] px-[6px] py-[1px] text-[11px]`
- **Colors**: headings `#061b31`, body `#273951`, muted `#64748d`, primary `#533afd`, borders `#e5edf5`
- **Shadows**: blue-tinted `rgba(50,50,93,0.25)` per DESIGN.md
- **Font sizes**: 15% larger than Stripe defaults per project spec
- **Questionnaire sliders**: Custom range inputs with `#533afd` track fill
- **Medical alerts card**: `border-l-4 border-[#DF1B41]` if allergies present, `border-[#F5A623]` for warnings

---

## Types

### New types in `src/types/visit.ts`

```typescript
export interface VisitQuestionnaire {
  id: string;
  painLevel: number;
  mobilityScore: number;
  sleepQuality: number;
  dailyFunction: number;
  overallImprovement: number;
  patientComments: string | null;
}

export interface VisitVitals {
  bloodPressureSys: number | null;
  bloodPressureDia: number | null;
  heartRate: number | null;
  weight: number | null;
  temperature: number | null;
}

export interface Visit {
  id: string;
  visitDate: string;
  visitType: string | null;
  chiefComplaint: string | null;
  // SOAP
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatmentNotes: string | null;
  // Treatment
  areasAdjusted: string | null;
  techniqueUsed: string | null;
  subluxationFindings: string | null;
  // Vitals
  bloodPressureSys: number | null;
  bloodPressureDia: number | null;
  heartRate: number | null;
  weight: number | null;
  temperature: number | null;
  // Recommendations
  recommendations: string | null;
  referrals: string | null;
  nextVisitDays: number | null;
  // Relations
  questionnaire: VisitQuestionnaire | null;
  doctor: { id: string; name: string | null };
  xrays: { id: string; title: string | null; thumbnailUrl: string | null; bodyRegion: string | null }[];
  createdAt: string;
}

export interface CreateVisitData {
  visitDate?: string;
  visitType?: string;
  chiefComplaint?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  treatmentNotes?: string;
  areasAdjusted?: string;
  techniqueUsed?: string;
  subluxationFindings?: string;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  heartRate?: number;
  weight?: number;
  temperature?: number;
  recommendations?: string;
  referrals?: string;
  nextVisitDays?: number;
  questionnaire?: {
    painLevel: number;
    mobilityScore: number;
    sleepQuality: number;
    dailyFunction: number;
    overallImprovement: number;
    patientComments?: string;
  };
}
```

---

## Files to Create

| File | Type | Description |
|------|------|-------------|
| `src/app/dashboard/patients/[patientId]/details/page.tsx` | Server component | Route page with auth guard |
| `src/components/patients/PatientDetailPage.tsx` | Client component | Main detail view with tabs |
| `src/components/patients/PatientOverviewTab.tsx` | Client component | Recovery trend + recent visits + sidebar |
| `src/components/patients/PatientVisitsTab.tsx` | Client component | Visit list with accordion + create/edit |
| `src/components/patients/PatientXraysTab.tsx` | Client component | X-ray gallery with upload |
| `src/components/patients/PatientProfileTab.tsx` | Client component | Full profile display |
| `src/components/patients/CreateVisitDialog.tsx` | Client component | Multi-section visit recording dialog |
| `src/components/patients/EditVisitDialog.tsx` | Client component | Edit existing visit |
| `src/components/patients/DeleteVisitDialog.tsx` | Client component | Confirm delete visit |
| `src/components/patients/RecoveryScoreBar.tsx` | Client component | Reusable horizontal score bar (0-10) |
| `src/components/patients/VisitCard.tsx` | Client component | Expandable visit card |
| `src/types/visit.ts` | Types | Visit, VisitQuestionnaire, CreateVisitData |
| `src/app/api/patients/[patientId]/visits/route.ts` | API route | GET list + POST create visits |
| `src/app/api/patients/[patientId]/visits/[visitId]/route.ts` | API route | PUT update + DELETE visit |
| `src/app/api/patients/[patientId]/appointments/route.ts` | API route | GET patient appointments |
| `prisma/migrations/.../migration.sql` | Migration | Visit questionnaire + enhanced notes |

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add VisitQuestionnaire model, enhance Visit model |
| `src/components/patients/PatientTable.tsx` | Row click navigates to detail page |
| `src/components/patients/PatientCard.tsx` | Card click navigates to detail page |
| `src/components/patients/PatientListView.tsx` | Remove PatientDetailSheet usage |
| `src/app/api/patients/[patientId]/route.ts` | Add `?include=detail` with recovery trend + next apt |
| `src/types/patient.ts` | Add recoveryTrend, nextAppointment, visitsByType |
| `prisma/seed.ts` | Add sample visits with questionnaires |

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/patients/PatientDetailSheet.tsx` | Replaced by detail page |
| `src/components/patients/PatientDetailView.tsx` | Old route replaced |
| `src/app/dashboard/[patientId]/page.tsx` | Old route (if exists) |

---

## Seed Data

Expand seed to include visits with questionnaires for realistic data:

- 3-5 visits per patient across different doctors
- Mix of visit types (initial, follow-up, emergency)
- Questionnaire scores showing recovery progression (improving over time)
- Sample SOAP notes, vitals, areas adjusted
- Techniques: Gonstead, Diversified, Activator
- Realistic Malaysian patient context

---

## Tests

### API Tests

1. `GET /api/patients/[patientId]?include=detail` returns recovery trend + next appointment
2. `GET /api/patients/[patientId]/visits` returns visits with questionnaires
3. `GET /api/patients/[patientId]/visits?type=follow_up` filters by visit type
4. `GET /api/patients/[patientId]/visits?sort=oldest` sorts correctly
5. `GET /api/patients/[patientId]/visits` — unauthorized returns 401
6. `GET /api/patients/[patientId]/visits` — different branch returns 403
7. `POST /api/patients/[patientId]/visits` creates visit with questionnaire
8. `POST /api/patients/[patientId]/visits` creates visit without questionnaire
9. `POST /api/patients/[patientId]/visits` validates questionnaire scores (0-10 range)
10. `POST /api/patients/[patientId]/visits` — unauthorized returns 401
11. `PUT /api/patients/[patientId]/visits/[visitId]` updates visit fields
12. `PUT /api/patients/[patientId]/visits/[visitId]` updates questionnaire scores
13. `PUT /api/patients/[patientId]/visits/[visitId]` — wrong doctor returns 403 (non-OWNER)
14. `DELETE /api/patients/[patientId]/visits/[visitId]` deletes visit + cascade questionnaire
15. `DELETE /api/patients/[patientId]/visits/[visitId]` — wrong doctor returns 403
16. `GET /api/patients/[patientId]/appointments?upcoming=true` returns future only
17. `GET /api/patients/[patientId]/appointments` returns all appointments

### Component Tests

18. PatientTable row click navigates to `/dashboard/patients/[id]/details`
19. PatientCard click navigates to detail page
20. PatientListView does not render PatientDetailSheet
21. PatientDetailPage renders header with patient info
22. PatientDetailPage renders 4 stat cards
23. PatientDetailPage renders tab navigation (4 tabs)
24. PatientOverviewTab shows recovery trend section
25. PatientOverviewTab shows recent visits
26. PatientOverviewTab shows quick info sidebar
27. PatientVisitsTab renders visit cards
28. PatientVisitsTab "Add Visit" opens CreateVisitDialog
29. CreateVisitDialog renders all 6 sections
30. CreateVisitDialog questionnaire sliders range 0-10
31. CreateVisitDialog submits with valid data
32. VisitCard expands to show full details
33. VisitCard shows recovery scores as colored bars
34. PatientXraysTab renders X-ray thumbnails
35. PatientProfileTab renders all profile sections
36. PatientDetailPage shows loading skeleton
37. PatientDetailPage shows not-found for invalid patientId
38. RecoveryScoreBar renders correct color for score (red/amber/green)
39. PatientVisitsTab filter by visit type works
40. EditVisitDialog pre-populates existing visit data

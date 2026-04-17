# Patients Page Overhaul — Full Spec

## Status

Spec Complete — Ready for Implementation

---

## Overview

Overhaul the existing `/dashboard/patients` page into a full-featured patient management hub with comprehensive CRUD operations, expanded patient fields (IC number, full address breakdown, occupation, blood type, allergies, assigned doctor picker), inline editing via detail sheet, delete confirmation, and status filter. The current page has basic list + add — this spec upgrades it to match the quality of the Doctors and Branches pages.

---

## 1. Schema Changes

### New Fields on Patient Model

```prisma
model Patient {
  // ... existing fields ...

  // NEW fields
  icNumber         String?   // Malaysian IC (NRIC) e.g. "850315-08-5234"
  occupation       String?
  race             String?   // Malay, Chinese, Indian, Other
  maritalStatus    String?   // Single, Married, Divorced, Widowed
  bloodType        String?   // A+, A-, B+, B-, O+, O-, AB+, AB-
  allergies        String?   // Free text: drug allergies, latex, etc.
  referralSource   String?   // How did they find the clinic

  // Address breakdown (replace single `address` field)
  addressLine1     String?   // Street address
  addressLine2     String?   // Apt, unit, floor
  city             String?
  state            String?
  postcode         String?
  country          String?   @default("Malaysia")

  // Emergency contact breakdown (replace single `emergencyContact` field)
  emergencyName    String?
  emergencyPhone   String?
  emergencyRelation String?  // Spouse, Parent, Sibling, Friend, Other

  // Status
  status           String?   @default("active") // active, inactive, discharged
}
```

**Migration strategy:** Non-breaking — all new fields are optional. Existing data unaffected. Old `address` and `emergencyContact` fields remain for backward compat (can be migrated later).

---

## 2. Routes

| Route | Purpose |
|-------|---------|
| `/dashboard/patients` | Patient list page (enhanced) |

No new route pages — the detail/edit UI lives in the existing PatientDetailSheet (enhanced).

---

## 3. API Changes

### 3a. GET /api/patients — Enhanced List

**New query params:**
- `?status=active|inactive|discharged|all` (default: `all`)
- `?doctorId=xxx` — filter to specific doctor's patients (OWNER/ADMIN only)

**Response additions:**
Each patient now also includes:
```typescript
icNumber: string | null;
occupation: string | null;
status: string; // "active" | "inactive" | "discharged"
```

### 3b. POST /api/patients — Enhanced Create

**New accepted fields in request body:**
```typescript
{
  // existing required
  firstName: string;
  lastName: string;
  // existing optional
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  // NEW optional fields
  icNumber?: string;
  occupation?: string;
  race?: string;
  maritalStatus?: string;
  bloodType?: string;
  allergies?: string;
  referralSource?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  medicalHistory?: string;
  notes?: string;
  doctorId?: string; // optional — defaults to caller, OWNER/ADMIN can assign to any branch doctor
}
```

**New validation:**
- `icNumber`: if provided, format check (12 digits, with or without dashes)
- `bloodType`: if provided, must be one of A+, A-, B+, B-, O+, O-, AB+, AB-
- `maritalStatus`: if provided, must be one of Single, Married, Divorced, Widowed
- `doctorId`: if provided, must be a member of the target branch

### 3c. PATCH /api/patients/[patientId] — Enhanced Update

**New accepted fields:** Same new fields as POST. Plus:
- `status`: "active" | "inactive" | "discharged"

### 3d. DELETE /api/patients/[patientId] — No changes

Existing endpoint is sufficient.

### 3e. Existing Endpoints (No Changes)

- `GET /api/patients/[patientId]` — enhance response to include new fields

---

## 4. Types

### Updated Patient type in `src/types/patient.ts`:

```typescript
export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  icNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  occupation: string | null;
  race: string | null;
  maritalStatus: string | null;
  bloodType: string | null;
  allergies: string | null;
  referralSource: string | null;
  // Address
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  // Emergency
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  // Legacy (keep for backward compat)
  address: string | null;
  emergencyContact: string | null;
  // Clinical
  medicalHistory: string | null;
  notes: string | null;
  status: string; // "active" | "inactive" | "discharged"
  // Relations
  doctorId: string;
  doctorName: string;
  branchId: string;
  // Computed
  lastVisit: string | null;
  totalVisits: number;
  totalXrays: number;
  createdAt: string;
  xrays: PatientXray[];
}

export interface CreatePatientData {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  icNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  occupation?: string;
  race?: string;
  maritalStatus?: string;
  bloodType?: string;
  allergies?: string;
  referralSource?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  medicalHistory?: string;
  notes?: string;
  doctorId?: string;
}
```

---

## 5. File Structure

```
src/
├── app/dashboard/patients/
│   └── page.tsx                              # Rewrite → server component + PatientListView
├── components/patients/
│   ├── PatientListView.tsx                   # NEW — main client view (replaces inline page logic)
│   ├── PatientTable.tsx                      # ENHANCE — add status column, more actions
│   ├── PatientSearch.tsx                     # KEEP as-is
│   ├── PatientCard.tsx                       # NEW — grid view card
│   ├── PatientSummaryStats.tsx               # NEW — stats bar
│   ├── AddPatientDialog.tsx                  # ENHANCE — add all new fields, 2-section layout
│   ├── PatientDetailSheet.tsx                # ENHANCE — add edit mode, all new fields, delete button
│   ├── EditPatientDialog.tsx                 # NEW — full edit form (reuses AddPatientDialog structure)
│   ├── DeletePatientDialog.tsx               # NEW — confirm deletion with cascade warning
│   └── PatientDetailView.tsx                 # KEEP (full-page view, enhance with new fields)
├── types/patient.ts                          # UPDATE — add new fields + CreatePatientData
└── app/api/patients/
    ├── route.ts                              # ENHANCE — new fields in GET/POST
    └── [patientId]/route.ts                  # ENHANCE — new fields in GET/PATCH
```

---

## 6. UI/UX Design (DESIGN.md Aligned)

### 6a. Page Layout — `/dashboard/patients`

Convert from client component to server component + PatientListView (matches Doctors/Branches pattern).

#### Header Row
```
┌─────────────────────────────────────────────────────────────────┐
│  Patients                                        [+ Add Patient] │
│  Manage your clinic's patient records                            │
└─────────────────────────────────────────────────────────────────┘
```
- Title: `text-[22px] font-light text-[#061b31] tracking-[-0.22px]`
- Subtitle: `text-[14px] text-[#64748d]`
- Button: Primary purple `bg-[#533afd]`

#### Summary Stats Bar
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  127         │  │  118         │  │  6           │  │  3           │
│  Total       │  │  Active      │  │  Inactive    │  │  Discharged  │
│  Patients    │  │  Patients    │  │  Patients    │  │  Patients    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```
- Same styling as DoctorSummaryStats

#### Filters Row
```
┌────────────────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────┐ ┌────┐
│  🔍 Search patients...      │  │ All Doctors ▾│  │ All Status  ▾│  │ ≡  │ │ ⊞ │
└────────────────────────────┘  └──────────────┘  └──────────────┘  └────┘ └────┘
```
- Search: fuzzy across name, email, phone, IC number
- Doctor filter: dropdown of branch doctors (OWNER/ADMIN only)
- Status filter: All / Active / Inactive / Discharged
- View toggle: Grid / List

#### Patient Table (List View) — Enhanced

```
┌────────┬──────────────────┬───────────────┬──────────┬────────┬────────┬────────┬──────┐
│        │ Name / IC        │ Contact       │ Doctor   │ Status │Visits  │ X-rays │      │
├────────┼──────────────────┼───────────────┼──────────┼────────┼────────┼────────┼──────┤
│ [AR]   │ Ahmad Rahman     │ +60 12-345..  │ Dr. Chen │ 🟢Act  │   12   │   3    │ ···  │
│        │ 850315-08-5234   │ ahmad@...     │          │        │        │        │      │
├────────┼──────────────────┼───────────────┼──────────┼────────┼────────┼────────┼──────┤
│ [SA]   │ Siti Aminah      │ +60 13-456..  │ Dr. Khan │ ⚫Dis  │    8   │   1    │ ···  │
│        │ 920722-14-5678   │ siti@...      │          │        │        │        │      │
└────────┴──────────────────┴───────────────┴──────────┴────────┴────────┴────────┴──────┘
```

**Table additions vs current:**
- IC number shown below name
- Doctor column
- Status badge column
- More menu (···) with: View, Edit, Delete

#### Patient Cards (Grid View — 3 columns)

```
┌─────────────────────────────────────────┐
│  ┌──┐  Ahmad Rahman              🟢Act │
│  │AR│  850315-08-5234                   │
│  └──┘  +60 12-345 6789                  │
│                                         │
│  ┌───────┐ ┌───────┐ ┌───────┐         │
│  │  12   │ │   3   │ │ Active│         │
│  │Visits │ │X-rays │ │Patient│         │
│  └───────┘ └───────┘ └───────┘         │
│                                         │
│  👨‍⚕️ Dr. Sarah Chen                     │
│  Last visit: Mar 15, 2026               │
└─────────────────────────────────────────┘
```

### 6b. Enhanced Add Patient Dialog

**Three sections:**

**Section 1 — Personal Information (Required: name only)**
```
Full Name*          IC Number              Date of Birth
[First]  [Last]     [850315-08-5234    ]   [1985-03-15  ]

Gender              Race                   Marital Status
[Male          ▾]  [Malay           ▾]   [Married     ▾]

Occupation          Blood Type             Referral Source
[Construction..  ]  [O+             ▾]    [Walk-in     ▾]
```

**Section 2 — Contact & Address**
```
Email               Phone
[ahmad@email.com ]  [+60 12-345 6789 ]

Address Line 1      Address Line 2
[123 Jalan Bukit ]  [Unit 4A         ]

City                State              Postcode
[Kuala Lumpur    ]  [Wilayah Persek▾] [50450       ]
```

**Section 3 — Emergency Contact & Medical**
```
Emergency Name      Emergency Phone     Relationship
[Fatimah Rahman  ]  [+60 13-456 7890]  [Spouse      ▾]

Allergies
[Penicillin, latex                                    ]

Medical History
[Chronic lower back pain since 2018...                ]
[ multiline textarea                                  ]

Notes
[Patient prefers morning appointments                 ]
[ multiline textarea                                  ]

Assigned Doctor
[Dr. Sarah Chen ▾]  ← populated from branch doctors
```

### 6c. Enhanced Patient Detail Sheet

Same right slide-in sheet, but with:
- **Edit button** in header → opens EditPatientDialog
- **Status dropdown** for inline status change (active/inactive/discharged)
- **All new fields** displayed in organized sections
- **Delete button** at bottom → opens DeletePatientDialog
- **X-ray section** with upload + gallery (existing, keep as-is)

### 6d. Delete Patient Dialog

```
┌────────────────────────────────────────────┐
│  Delete Patient                       [X]  │
│────────────────────────────────────────────│
│                                            │
│  Are you sure you want to delete           │
│  Ahmad Rahman?                             │
│                                            │
│  This action cannot be undone. All         │
│  associated data will be permanently       │
│  removed:                                  │
│                                            │
│  ⚠ 12 visits                              │
│  ⚠ 3 X-rays with annotations             │
│  ⚠ 2 appointments                         │
│                                            │
│         [Cancel]  [Delete Patient]         │
└────────────────────────────────────────────┘
```

- Delete button: `bg-[#df1b41] hover:bg-[#c4183c] text-white`
- Warning items: `text-[13px] text-[#9b6829] bg-[#FFF8E1]`

---

## 7. Component Behavior

### PatientListView.tsx (Main)

```typescript
// State
const [patients, setPatients] = useState<Patient[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");
const [doctorFilter, setDoctorFilter] = useState("all");
const [statusFilter, setStatusFilter] = useState("all");
const [viewMode, setViewMode] = useState<"grid" | "list">("list"); // default list
const [addOpen, setAddOpen] = useState(false);
const [editPatient, setEditPatient] = useState<Patient | null>(null);
const [detailPatient, setDetailPatient] = useState<Patient | null>(null);
const [deletePatient, setDeletePatient] = useState<Patient | null>(null);

// Fetch
useEffect → GET /api/patients

// Client-side filter for instant UX
const filtered = useMemo(() => filter by search + doctorFilter + statusFilter)

// Stats
const stats = useMemo(() => ({
  total: patients.length,
  active: patients.filter(p => p.status === "active").length,
  inactive: patients.filter(p => p.status === "inactive").length,
  discharged: patients.filter(p => p.status === "discharged").length,
}))
```

### Role-Based Visibility

| Element | OWNER/ADMIN | DOCTOR |
|---------|------------|--------|
| "+ Add Patient" button | Visible | Visible |
| Doctor filter | Visible (sees all) | Hidden (sees own only) |
| Edit patient | Any patient in branch | Own patients only |
| Delete patient | Any patient in branch | Own patients only |
| Status change | Any patient in branch | Own patients only |
| Assigned doctor dropdown | All branch doctors | Disabled (self) |

---

## 8. Interactions & Animations

| Interaction | Effect |
|-------------|--------|
| Card hover | `translate-y-[-1px]`, shadow Level 2 → Level 3 |
| Card click | Opens PatientDetailSheet |
| Row click | Opens PatientDetailSheet |
| Search input | Debounced 300ms, filters client-side |
| Status change | Optimistic update, PATCH |
| Add success | Re-fetch list, toast "Patient created" |
| Edit success | Re-fetch list, toast "Patient updated" |
| Delete success | Remove from list, toast "Patient deleted" |
| Detail sheet | Fetches GET /api/patients/[id] for full data |

---

## 9. Malaysian Context

### IC Number (NRIC)
- Format: `YYMMDD-SS-XXXX` (12 digits, dashes optional)
- First 6 = DOB, next 2 = state code, last 4 = unique + gender (odd=male, even=female)
- Auto-extract DOB from IC if dateOfBirth is empty
- Display with dashes for readability

### State Dropdown
Pre-populated with Malaysian states:
- Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Wilayah Persekutuan Kuala Lumpur, Wilayah Persekutuan Putrajaya, Wilayah Persekutuan Labuan

### Race Options
- Malay, Chinese, Indian, Others

### Referral Source Options
- Walk-in, Doctor Referral, Online Search, Social Media, Friend/Family, Insurance Panel, Other

---

## 10. TDD Test Plan

### API Tests — `src/app/api/patients/__tests__/patients-overhaul.test.ts`

**GET /api/patients — Enhanced**

| # | Test | Expected |
|---|------|----------|
| 1 | Returns new fields (icNumber, occupation, status) | All present in response |
| 2 | Filters by status=active | Only active patients |
| 3 | Filters by status=inactive | Only inactive patients |
| 4 | Filters by status=discharged | Only discharged patients |
| 5 | Filters by doctorId (OWNER) | Only that doctor's patients |
| 6 | doctorId filter ignored for DOCTOR role | Still sees own only |
| 7 | Search matches IC number | Found by partial IC |

**POST /api/patients — Enhanced**

| # | Test | Expected |
|---|------|----------|
| 8 | Creates with all new fields | 201, all fields persisted |
| 9 | Creates with only required fields (name) | 201, nulls for optional |
| 10 | Validates IC number format (valid 12-digit) | 201 |
| 11 | Validates IC number format (invalid) | 400 |
| 12 | Validates bloodType enum | 400 for invalid |
| 13 | Validates maritalStatus enum | 400 for invalid |
| 14 | OWNER can assign doctorId to branch doctor | 201, correct doctorId |
| 15 | Cannot assign doctorId to non-branch doctor | 400 |
| 16 | DOCTOR cannot assign to different doctor | Defaults to self |
| 17 | Auto-extracts DOB from IC when dateOfBirth empty | DOB populated |
| 18 | Status defaults to "active" | status = "active" |
| 19 | Address fields persisted correctly | All address fields saved |
| 20 | Emergency contact fields persisted | All emergency fields saved |

**PATCH /api/patients/[patientId] — Enhanced**

| # | Test | Expected |
|---|------|----------|
| 21 | Updates new fields (icNumber, occupation, etc.) | 200, updated |
| 22 | Updates status to inactive | 200, status changed |
| 23 | Updates status to discharged | 200, status changed |
| 24 | Validates IC number on update | 400 for invalid |
| 25 | Updates address fields | 200, all address fields updated |
| 26 | Updates emergency contact fields | 200, all emergency fields updated |
| 27 | Can reassign doctor (OWNER) | 200, doctorId changed |
| 28 | Updates allergies and medicalHistory | 200, saved |

**DELETE /api/patients/[patientId] — Cascade Verification**

| # | Test | Expected |
|---|------|----------|
| 29 | Delete removes patient + visits + xrays | All cascade deleted |
| 30 | Delete removes appointments and documents | All cascade deleted |

---

## 11. Implementation Order

1. **Prisma migration** — Add new fields to Patient model
2. **Types** — Update `src/types/patient.ts` with new fields + CreatePatientData
3. **API: GET /api/patients** — Add new fields to response, add status/doctorId filters
4. **API: POST /api/patients** — Accept + validate new fields, IC→DOB extraction
5. **API: PATCH /api/patients/[patientId]** — Accept + validate new fields
6. **API: GET /api/patients/[patientId]** — Include new fields in response
7. **Tests** — Write 30 integration tests (TDD)
8. **PatientSummaryStats** — Stats bar component
9. **PatientCard** — Grid view card component
10. **PatientListView** — Main list view (replaces page.tsx inline logic)
11. **page.tsx** — Convert to server component
12. **AddPatientDialog** — Enhance with all new fields, 3-section layout
13. **EditPatientDialog** — Full edit form
14. **DeletePatientDialog** — Confirmation with cascade warning
15. **PatientDetailSheet** — Enhance with edit/delete actions, new field display
16. **PatientTable** — Add status column, doctor column, actions column
17. **Integration** — Wire everything, test end-to-end

---

## 12. Out of Scope

- Patient self-registration portal
- Bulk import (CSV upload of patients)
- Patient merge/dedup
- Patient document management (future feature)
- Treatment plan creation (future feature)
- SOAP notes editing from patient detail (existing visit system handles this)
- Patient photo/avatar upload
- Patient timeline/activity log
- Print patient summary

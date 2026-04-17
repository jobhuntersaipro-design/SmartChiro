# Doctor Management Page — Full Spec

## Status

Spec Complete — Ready for Implementation

---

## Overview

Dedicated doctor management page at `/dashboard/doctors` for **branch owners/admins**. Owners can **create doctor accounts** (with email + password), view all doctors across their branches, edit profiles, toggle active status, and remove doctors from branches.

This replaces the scattered doctor management UX (ManageDoctorsSheet in branch detail, BranchDoctorsTab) with a centralized hub. Existing components remain usable in branch context but this page is the primary management surface.

---

## 1. Schema Analysis

### Current Schema — No Changes Needed

The existing schema already supports the full doctor CRUD workflow:

```
User (auth + base profile)
  ├── DoctorProfile (1:1 optional — professional credentials)
  ├── BranchMember[] (many-to-many — links doctor to branches with role)
  ├── Patient[] (as assigned doctor)
  ├── Visit[] (as attending doctor)
  ├── Appointment[] (as scheduled doctor)
  ├── Xray[] (as uploader)
  └── Annotation[] (as creator)
```

**Why no redesign is needed:**

| Concern | Current Design | Assessment |
|---------|---------------|------------|
| Doctor identity | `User` table (email, name, password, image) | Correct — doctors ARE users |
| Professional data | `DoctorProfile` 1:1 optional | Correct — separates auth from clinical |
| Multi-branch | `BranchMember` join table with `role` | Correct — a doctor can belong to multiple branches |
| Patient assignment | `Patient.doctorId → User.id` | Correct — direct FK |
| RBAC | `BranchMember.role` (OWNER/ADMIN/DOCTOR) | Correct — role-per-branch |

**Key relationships for this feature:**
- Creating a doctor = `User` INSERT + `BranchMember` INSERT + optional `DoctorProfile` INSERT (transaction)
- Removing a doctor from branch = `BranchMember` DELETE (soft removal, user account persists)
- Deleting a doctor entirely = `User` DELETE (cascades to BranchMember, DoctorProfile, but NOT patients/visits — those have required FKs)

---

## 2. Routes

| Route | Purpose |
|-------|---------|
| `/dashboard/doctors` | Doctor list page (all doctors across owner's branches) |

No `/dashboard/doctors/[userId]` detail page — clicking a doctor opens the existing `/dashboard/settings/[userId]` page (or the profile can be edited inline via a slide-over sheet).

---

## 3. API Endpoints

### 3a. GET /api/doctors — List All Doctors

Returns all doctors across the caller's branches. Owner/Admin sees all; Doctor sees only co-workers in shared branches.

**Query params:**
- `?branchId=xxx` — filter to specific branch
- `?search=xxx` — fuzzy search name/email
- `?status=active|inactive|all` — filter by isActive (default: `all`)

**Response:**
```typescript
{
  doctors: DoctorListItem[];
  total: number;
}

interface DoctorListItem {
  id: string;              // User.id
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  isActive: boolean;       // from DoctorProfile, default true
  specialties: string[];   // from DoctorProfile
  branches: {
    id: string;
    name: string;
    role: BranchRole;
    memberId: string;      // BranchMember.id (for removal)
  }[];
  stats: {
    patientCount: number;
    visitCount: number;
    xrayCount: number;
  };
  createdAt: string;       // User.createdAt
}
```

**Auth:** Requires session. Returns doctors from branches where caller has membership.

**Implementation:**
1. Get all caller's branch memberships
2. Find all BranchMembers in those branches (excluding the caller if desired)
3. Join with User, DoctorProfile, and aggregate Patient/Visit/Xray counts
4. Apply search/filter/branch params

### 3b. POST /api/doctors — Create Doctor Account

Creates a new User with hashed password + adds them to a branch as DOCTOR. Owner/Admin only.

**Request body:**
```typescript
{
  name: string;           // required, 1-100 chars
  email: string;          // required, valid email, unique
  password: string;       // required, min 8 chars
  branchId: string;       // required, must be caller's branch
  role?: BranchRole;      // optional, default "DOCTOR" (DOCTOR or ADMIN only)
  // Optional profile fields
  phone?: string;
  licenseNumber?: string;
  specialties?: string[];
  education?: string;
  yearsExperience?: number;
}
```

**Response:**
```typescript
{ doctor: DoctorListItem; }
```

**Auth:** Caller must be OWNER or ADMIN of the specified branch.

**Implementation:**
1. Validate all fields
2. Check email uniqueness
3. Hash password with bcryptjs
4. Transaction:
   - Create User (email, name, password hash, emailVerified: now)
   - Create BranchMember (userId, branchId, role)
   - Create DoctorProfile if any profile fields provided
5. Return created doctor

**Edge case — email already exists:**
- If User with that email already exists:
  - Check if they're already in this branch → 409 "Already a member"
  - If not in branch → add BranchMember only (don't reset password)
  - Return the doctor with a `existed: true` flag so UI can show appropriate message

### 3c. DELETE /api/doctors/[userId] — Remove Doctor

Two modes:
- `?branchId=xxx` — Remove from specific branch (BranchMember DELETE)
- No branchId — Remove from ALL caller's branches

**Auth:** Caller must be OWNER/ADMIN of the branch. Cannot remove self. Cannot remove branch OWNER.

**Response:**
```typescript
{ success: true; removed: "branch" | "all"; }
```

### 3d. Existing Endpoints (No Changes)

- `GET /api/doctors/[userId]` — Doctor detail (already exists)
- `PUT /api/doctors/[userId]` — Update doctor profile (already exists)
- `PATCH /api/doctors/[userId]/status` — Toggle isActive (already exists)
- `POST /api/doctors/[userId]/photo` — Upload photo (already exists)

---

## 4. Types

### New types in `src/types/doctor.ts`:

```typescript
export interface DoctorListItem {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  isActive: boolean;
  specialties: string[];
  branches: {
    id: string;
    name: string;
    role: BranchRole;
    memberId: string;
  }[];
  stats: {
    patientCount: number;
    visitCount: number;
    xrayCount: number;
  };
  createdAt: string;
}

export interface CreateDoctorData {
  name: string;
  email: string;
  password: string;
  branchId: string;
  role?: "DOCTOR" | "ADMIN";
  phone?: string;
  licenseNumber?: string;
  specialties?: string[];
  education?: string;
  yearsExperience?: number;
}
```

---

## 5. File Structure

```
src/
├── app/dashboard/doctors/
│   └── page.tsx                              # Server component, auth gate
├── components/dashboard/doctors/
│   ├── DoctorListView.tsx                    # Main list view (client)
│   ├── DoctorCard.tsx                        # Individual doctor card
│   ├── DoctorSummaryStats.tsx                # Top-level stats bar
│   ├── CreateDoctorDialog.tsx                # Create doctor modal
│   ├── DoctorDetailSheet.tsx                 # Right slide-in detail/edit
│   └── RemoveDoctorDialog.tsx                # Confirm removal dialog
├── types/doctor.ts                           # Updated with new types
└── app/api/
    ├── doctors/route.ts                      # GET list + POST create
    └── doctors/[userId]/route.ts             # Existing GET/PUT (unchanged)
```

---

## 6. UI/UX Design (DESIGN.md Aligned)

### 6a. Page Layout — `/dashboard/doctors`

Full-width content area inside DashboardShell (`px-8 py-6`).

#### Header Row
```
┌─────────────────────────────────────────────────────────────────┐
│  Doctors                                         [+ Add Doctor] │
│  Manage your clinic's doctors and staff                         │
└─────────────────────────────────────────────────────────────────┘
```
- Title: `text-[22px] font-light text-[#061b31] tracking-[-0.22px]` (Sub-heading, weight 300)
- Subtitle: `text-[14px] text-[#64748d]`
- Button: Primary purple `bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] h-9 px-4 text-[14px] font-medium`
- Only shown for OWNER/ADMIN role

#### Summary Stats Bar
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  5           │  │  3           │  │  2           │  │  127         │
│  Total       │  │  Active      │  │  Inactive    │  │  Total       │
│  Doctors     │  │  Doctors     │  │  Doctors     │  │  Patients    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```
- Cards: `bg-white rounded-[6px] border border-[#e5edf5] px-5 py-4`
- Shadow: `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Number: `text-[26px] font-light text-[#061b31] tracking-[-0.26px]` (Sub-heading Large)
- Label: `text-[13px] text-[#64748d]`

#### Filters Row
```
┌────────────────────────────┐  ┌──────────────┐  ┌────┐ ┌────┐
│  🔍 Search doctors...      │  │ All Branches ▾│  │ ≡  │ │ ⊞ │
└────────────────────────────┘  └──────────────┘  └────┘ └────┘
```
- Search: `h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] pl-9 text-[14px]` with Search icon
- Branch filter: `<select>` or custom dropdown, same input styling
- View toggle: Grid (default) / List icons, `rounded-[4px] h-9 w-9`

#### Doctor Cards (Grid View — 3 columns on desktop, 2 tablet, 1 mobile)

```
┌─────────────────────────────────────────┐
│  ┌──┐  Dr. Sarah Chen                  │
│  │🟢│  sarah@clinic.com         Active  │
│  └──┘  Sports Chiro, Pediatric         │
│                                         │
│  ┌───────┐ ┌───────┐ ┌───────┐         │
│  │  24   │ │  156  │ │  42   │         │
│  │Patient│ │Visits │ │X-rays │         │
│  └───────┘ └───────┘ └───────┘         │
│                                         │
│  📍 Main Clinic, KL Branch    [···]    │
│  Joined Mar 2026                        │
└─────────────────────────────────────────┘
```

**Card styling:**
- Container: `bg-white rounded-[6px] border border-[#e5edf5] p-5 transition-all duration-200 hover:border-[#c1c9d2] hover:translate-y-[-1px]`
- Shadow: Standard (Level 2) `rgba(23,23,23,0.08) 0px 15px 35px`
- Hover shadow: Elevated (Level 3)
- Avatar: `h-11 w-11 rounded-full` with `bg-[#ededfc] text-[#533afd]` fallback initials
- Name: `text-[16px] font-medium text-[#061b31]` — clickable, links to settings page
- Email: `text-[13px] text-[#64748d]`
- Specialties: `text-[13px] text-[#64748d]` comma-separated, truncate with ellipsis
- Status badge:
  - Active: `bg-[rgba(21,190,83,0.2)] text-[#108c3d] border border-[rgba(21,190,83,0.4)] rounded-[4px] px-[6px] py-[1px] text-[10px] font-light`
  - Inactive: `bg-[#F0F3F7] text-[#64748d] rounded-[4px] px-[6px] py-[1px] text-[10px] font-light`
- Stat mini cards: `bg-[#F6F9FC] rounded-[4px] px-3 py-2 text-center`
  - Number: `text-[16px] font-medium text-[#061b31]` with `font-feature-settings: "tnum"`
  - Label: `text-[11px] text-[#64748d]`
- Branch pills: `text-[12px] text-[#533afd] bg-[#ededfc] rounded-full px-2 py-0.5`
- Joined: `text-[12px] text-[#c1c9d2]`
- More menu (···): Dropdown with Edit, Toggle Status, Remove

#### Doctor Table (List View)

```
┌────────┬──────────────────┬──────────┬──────────┬────────┬────────┬──────┐
│        │ Name / Email     │ Branch   │ Status   │Patients│ Joined │      │
├────────┼──────────────────┼──────────┼──────────┼────────┼────────┼──────┤
│ [SC]   │ Dr. Sarah Chen   │ Main     │ 🟢Active │   24   │ Mar 26 │ ···  │
│        │ sarah@clinic.com │ Clinic   │          │        │        │      │
├────────┼──────────────────┼──────────┼──────────┼────────┼────────┼──────┤
│ [AK]   │ Dr. Ahmad Khan   │ KL       │ ⚫Inact. │   12   │ Apr 26 │ ···  │
│        │ ahmad@clinic.com │ Branch   │          │        │        │      │
└────────┴──────────────────┴──────────┴──────────┴────────┴────────┴──────┘
```

- Table: `bg-white rounded-[6px] border border-[#e5edf5]`
- Rows: No zebra stripes, hover `bg-[#F0F3F7]`, thin `border-b border-[#e5edf5]` separators
- Header: `text-[13px] font-medium text-[#273951] uppercase tracking-wide`
- Cells: `text-[14px] text-[#061b31]`

#### Empty State (No Doctors)

```
┌─────────────────────────────────────────┐
│                                         │
│            🩺                           │
│                                         │
│     No doctors yet                      │
│     Add your first doctor to get        │
│     started managing your clinic.       │
│                                         │
│         [+ Add Doctor]                  │
│                                         │
└─────────────────────────────────────────┘
```

### 6b. Create Doctor Dialog

Modal dialog (not sheet) — following pattern from CreateBranchDialog.

**Two sections:**

**Section 1 — Account (Required)**
```
┌──────────────────────────────────────────────────┐
│  Add New Doctor                              [X] │
│─────────────────────────────────────────────────│
│                                                  │
│  Account                                         │
│  ┌─────────────────────────────────────────────┐ │
│  │ Full Name *                                 │ │
│  │ [Dr. Sarah Chen                           ] │ │
│  └─────────────────────────────────────────────┘ │
│  ┌───────────────────┐  ┌────────────────────┐   │
│  │ Email *           │  │ Phone              │   │
│  │ [sarah@clinic.com]│  │ [+60 12-345 6789 ] │   │
│  └───────────────────┘  └────────────────────┘   │
│  ┌───────────────────┐  ┌────────────────────┐   │
│  │ Password *        │  │ Confirm Password * │   │
│  │ [••••••••••    👁]│  │ [••••••••••     👁]│   │
│  └───────────────────┘  └────────────────────┘   │
│  ┌───────────────────┐  ┌────────────────────┐   │
│  │ Branch *          │  │ Role               │   │
│  │ [Main Clinic    ▾]│  │ [Doctor          ▾]│   │
│  └───────────────────┘  └────────────────────┘   │
│                                                  │
│  Professional (Optional)                         │
│  ┌───────────────────┐  ┌────────────────────┐   │
│  │ License Number    │  │ Years Experience   │   │
│  │ [DC-12345       ] │  │ [8               ] │   │
│  └───────────────────┘  └────────────────────┘   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Specialties (comma separated)               │ │
│  │ [Sports Chiro, Pediatric                  ] │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ Education                                   │ │
│  │ [Doctor of Chiropractic, Palmer College   ] │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│           [Cancel]  [Create Doctor]              │
│──────────────────────────────────────────────────│
│  ⓘ The doctor will use these credentials to     │
│    log in. You can update their profile later.   │
└──────────────────────────────────────────────────┘
```

**Dialog styling:**
- Container: `bg-white rounded-[8px] max-w-[560px] w-full`
- Shadow: Deep (Level 4)
- Title: `text-[18px] font-light text-[#061b31]`
- Section headers: `text-[14px] font-medium text-[#273951] mb-3 mt-5`
- Inputs: `h-9 rounded-[4px] border-[#e5edf5] bg-white text-[14px] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]`
- Labels: `text-[13px] text-[#273951] mb-1`
- Required indicator: `text-[#df1b41]` asterisk
- Footer note: `text-[13px] text-[#64748d]` with info icon
- Cancel: Ghost button
- Create: Primary purple button, disabled until required fields valid

**Validation:**
- Name: required, 1-100 chars
- Email: required, valid format, unique check on blur (debounced)
- Password: required, min 8 chars
- Confirm Password: must match
- Branch: required, populated from caller's branches (OWNER/ADMIN branches only)
- Role: DOCTOR (default) or ADMIN

### 6c. Doctor Detail Sheet (Right Slide-In)

Opens when clicking a doctor card or "View" action. Shows full profile with inline editing.

```
┌────────────────────────────────────────────────┐
│  Dr. Sarah Chen                           [X]  │
│  sarah@clinic.com                              │
│──────────────────────────────────────────────── │
│                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐             │
│  │  24    │ │  156   │ │  42    │             │
│  │Patients│ │ Visits │ │ X-rays │             │
│  └────────┘ └────────┘ └────────┘             │
│                                                │
│  Status   [🟢 Active ▾]                       │
│                                                │
│  ──── Professional ────                        │
│  License     DC-12345                          │
│  Education   DC, Palmer College                │
│  Experience  8 years                           │
│  Specialties Sports Chiro, Pediatric           │
│  Languages   English, Malay                    │
│                                                │
│  ──── Branches ────                            │
│  Main Clinic        DOCTOR                     │
│  KL Branch          ADMIN                      │
│                                                │
│  ──── Schedule ────                            │
│  Mon  09:00 - 18:00                            │
│  Tue  09:00 - 18:00                            │
│  Wed  09:00 - 13:00                            │
│  ...                                           │
│                                                │
│  [Edit Profile]  [Remove from Branch]          │
└────────────────────────────────────────────────┘
```

**Sheet styling:**
- Width: `w-[480px] sm:max-w-[480px]`
- Border: `border-l border-[#e5edf5]`
- Header: Name `text-[18px] font-light text-[#061b31]`, email `text-[14px] text-[#64748d]`
- Section headers: `text-[13px] font-medium text-[#273951] uppercase tracking-wide`
- Property labels: `text-[13px] text-[#64748d]` left column
- Property values: `text-[14px] text-[#061b31]` right column
- Edit Profile: Links to `/dashboard/settings/[userId]`
- Remove: Danger ghost button `text-[#df1b41] hover:bg-[#FEF2F4]`

### 6d. Remove Doctor Dialog

Confirmation dialog before removing a doctor from a branch.

```
┌────────────────────────────────────────────┐
│  Remove Doctor                        [X]  │
│────────────────────────────────────────────│
│                                            │
│  Are you sure you want to remove           │
│  Dr. Sarah Chen from Main Clinic?          │
│                                            │
│  This will unassign them from this branch  │
│  but won't delete their account.           │
│                                            │
│  ⚠ 24 patients are currently assigned     │
│  to this doctor and will need to be        │
│  reassigned.                               │
│                                            │
│         [Cancel]  [Remove Doctor]          │
└────────────────────────────────────────────┘
```

- Warning: `text-[13px] text-[#9b6829] bg-[#FFF8E1] rounded-[4px] px-3 py-2` (only shown if doctor has patients)
- Remove button: `bg-[#df1b41] hover:bg-[#c4183c] text-white rounded-[4px]`

---

## 7. Component Behavior

### DoctorListView.tsx (Main)

```typescript
// State
const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");
const [branchFilter, setBranchFilter] = useState<string>("all");
const [statusFilter, setStatusFilter] = useState<string>("all");
const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
const [createOpen, setCreateOpen] = useState(false);
const [detailDoctor, setDetailDoctor] = useState<DoctorListItem | null>(null);
const [removeDoctor, setRemoveDoctor] = useState<{doctor: DoctorListItem; branchId: string; branchName: string} | null>(null);

// Fetch
useEffect → GET /api/doctors?search=&branchId=&status=

// Filter (client-side for instant UX, server-side search)
const filtered = useMemo(() => filter by search + branchFilter + statusFilter)

// Stats
const stats = useMemo(() => ({
  total: doctors.length,
  active: doctors.filter(d => d.isActive).length,
  inactive: doctors.filter(d => !d.isActive).length,
  totalPatients: doctors.reduce((sum, d) => sum + d.stats.patientCount, 0),
}))
```

### Role-Based Visibility

| Element | OWNER/ADMIN | DOCTOR |
|---------|------------|--------|
| "+ Add Doctor" button | Visible | Hidden |
| Status toggle | Enabled | Disabled |
| Remove button | Visible | Hidden |
| Edit profile link | Visible | View only |
| Doctor list | All branch doctors | Shared-branch co-workers |

### Doctor View (Non-Owner)

When the signed-in user is a DOCTOR (not OWNER/ADMIN), the page shows a read-only directory of co-workers. No create/edit/remove actions. The page title changes to "Team" instead of "Doctors".

---

## 8. Interactions & Animations

| Interaction | Effect |
|-------------|--------|
| Card hover | `translate-y-[-1px]`, shadow Level 2 → Level 3, border `#e5edf5` → `#c1c9d2` |
| Card click | Opens DoctorDetailSheet |
| Status toggle | Optimistic update, PATCH `/api/doctors/[userId]/status` |
| Search input | Debounced 300ms, filters client-side |
| Create success | Card slides in at top with fade-in animation, toast "Doctor created" |
| Remove success | Card fades out, toast "Doctor removed from [branch]" |
| Avatar hover | Scale 1.05 transition |

---

## 9. TDD Test Plan

### API Tests — `src/app/api/doctors/__tests__/doctors-list.test.ts`

**GET /api/doctors**

| # | Test | Expected |
|---|------|----------|
| 1 | Unauthenticated request | 401 |
| 2 | Returns doctors from caller's branches | 200, array of DoctorListItem |
| 3 | Filters by branchId | Only doctors in that branch |
| 4 | Filters by search (name) | Matching doctors |
| 5 | Filters by search (email) | Matching doctors |
| 6 | Filters by status=active | Only isActive=true |
| 7 | Filters by status=inactive | Only isActive=false |
| 8 | Includes stats (patientCount, visitCount, xrayCount) | Correct counts |
| 9 | Includes branch memberships with roles | Correct structure |
| 10 | Doctor role: only sees co-workers in shared branches | Scoped results |

**POST /api/doctors**

| # | Test | Expected |
|---|------|----------|
| 11 | Unauthenticated | 401 |
| 12 | Doctor role (not owner/admin) | 403 |
| 13 | Valid create with required fields | 201, new doctor |
| 14 | Missing name | 400 |
| 15 | Missing email | 400 |
| 16 | Invalid email format | 400 |
| 17 | Missing password | 400 |
| 18 | Password too short (<8) | 400 |
| 19 | Missing branchId | 400 |
| 20 | BranchId not caller's branch | 403 |
| 21 | Duplicate email — user exists, not in branch | 200, adds to branch |
| 22 | Duplicate email — user already in branch | 409 |
| 23 | Creates User + BranchMember + DoctorProfile in transaction | DB state correct |
| 24 | Password is hashed (not plaintext) | bcrypt hash stored |
| 25 | emailVerified is set (owner-created accounts skip verification) | Not null |
| 26 | Role defaults to DOCTOR | BranchMember.role = DOCTOR |
| 27 | Role can be set to ADMIN | BranchMember.role = ADMIN |
| 28 | Cannot set role to OWNER | 400 |
| 29 | Optional profile fields (license, specialties, education) saved | DoctorProfile created |

**DELETE /api/doctors/[userId]**

| # | Test | Expected |
|---|------|----------|
| 30 | Unauthenticated | 401 |
| 31 | Not owner/admin | 403 |
| 32 | Remove from specific branch | BranchMember deleted |
| 33 | Cannot remove self | 403 |
| 34 | Cannot remove branch owner | 403 |
| 35 | User not found | 404 |
| 36 | User not in specified branch | 404 |

---

## 10. Implementation Order

1. **Types** — Add `DoctorListItem` and `CreateDoctorData` to `src/types/doctor.ts`
2. **API: GET /api/doctors** — List endpoint with filters
3. **API: POST /api/doctors** — Create endpoint with account creation
4. **API: DELETE /api/doctors/[userId]** — Remove endpoint (add to existing route file)
5. **Page route** — `src/app/dashboard/doctors/page.tsx` (server component, auth gate)
6. **DoctorSummaryStats** — Stats bar component
7. **DoctorCard** — Individual card component
8. **DoctorListView** — Main list view with search/filter/grid/list
9. **CreateDoctorDialog** — Create form with validation
10. **DoctorDetailSheet** — Right slide-in detail view
11. **RemoveDoctorDialog** — Confirmation dialog
12. **Integration** — Wire everything together, test end-to-end

---

## 11. Out of Scope

- Doctor self-registration (doctors are created by owners)
- Bulk import (CSV upload of doctors)
- Doctor-to-doctor messaging
- Reassign patients when removing a doctor (future: show warning + reassignment UI)
- Doctor availability calendar (separate feature)
- Salary/payment tracking

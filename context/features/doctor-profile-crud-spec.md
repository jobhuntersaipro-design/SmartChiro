# Doctor Profile CRUD

## Status: Not Started

## Overview

Extend the User model with a dedicated **DoctorProfile** relation to store professional, clinic-specific, and optional fields for doctors. Build full CRUD API routes, a doctor detail/edit page accessible from the dashboard, and integration tests against Neon PostgreSQL.

Currently, doctors are just User records linked to branches via BranchMember. There is no place to store license numbers, specialties, fees, bios, or working schedules — all of which clinic owners need to manage their staff.

---

## Current State

| What exists | Where |
|---|---|
| User model | `prisma/schema.prisma` — has name, email, phone, image only |
| BranchMember model | Links User to Branch with role (OWNER/ADMIN/DOCTOR) |
| Member CRUD API | `src/app/api/branches/[branchId]/members/` — add/remove/role-change |
| ManageDoctorsSheet | `src/components/dashboard/owner/ManageDoctorsSheet.tsx` — lists members, add by email, change role, remove |
| Doctor stats | `DoctorStatCards` — patient count, appointments, xrays, annotations |

**What's missing**: No way to store or manage professional details (license, specialties, experience, education), clinic-specific config (schedule, room, fee), or optional info (bio, languages, insurance).

---

## Data Model

### New Model: `DoctorProfile`

Add a **one-to-one** relation from User to DoctorProfile. Not every User needs a profile — only those who are doctors in at least one branch.

```prisma
model DoctorProfile {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // ─── Professional ───
  licenseNumber   String?   // NPI or local license
  specialties     String[]  // ["sports", "pediatric", "rehabilitation"]
  yearsExperience Int?
  education       String?   // free-text: degrees, certifications

  // ─── Clinic-Specific ───
  workingSchedule  Json?    // { mon: { start: "09:00", end: "17:00" }, tue: ... }
  treatmentRoom    String?  // e.g. "Room 3"
  consultationFee  Decimal? // per session, in clinic currency

  // ─── Optional ───
  bio              String?  // patient-facing bio
  languages        String[] // ["English", "Malay", "Mandarin"]
  insurancePlans   String[] // ["AIA", "Prudential", "Great Eastern"]

  // ─── System ───
  isActive Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### User Model Changes

Add the relation to User:

```prisma
model User {
  // ... existing fields ...

  doctorProfile DoctorProfile?

  // ... existing relations ...
}
```

### Notes on Design Decisions

- **`specialties`, `languages`, `insurancePlans` as `String[]`** — PostgreSQL native arrays. Simple, queryable, no join tables needed for small lists.
- **`workingSchedule` as `Json`** — Flexible day-by-day schedule. Shape: `{ [day: string]: { start: string, end: string } | null }`. Null means day off.
- **`consultationFee` as `Decimal`** — Matches Invoice.amount type. Currency comes from the branch/clinic settings.
- **`isActive`** — Soft status toggle. Inactive doctors don't appear in assignment dropdowns but retain data.
- **Photo** — Already handled by `User.image` (populated from Google OAuth or manual upload). No new field needed.
- **Email, phone, name** — Already on User model. No duplication.
- **Role/permissions** — Already handled by `BranchMember.role`. No duplication.
- **Login credentials / invite email** — Out of scope for this spec. Existing registration + add-member flow covers this.
- **Assigned clinic(s)** — Already handled by `BranchMember` (one record per branch). The profile is user-global, not branch-specific.

---

## API Routes

### `GET /api/doctors/[userId]` — Get doctor profile

**Auth**: Must be authenticated. Must share at least one branch with the target doctor (or be the doctor themselves).

**Response** `200`:
```ts
{
  doctor: {
    id: string           // User.id
    name: string | null
    email: string
    phone: string | null
    image: string | null
    profile: {
      licenseNumber: string | null
      specialties: string[]
      yearsExperience: number | null
      education: string | null
      workingSchedule: Record<string, { start: string; end: string } | null> | null
      treatmentRoom: string | null
      consultationFee: number | null
      bio: string | null
      languages: string[]
      insurancePlans: string[]
      isActive: boolean
    } | null             // null if profile hasn't been created yet
    branches: {
      id: string
      name: string
      role: BranchRole
    }[]
    stats: {
      patientCount: number
      totalVisits: number
      totalXrays: number
    }
  }
}
```

**Errors**: `401` unauthenticated, `403` no shared branch, `404` user not found or not a doctor in any branch.

---

### `PUT /api/doctors/[userId]` — Create or update doctor profile

**Auth**: Must be the doctor themselves, OR an OWNER/ADMIN of a branch the doctor belongs to.

**Request body**:
```ts
{
  // User fields (always updatable by self, or by owner/admin)
  name?: string
  phone?: string

  // Profile fields
  licenseNumber?: string | null
  specialties?: string[]
  yearsExperience?: number | null
  education?: string | null
  workingSchedule?: Record<string, { start: string; end: string } | null> | null
  treatmentRoom?: string | null
  consultationFee?: number | null
  bio?: string | null
  languages?: string[]
  insurancePlans?: string[]
  isActive?: boolean       // only OWNER/ADMIN can change
}
```

**Validation (Zod)**:
- `name`: string, min 1, max 100, trimmed
- `phone`: string, max 20, optional
- `licenseNumber`: string, max 50, optional
- `specialties`: array of strings, max 20 items, each max 50 chars
- `yearsExperience`: integer, 0–70
- `education`: string, max 1000
- `workingSchedule`: object with day keys (mon–sun), values are `{ start: HH:MM, end: HH:MM }` or null
- `consultationFee`: number, >= 0, max 99999.99
- `bio`: string, max 2000
- `languages`: array of strings, max 20 items, each max 50 chars
- `insurancePlans`: array of strings, max 50 items, each max 100 chars
- `isActive`: boolean — rejected if caller is not OWNER/ADMIN (return 403)

**Behavior**:
- If `DoctorProfile` doesn't exist for this user, create it (upsert).
- User fields (`name`, `phone`) update the User record.
- Profile fields update the DoctorProfile record.
- Single transaction for both updates.

**Response** `200`:
```ts
{
  doctor: { /* same shape as GET response */ }
}
```

**Errors**: `400` validation, `401` unauthenticated, `403` not authorized, `404` user not found.

---

### `PATCH /api/doctors/[userId]/status` — Toggle active/inactive

**Auth**: OWNER or ADMIN of a branch the doctor belongs to. Doctors cannot toggle their own status.

**Request body**:
```ts
{ isActive: boolean }
```

**Behavior**:
- Updates `DoctorProfile.isActive`.
- If profile doesn't exist, creates one with `isActive` set.

**Response** `200`:
```ts
{ isActive: boolean }
```

**Errors**: `401`, `403` (not owner/admin, or trying to toggle self), `404`.

---

### `POST /api/doctors/[userId]/photo` — Upload doctor photo

**Auth**: Must be the doctor themselves, or OWNER/ADMIN.

**Request**: `multipart/form-data` with `photo` field.
- Max size: 5MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`

**Behavior**:
- Upload to Cloudflare R2 at path `doctors/{userId}/photo.{ext}`
- Update `User.image` with the R2 URL
- Delete previous photo from R2 if it was a custom upload (not a Google OAuth URL)

**Response** `200`:
```ts
{ imageUrl: string }
```

**Errors**: `400` invalid file, `401`, `403`, `413` too large.

---

## UI — Doctor Profile Page

### Route: `/dashboard/doctors/[userId]`

A dedicated page for viewing and editing a doctor's profile. Accessible from:
- ManageDoctorsSheet → click on a doctor's name
- Dashboard → "View Profile" in doctor cards
- Sidebar → "Profile" menu item (for the logged-in user viewing their own profile)

### Layout

Two-column layout on desktop, single column on mobile.

**Left column (1/3 width)**:
- Avatar (large, 80px, with camera icon overlay for upload on hover)
- Full name (editable inline or in form)
- Role badge (Owner/Admin/Doctor)
- Active/Inactive status toggle (owner/admin only)
- Branch membership list (pills with branch names)

**Right column (2/3 width)**:
Tabbed sections:

**Tab 1 — Professional Info**:
| Field | Input type |
|---|---|
| License/NPI Number | Text input |
| Specialties | Multi-select tag input (free-text + suggestions) |
| Years of Experience | Number input |
| Education & Certifications | Textarea |

**Tab 2 — Schedule & Clinic**:
| Field | Input type |
|---|---|
| Working Schedule | Day-by-day grid (Mon–Sun, start/end time pickers, toggle for day off) |
| Treatment Room | Text input |
| Consultation Fee | Number input with MYR prefix |

**Tab 3 — Additional Info**:
| Field | Input type |
|---|---|
| Bio | Textarea (with character count, max 2000) |
| Languages Spoken | Multi-select tag input |
| Insurance Plans | Multi-select tag input |

**Tab 4 — Contact**:
| Field | Input type |
|---|---|
| Email | Text input (read-only, from User.email) |
| Phone | Text input |

### Interaction Details

- **Save button**: Fixed at bottom of right column. Disabled when no changes. Shows loading spinner during save. Toast on success/error.
- **Cancel button**: Resets form to last saved state.
- **Photo upload**: Click avatar → file picker → preview → save. Show crop dialog if image is not square (nice-to-have, can skip for MVP).
- **Specialties suggestions**: Pre-populated dropdown with common chiropractic specialties: Sports, Pediatric, Rehabilitation, Geriatric, Prenatal, Neurology, Orthopedic, Wellness, Nutrition, Acupuncture. User can type custom values.
- **Schedule grid**: Visual table with days as rows. Each row has: day name, "Active" toggle, start time, end time. Inactive days are grayed out.
- **Active/Inactive toggle**: Only visible to OWNER/ADMIN. Shows confirmation dialog: "Deactivating Dr. X will hide them from patient assignment. Continue?"

### Permissions in UI

| Action | Self | Owner/Admin of branch | Other doctor |
|---|---|---|---|
| View profile | Yes | Yes | Yes (read-only) |
| Edit own info | Yes | — | — |
| Edit another doctor's info | — | Yes | No |
| Toggle active/inactive | No | Yes | No |
| Upload photo | Yes | Yes | No |
| Change role | No | Owner only | No |

---

## Migration

```
prisma migrate dev --name add-doctor-profile
```

New table: `DoctorProfile` with columns as defined above.

No data backfill needed — profiles start empty and get populated as users fill them in.

---

## Types

### `src/types/doctor.ts`

```ts
import type { BranchRole } from "@prisma/client";

export interface DoctorProfile {
  licenseNumber: string | null;
  specialties: string[];
  yearsExperience: number | null;
  education: string | null;
  workingSchedule: WorkingSchedule | null;
  treatmentRoom: string | null;
  consultationFee: number | null;
  bio: string | null;
  languages: string[];
  insurancePlans: string[];
  isActive: boolean;
}

export interface WorkingSchedule {
  mon?: DaySchedule | null;
  tue?: DaySchedule | null;
  wed?: DaySchedule | null;
  thu?: DaySchedule | null;
  fri?: DaySchedule | null;
  sat?: DaySchedule | null;
  sun?: DaySchedule | null;
}

export interface DaySchedule {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface DoctorDetail {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  profile: DoctorProfile | null;
  branches: {
    id: string;
    name: string;
    role: BranchRole;
  }[];
  stats: {
    patientCount: number;
    totalVisits: number;
    totalXrays: number;
  };
}

export interface UpdateDoctorData {
  name?: string;
  phone?: string;
  licenseNumber?: string | null;
  specialties?: string[];
  yearsExperience?: number | null;
  education?: string | null;
  workingSchedule?: WorkingSchedule | null;
  treatmentRoom?: string | null;
  consultationFee?: number | null;
  bio?: string | null;
  languages?: string[];
  insurancePlans?: string[];
  isActive?: boolean;
}
```

---

## Tests

### File: `src/app/api/doctors/__tests__/doctors.test.ts`

Integration tests against Neon PostgreSQL (same pattern as `branches.test.ts`).

#### GET /api/doctors/[userId]

1. **Returns doctor with profile** — create user + profile, verify all fields returned
2. **Returns doctor without profile** — profile is null, user fields still present
3. **Returns branch memberships** — user in 2 branches, both listed
4. **Returns stats** — patient count, visit count, xray count
5. **403 if no shared branch** — caller and target in different branches
6. **404 if user not found** — invalid userId
7. **404 if user is not a doctor** — user exists but has no branch memberships
8. **401 if unauthenticated**

#### PUT /api/doctors/[userId]

9. **Creates profile if none exists** — upsert behavior
10. **Updates existing profile** — all fields updated
11. **Updates user fields** — name, phone updated on User record
12. **Partial update** — only send some fields, rest unchanged
13. **Validates specialties array** — rejects non-array, too many items
14. **Validates working schedule** — rejects invalid day keys, bad time format
15. **Validates consultation fee** — rejects negative, too large
16. **Validates bio length** — rejects > 2000 chars
17. **403 if not self and not owner/admin** — another doctor can't edit
18. **Only owner/admin can set isActive** — doctor setting own isActive returns 403
19. **401 if unauthenticated**

#### PATCH /api/doctors/[userId]/status

20. **Toggles active to inactive** — isActive false
21. **Toggles inactive to active** — isActive true
22. **Creates profile if none exists** — with isActive set
23. **403 if not owner/admin** — doctor can't toggle self
24. **404 if user not found**

#### POST /api/doctors/[userId]/photo

25. **Uploads photo and updates User.image** — verify URL format
26. **Rejects oversized file** — > 5MB
27. **Rejects invalid mime type** — e.g. application/pdf
28. **403 if not self and not owner/admin**

---

## File Changes Summary

| File | Action |
|---|---|
| `prisma/schema.prisma` | Add DoctorProfile model, add relation to User |
| `src/types/doctor.ts` | New — types for doctor profile |
| `src/app/api/doctors/[userId]/route.ts` | New — GET, PUT |
| `src/app/api/doctors/[userId]/status/route.ts` | New — PATCH |
| `src/app/api/doctors/[userId]/photo/route.ts` | New — POST |
| `src/app/dashboard/doctors/[userId]/page.tsx` | New — server component, fetch session |
| `src/components/dashboard/doctor/DoctorProfileView.tsx` | New — main profile page component |
| `src/components/dashboard/doctor/ScheduleGrid.tsx` | New — working schedule editor |
| `src/components/dashboard/doctor/TagInput.tsx` | New — multi-select tag input for specialties/languages/insurance |
| `src/components/dashboard/owner/ManageDoctorsSheet.tsx` | Edit — doctor names become links to profile page |
| `src/components/dashboard/Sidebar.tsx` | Edit — Profile menu item links to `/dashboard/doctors/{userId}` |
| `src/app/api/doctors/__tests__/doctors.test.ts` | New — 28 integration tests |

---

## Out of Scope

- Invite email flow (existing registration covers user creation)
- Doctor availability calendar (future — appointments feature)
- Treatment room management CRUD (just a text field for now)
- Insurance plan verification/lookup
- Photo cropping UI (just upload and save)
- Multi-currency consultation fees (uses branch currency)

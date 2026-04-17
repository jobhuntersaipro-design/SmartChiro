# Settings Page — Doctor Profile CRUD

## Overview

Expand the existing Settings page (`/dashboard/settings/[userId]`) from a basic account/security page into a comprehensive tabbed profile management page. The page becomes the single source of truth for a doctor's identity, credentials, clinic info, and account security.

The existing Account + Security + Connected Accounts sections are preserved and reorganized into a tabbed layout alongside new Professional and Clinic sections.

---

## Current State

### What Exists

| Layer | What's Built |
|-------|-------------|
| **Route** | `/dashboard/settings/[userId]` — server component, self-only access |
| **UI** | `SettingsView.tsx` (598 lines) — Account (name, phone, avatar), Security (password), Connected Accounts |
| **API** | `GET/PUT /api/doctors/[userId]` — full profile CRUD with RBAC |
| **API** | `POST /api/doctors/[userId]/photo` — R2 photo upload |
| **API** | `PATCH /api/doctors/[userId]/status` — active toggle (owner/admin only) |
| **API** | `PUT /api/settings/password` — password change/set |
| **Schema** | `DoctorProfile` model — licenseNumber, specialties, yearsExperience, education, workingSchedule, treatmentRoom, consultationFee, bio, languages, insurancePlans, isActive |
| **Types** | `DoctorDetail`, `DoctorProfile`, `WorkingSchedule`, `UpdateDoctorData` in `src/types/doctor.ts` |
| **Sidebar** | Settings link in profile dropdown → `/dashboard/settings/{userId}` |

### What's Missing

- **Schema fields**: `title` (Dr., D.C., etc.), `certifications` (string array)
- **UI**: No professional profile editing in settings — only name, phone, avatar
- **Stats**: Appointments this week/month not computed
- **Tabs**: Settings page is a flat scroll, no tab navigation

---

## Schema Changes

### DoctorProfile Model — Add 2 Fields

```prisma
model DoctorProfile {
  // ... existing fields ...

  // NEW: Professional title (e.g., "Dr.", "D.C.", "Ph.D.")
  title          String?

  // NEW: Professional certifications (e.g., ["DACBR", "CCSP", "RN"])
  certifications String[]
}
```

**Migration**: `npx prisma migrate dev --name add_doctor_title_certifications`

---

## API Changes

### 1. `PUT /api/doctors/[userId]` — Add Validation for New Fields

Add validation for the two new fields:

```
title: string | null, max 20 characters
certifications: string[], max 20 items, each max 100 characters
```

Add these to the `profileFields` array and the `profileData` builder.

### 2. `GET /api/doctors/[userId]` — Extend Stats

Add appointment stats to the response:

```typescript
stats: {
  patientCount: number;
  totalVisits: number;
  totalXrays: number;
  appointmentsThisWeek: number;  // NEW
  appointmentsThisMonth: number; // NEW
}
```

Compute with:
```typescript
const now = new Date();
const startOfWeek = /* Monday of current week */;
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

const [appointmentsThisWeek, appointmentsThisMonth] = await Promise.all([
  prisma.appointment.count({
    where: { doctorId: userId, dateTime: { gte: startOfWeek, lt: /* end of week */ } }
  }),
  prisma.appointment.count({
    where: { doctorId: userId, dateTime: { gte: startOfMonth, lt: /* end of month */ } }
  }),
]);
```

### 3. Types — Update `DoctorProfile` and `DoctorDetail`

```typescript
// In src/types/doctor.ts
export interface DoctorProfile {
  // ... existing fields ...
  title: string | null;          // NEW
  certifications: string[];      // NEW
}

export interface DoctorDetail {
  // ... existing fields ...
  stats: {
    patientCount: number;
    totalVisits: number;
    totalXrays: number;
    appointmentsThisWeek: number;  // NEW
    appointmentsThisMonth: number; // NEW
  };
}

export interface UpdateDoctorData {
  // ... existing fields ...
  title?: string | null;          // NEW
  certifications?: string[];      // NEW
}
```

---

## UI Architecture

### Page Route

**`/dashboard/settings/[userId]/page.tsx`** (existing, modify)

- Fetch full `DoctorDetail` via the existing doctor API (or direct Prisma call for SSR)
- Pass combined user + profile data to the new `SettingsView`

### Component: `SettingsView.tsx` (rewrite)

Replace the flat layout with a **tabbed layout** using 4 tabs:

```
[ Profile ]  [ Professional ]  [ Clinic ]  [ Security ]
```

Tab navigation: horizontal pills at the top, below the page header. Active tab uses `bg-[#ededfc] text-[#533afd]`, inactive uses `text-[#64748d] hover:text-[#061b31] hover:bg-[#f6f9fc]`. Tabs are `rounded-[4px]`, 6px vertical padding, 12px horizontal.

---

## Tab 1: Profile

### Header Card

A prominent card at the top with the doctor's identity:

```
+---------------------------------------------------------------+
|  [Avatar]   Dr. Ahmad Razif bin Mohd Noor                     |
|  (camera    Chiropractor                                       |
|   overlay)  [Gonstead] [Sports Rehab] [Pediatric]   * Active  |
|             ahmad@smartchiro.org  |  +60 12 345 6789          |
+---------------------------------------------------------------+
```

**Layout**: Horizontal — avatar on left (80x80, with camera hover overlay for upload), text block on right.

**Elements**:
- **Avatar**: 80x80 rounded-full, camera icon overlay on hover (existing upload logic)
- **Full Name**: `text-[23px] font-light text-[#061b31]` — editable inline (pencil icon on hover)
- **Title**: `text-[14px] text-[#64748d]` below name — e.g., "Chiropractor", "Doctor of Chiropractic"
- **Specialties**: Row of pill badges — `rounded-full bg-[#ededfc] text-[#533afd] text-[12px]`
- **Status**: Badge — Active = `bg-[#ecfdf5] text-[#059669]`, Inactive = `bg-[#fef2f2] text-[#df1b41]`
- **Contact line**: Email + phone separated by `|`, `text-[14px] text-[#64748d]`

### Stats Row

Below the header card, a row of 4 stat cards:

| Stat | Source |
|------|--------|
| Total Patients | `stats.patientCount` |
| Total Visits | `stats.totalVisits` |
| Appointments This Week | `stats.appointmentsThisWeek` |
| Appointments This Month | `stats.appointmentsThisMonth` |

**Card style**: White bg, `border border-[#e5edf5]`, `rounded-[6px]`, `shadow-card`. Number in `text-[23px] font-light text-[#061b31]`, label in `text-[13px] text-[#64748d]`.

### Contact Section

A card with editable fields:

| Field | Type | Notes |
|-------|------|-------|
| Email | Input (disabled) | Cannot be changed |
| Phone Number | Input | Max 20 chars, placeholder "+60 12 345 6789" |

### Bio Section

A card with a textarea:

| Field | Type | Notes |
|-------|------|-------|
| Bio | Textarea | Max 2000 chars, 4 rows, placeholder "Write a short bio..." |

**Save bar** at bottom of tab: Cancel + Save Changes buttons (existing pattern).

---

## Tab 2: Professional

### Professional Details Card

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Title | Input | Max 20 chars | e.g., "Dr.", "D.C.", "Ph.D." |
| License Number | Input | Max 50 chars | e.g., "T-12345" or NPI equivalent |
| Education | Textarea | Max 1000 chars | e.g., "Palmer College of Chiropractic, 2015" |
| Certifications | Tag Input | Max 20 items, each max 100 chars | e.g., "DACBR", "CCSP" — add via Enter/comma |
| Years of Experience | Number Input | 0-70, integer | With +/- stepper |
| Languages | Tag Input | Max 20 items, each max 50 chars | e.g., "English", "Malay", "Mandarin" |

### Insurance Plans Card

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Insurance Plans | Tag Input | Max 50 items, each max 100 chars | e.g., "AIA", "Prudential", "Great Eastern" |

**Save bar** at bottom of tab.

---

## Tab 3: Clinic

### Assigned Branches Card

Display-only list of branches the doctor belongs to:

```
+----------------------------------------------+
|  SmartChiro KL          Owner     12 patients |
|  SmartChiro PJ          Doctor     5 patients |
+----------------------------------------------+
```

Each row: Branch name, role badge (`rounded-full`, color-coded), patient count. Click navigates to `/dashboard/branches/[branchId]`.

### Working Schedule Card

A 7-day schedule grid (reuse the existing schedule pattern from branch settings):

| Day | Toggle | Start Time | End Time |
|-----|--------|-----------|----------|
| Monday | on/off | 09:00 | 17:00 |
| Tuesday | on/off | 09:00 | 17:00 |
| ... | ... | ... | ... |
| Sunday | off | — | — |

- Toggle switch to enable/disable each day
- Time inputs in HH:MM format
- Disabled days show grayed-out row

### Consultation Details Card

| Field | Type | Validation | Notes |
|-------|------|-----------|-------|
| Treatment Room | Input | Max 100 chars | e.g., "Room 3A" |
| Consultation Fee | Number Input | 0-99999.99 | With "RM" prefix label |

**Save bar** at bottom of tab.

---

## Tab 4: Security

### Password Section (existing)

Preserve the existing password change UI:
- Current Password (if has password)
- New Password
- Confirm New Password
- Set/Update Password button

### Connected Accounts Section (existing)

Preserve the existing connected accounts display:
- Google connection status badge
- Email & Password status badge

**Save bar** for password section.

---

## Component Structure

```
src/
  app/dashboard/settings/[userId]/
    page.tsx                     ← Server component (modify: fetch DoctorDetail)
  components/dashboard/settings/
    SettingsView.tsx              ← Rewrite: tabbed layout container
    ProfileTab.tsx               ← NEW: header card + stats + contact + bio
    ProfessionalTab.tsx          ← NEW: title, license, education, certs, experience, languages, insurance
    ClinicTab.tsx                ← NEW: branches, schedule, room, fee
    SecurityTab.tsx              ← NEW: extracted from existing SettingsView (password + connected accounts)
    TagInput.tsx                 ← NEW: reusable tag input for certifications, languages, insurance plans
    ScheduleGrid.tsx             ← NEW: 7-day schedule editor
    StatCard.tsx                 ← NEW: small stat display card
```

### Shared Components

**TagInput**: Input field with tag chips. Type text + press Enter or comma to add. Click X on chip to remove. Same pattern as the deleted `src/components/dashboard/doctor/TagInput.tsx` but placed in settings directory.

**ScheduleGrid**: 7 rows (Mon-Sun), each with toggle + start/end time inputs. Same pattern as the deleted `src/components/dashboard/doctor/ScheduleGrid.tsx`.

**StatCard**: Simple card with number + label. Reusable.

---

## Data Flow

### Page Load (Server Component)

```
1. auth() → session.user.id
2. Verify userId === session.user.id (self-only)
3. Fetch user with profile, accounts, branches
4. Fetch stats (patients, visits, xrays, appointments)
5. Pass combined data to SettingsView
```

### Save (Client Component)

Each tab has its own Save/Cancel bar. On save:

```
1. Collect changed fields for the active tab
2. PUT /api/doctors/[userId] with changed fields
3. On success: update local state, show toast
4. On error: show error toast
```

Photo upload uses `POST /api/doctors/[userId]/photo` (existing).
Password change uses `PUT /api/settings/password` (existing).

---

## Design Specifications

### Tab Bar

```css
/* Tab container */
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5edf5;
  padding-bottom: 0;
  margin-bottom: 24px;
}

/* Tab button */
.tab {
  padding: 6px 12px;
  border-radius: 4px 4px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: #64748d;
  border-bottom: 2px solid transparent;
  transition: all 150ms;
}

/* Active tab */
.tab-active {
  color: #533afd;
  border-bottom-color: #533afd;
}

/* Hover tab */
.tab:hover {
  color: #061b31;
  background: #f6f9fc;
}
```

### Card Style (all sections)

```css
border: 1px solid #e5edf5;
border-radius: 6px;
background: #ffffff;
box-shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02);
```

### Section Headers

```css
font-size: 16px;
font-weight: 500;
color: #061b31;
margin-bottom: 16px;
/* With icon: 4px gap, icon color #64748d, strokeWidth 1.5 */
```

### Form Labels

```css
font-size: 13px;
font-weight: 500;
color: #64748d;
margin-bottom: 6px;
```

### Form Inputs

```css
height: 36px;
border-radius: 4px;
border: 1px solid #e5edf5;
background: #F6F9FC;
font-size: 14px;
color: #061b31;
/* Focus: border-color #533afd, ring-1 #533afd */
```

### Tag Input Chips

```css
display: inline-flex;
align-items: center;
gap: 4px;
padding: 2px 8px;
border-radius: 9999px;
background: #ededfc;
color: #533afd;
font-size: 12px;
font-weight: 500;
/* X button: hover:bg-[#d8d4fc] rounded-full */
```

### Stat Cards

```css
padding: 16px;
border: 1px solid #e5edf5;
border-radius: 6px;
background: #ffffff;
box-shadow: /* shadow-card */;
/* Number: text-[23px] font-light text-[#061b31] */
/* Label: text-[13px] text-[#64748d] */
```

---

## Validation Rules Summary

| Field | Rule |
|-------|------|
| name | 1-100 chars, required |
| phone | max 20 chars, optional |
| title | max 20 chars, optional |
| licenseNumber | max 50 chars, optional |
| education | max 1000 chars, optional |
| certifications | array max 20, each max 100 chars |
| specialties | array max 20, each max 50 chars |
| yearsExperience | integer 0-70, optional |
| languages | array max 20, each max 50 chars |
| insurancePlans | array max 50, each max 100 chars |
| workingSchedule | object with day keys (mon-sun), HH:MM format |
| treatmentRoom | max 100 chars, optional |
| consultationFee | number 0-99999.99, optional |
| bio | max 2000 chars, optional |

---

## Test Plan

### API Tests (extend existing)

| # | Test | Method | Expected |
|---|------|--------|----------|
| 1 | PUT with valid title | PUT /api/doctors/[userId] | 200, title saved |
| 2 | PUT with title > 20 chars | PUT | 400, validation error |
| 3 | PUT with valid certifications array | PUT | 200, certifications saved |
| 4 | PUT with certifications > 20 items | PUT | 400, validation error |
| 5 | PUT with certification item > 100 chars | PUT | 400, validation error |
| 6 | GET returns appointmentsThisWeek | GET /api/doctors/[userId] | 200, stats include week count |
| 7 | GET returns appointmentsThisMonth | GET /api/doctors/[userId] | 200, stats include month count |
| 8 | GET returns new profile fields (title, certifications) | GET | 200, fields present |

### UI Smoke Tests (manual via Playwright)

| # | Test |
|---|------|
| 1 | Settings page loads with 4 tabs |
| 2 | Profile tab shows header card with avatar, name, specialties, status, stats |
| 3 | Professional tab shows all professional fields, can add/remove certifications |
| 4 | Clinic tab shows branches, schedule grid, fee fields |
| 5 | Security tab shows password form and connected accounts |
| 6 | Save on each tab persists changes (verify via page refresh) |
| 7 | Photo upload updates avatar immediately |
| 8 | Tag inputs (certifications, languages, insurance) add/remove correctly |
| 9 | Schedule grid toggle enables/disables day rows |

---

## Files Changed

| Action | File |
|--------|------|
| MODIFY | `prisma/schema.prisma` — add title, certifications to DoctorProfile |
| NEW | `prisma/migrations/xxx_add_doctor_title_certifications/` |
| MODIFY | `src/types/doctor.ts` — add title, certifications, appointment stats |
| MODIFY | `src/app/api/doctors/[userId]/route.ts` — validate new fields, compute appointment stats |
| MODIFY | `src/app/dashboard/settings/[userId]/page.tsx` — fetch full DoctorDetail |
| REWRITE | `src/components/dashboard/settings/SettingsView.tsx` — tabbed container |
| NEW | `src/components/dashboard/settings/ProfileTab.tsx` |
| NEW | `src/components/dashboard/settings/ProfessionalTab.tsx` |
| NEW | `src/components/dashboard/settings/ClinicTab.tsx` |
| NEW | `src/components/dashboard/settings/SecurityTab.tsx` |
| NEW | `src/components/dashboard/settings/TagInput.tsx` |
| NEW | `src/components/dashboard/settings/ScheduleGrid.tsx` |
| NEW | `src/components/dashboard/settings/StatCard.tsx` |
| MODIFY | `tests/api/doctors.test.ts` — add tests for new fields + stats |

---

## Out of Scope

- **Average rating/reviews**: No Review model exists. Deferred to a future feature.
- **Deactivate/activate action on settings page**: This is an owner-only action on _other_ doctors, handled in branch doctor management (existing PATCH `/api/doctors/[userId]/status`). The settings page shows your own status as read-only.
- **Assign to clinic action**: Handled via branch member management (`POST /api/branches/[branchId]/members`). Visible on the Clinic tab as a display-only branch list.
- **View schedule action**: The schedule is directly editable on the Clinic tab. For a calendar view, see the Calendar page (future feature).
- **Doctors listing page** (`/dashboard/doctors`): Separate feature. The sidebar link exists but the page is not part of this spec.

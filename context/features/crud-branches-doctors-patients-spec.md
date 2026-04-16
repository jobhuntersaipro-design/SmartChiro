# CRUD: Branches, Doctors & Patients

## Status: Not Started

## Overview

Complete CRUD API routes and tests for the three core entities — **Branches**, **Doctors** (BranchMembers), and **Patients**. Currently the codebase has partial implementations (create-only for branches, list+create for patients, member add/remove for doctors). This spec fills the gaps with full CRUD, proper RBAC enforcement, input validation, and integration tests that run against the real Neon PostgreSQL database.

---

## Current State (What Exists)

### Branches
| Operation | Route | Status |
|-----------|-------|--------|
| Create | `POST /api/branches` | Exists (no validation beyond name) |
| List | — | Missing |
| Get | — | Missing |
| Update | — | Missing |
| Delete | — | Missing |

### Doctors (Branch Members)
| Operation | Route | Status |
|-----------|-------|--------|
| List members | `GET /api/branches/[branchId]/members` | Exists |
| Add member | `POST /api/branches/[branchId]/members` | Exists |
| Update role | `PATCH /api/branches/[branchId]/members/[memberId]` | Exists |
| Remove member | `DELETE /api/branches/[branchId]/members/[memberId]` | Exists |

### Patients
| Operation | Route | Status |
|-----------|-------|--------|
| List | `GET /api/patients` | Exists (doctor-scoped only) |
| Create | `POST /api/patients` | Exists |
| Get single | — | Missing |
| Update | — | Missing |
| Delete | — | Missing |

---

## What to Build

### 1. Branch CRUD — Full API

**Route file**: `src/app/api/branches/route.ts` (extend existing) + `src/app/api/branches/[branchId]/route.ts` (new)

#### `GET /api/branches` — List branches for current user

- Return all branches where user is a member
- Include member count, patient count per branch
- Sort by name ascending
- Response shape:
```ts
{
  branches: {
    id: string
    name: string
    address: string | null
    phone: string | null
    email: string | null
    memberCount: number
    patientCount: number
    userRole: BranchRole  // caller's role in this branch
    createdAt: string
  }[]
}
```

#### `GET /api/branches/[branchId]` — Get single branch

- Verify caller is a member of this branch (403 if not)
- Include members list and patient count
- Response shape:
```ts
{
  branch: {
    id: string
    name: string
    address: string | null
    phone: string | null
    email: string | null
    members: { id: string; userId: string; name: string; email: string; role: BranchRole; joinedAt: string }[]
    patientCount: number
    createdAt: string
    updatedAt: string
  }
}
```

#### `PATCH /api/branches/[branchId]` — Update branch

- **RBAC**: Only OWNER or ADMIN can update
- Updateable fields: `name`, `address`, `phone`, `email`
- Validate: `name` must be non-empty string if provided
- Validate: `email` format if provided
- Return updated branch object

#### `DELETE /api/branches/[branchId]` — Delete branch

- **RBAC**: Only OWNER can delete
- Cascade: Prisma schema already has `onDelete: Cascade` on BranchMember, Patient (which cascades to visits, xrays, etc.), Appointment, Invoice
- Cannot delete if it's the user's only branch (400 error: "Cannot delete your only branch")
- Return `{ success: true }`

#### Enhance existing `POST /api/branches`

- Add email format validation if email provided
- Add phone format validation (optional, just trim)
- Return consistent response shape matching GET

---

### 2. Doctor (Branch Member) CRUD — Enhancements

**Route files**: existing `src/app/api/branches/[branchId]/members/route.ts` and `src/app/api/branches/[branchId]/members/[memberId]/route.ts`

These are mostly complete. Enhancements:

#### `GET /api/branches/[branchId]/members/[memberId]` — Get single member (new)

- Verify caller is a member of the branch
- Return member detail with user info
- Response:
```ts
{
  member: {
    id: string
    userId: string
    name: string
    email: string
    image: string | null
    role: BranchRole
    patientCount: number   // patients assigned to this doctor in this branch
    joinedAt: string
  }
}
```

#### Enhance `PATCH /api/branches/[branchId]/members/[memberId]`

- Currently only OWNER can change roles — keep this
- Add: OWNER can transfer ownership (set another member to OWNER, demote self to ADMIN)
  - Only if target member exists and is in the branch
  - This is a two-step atomic update (transaction)

---

### 3. Patient CRUD — Complete API

**Route files**: extend `src/app/api/patients/route.ts` + new `src/app/api/patients/[patientId]/route.ts`

#### Enhance `GET /api/patients` — Role-aware listing

- Current: only returns patients where `doctorId = session.user.id`
- New behavior:
  - **OWNER/ADMIN**: return all patients in the user's active branch (or all branches if no filter)
  - **DOCTOR**: return only their assigned patients (current behavior)
- Add query params: `?branchId=xxx` to filter by branch, `?search=xxx` for fuzzy search
- Search should match against `firstName`, `lastName`, `email`, `phone` (case-insensitive contains)

#### `GET /api/patients/[patientId]` — Get single patient

- Verify access: caller must be the assigned doctor, or OWNER/ADMIN of the patient's branch
- Include: visits (last 5), xrays (last 10), doctor info
- Response shape:
```ts
{
  patient: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    dateOfBirth: string | null
    gender: string | null
    address: string | null
    emergencyContact: string | null
    medicalHistory: string | null
    notes: string | null
    doctorId: string
    doctorName: string
    branchId: string
    branchName: string
    totalVisits: number
    totalXrays: number
    recentVisits: { id: string; visitDate: string; subjective: string | null }[]
    recentXrays: { id: string; title: string | null; bodyRegion: string | null; createdAt: string }[]
    createdAt: string
    updatedAt: string
  }
}
```

#### `PATCH /api/patients/[patientId]` — Update patient

- **RBAC**: assigned doctor, or OWNER/ADMIN of patient's branch
- Updateable fields: `firstName`, `lastName`, `email`, `phone`, `dateOfBirth`, `gender`, `address`, `emergencyContact`, `medicalHistory`, `notes`, `doctorId`
- Validate: `firstName` and `lastName` non-empty if provided
- Validate: `email` format if provided
- Validate: `doctorId` must be a member of the patient's branch if changed
- Return updated patient object

#### `DELETE /api/patients/[patientId]` — Delete patient

- **RBAC**: assigned doctor, or OWNER/ADMIN of patient's branch
- Cascade: Prisma schema has `onDelete: Cascade` on Visit, Xray, Appointment, Invoice, PatientDocument
- Return `{ success: true }`

---

## 4. Test Strategy — TDD with Neon DB Validation

### Test Framework

- **Vitest** (already configured)
- Tests hit the **real Neon database** via Prisma — no mocks for DB layer
- Mock only `auth()` session (use `vi.mock('@/lib/auth')`)
- Test files co-located with route files:
  - `src/app/api/branches/__tests__/branches.test.ts`
  - `src/app/api/branches/__tests__/branch-detail.test.ts`
  - `src/app/api/branches/__tests__/members.test.ts`
  - `src/app/api/patients/__tests__/patients.test.ts`
  - `src/app/api/patients/__tests__/patient-detail.test.ts`

### Test Data Management

- Each test file creates its own test user + branch + data in `beforeAll`
- Each test file cleans up in `afterAll` (delete test user cascades everything)
- Use unique email prefixes per test file to avoid collisions: `test-branches-{timestamp}@test.com`
- Use Prisma directly for setup/teardown (not API routes)

### Test Categories

#### Branch Tests (~20 tests)

```
GET /api/branches
  - returns empty array for user with no branches
  - returns all branches user is a member of
  - includes member count and patient count
  - does not return branches user is not a member of

POST /api/branches
  - creates branch and sets user as OWNER
  - sets activeBranchId if user has none
  - rejects empty name (400)
  - rejects unauthenticated request (401)
  - validates email format if provided

GET /api/branches/[branchId]
  - returns branch with members and patient count
  - returns 403 for non-member
  - returns 404 for non-existent branch

PATCH /api/branches/[branchId]
  - OWNER can update name, address, phone, email
  - ADMIN can update branch details
  - DOCTOR cannot update (403)
  - rejects empty name
  - validates email format
  - returns 404 for non-existent branch

DELETE /api/branches/[branchId]
  - OWNER can delete branch
  - ADMIN cannot delete (403)
  - DOCTOR cannot delete (403)
  - cannot delete only branch (400)
  - cascades: patients, members deleted
  - returns 404 for non-existent branch
```

#### Doctor/Member Tests (~15 tests)

```
GET /api/branches/[branchId]/members/[memberId]
  - returns member with patient count
  - returns 403 for non-branch-member
  - returns 404 for non-existent member

POST /api/branches/[branchId]/members
  - existing tests remain
  - verify member persisted in Neon DB after creation

PATCH /api/branches/[branchId]/members/[memberId]
  - existing tests remain
  - OWNER can transfer ownership (atomic)
  - verify role change persisted in DB

DELETE /api/branches/[branchId]/members/[memberId]
  - existing tests remain
  - verify member removed from DB
  - verify member's patients NOT deleted (reassign? or orphan check?)
```

#### Patient Tests (~25 tests)

```
GET /api/patients
  - DOCTOR sees only own patients
  - OWNER sees all patients in branch
  - ADMIN sees all patients in branch
  - search by firstName (case-insensitive)
  - search by lastName
  - search by email
  - search by phone
  - filter by branchId
  - returns empty array when no patients
  - includes xray count, visit count, doctor name

GET /api/patients/[patientId]
  - assigned doctor can view
  - OWNER of branch can view
  - ADMIN of branch can view
  - doctor of different branch cannot view (403)
  - returns 404 for non-existent patient
  - includes recent visits and xrays

POST /api/patients
  - existing tests remain
  - verify patient persisted in Neon DB
  - validates required fields
  - validates email format

PATCH /api/patients/[patientId]
  - assigned doctor can update
  - OWNER can update
  - ADMIN can update
  - unrelated doctor cannot update (403)
  - can reassign to different doctor in same branch
  - cannot reassign to doctor not in branch (400)
  - rejects empty firstName/lastName

DELETE /api/patients/[patientId]
  - assigned doctor can delete
  - OWNER can delete
  - unrelated doctor cannot delete (403)
  - cascades: visits, xrays, appointments deleted
  - verify deletion in Neon DB
  - returns 404 for non-existent patient
```

### Neon DB Validation Pattern

Every write test follows this pattern — **write via API, verify via Prisma**:

```ts
// 1. Call API route
const response = await POST(request)
expect(response.status).toBe(201)

// 2. Verify in Neon DB via Prisma
const dbRecord = await prisma.branch.findUnique({
  where: { id: responseData.branch.id }
})
expect(dbRecord).not.toBeNull()
expect(dbRecord!.name).toBe('Test Branch')

// 3. For deletes — verify cascade
const response = await DELETE(request)
expect(response.status).toBe(200)

const dbPatients = await prisma.patient.findMany({
  where: { branchId: deletedBranchId }
})
expect(dbPatients).toHaveLength(0)
```

---

## 5. Implementation Order (TDD Red-Green-Refactor)

### Phase 1: Branch CRUD (Red → Green → Refactor)
1. Write branch list/get/update/delete tests (RED — all fail)
2. Implement `GET /api/branches` in existing route file
3. Create `src/app/api/branches/[branchId]/route.ts` with GET, PATCH, DELETE
4. Enhance `POST /api/branches` with validation
5. Run tests (GREEN)
6. Refactor: extract shared RBAC helpers if repeated patterns emerge

### Phase 2: Doctor/Member Enhancements (Red → Green → Refactor)
1. Write member detail + ownership transfer tests (RED)
2. Add `GET` handler to `[memberId]/route.ts`
3. Enhance `PATCH` with ownership transfer logic
4. Run tests (GREEN)
5. Refactor

### Phase 3: Patient CRUD (Red → Green → Refactor)
1. Write patient detail/update/delete + role-aware listing tests (RED)
2. Create `src/app/api/patients/[patientId]/route.ts` with GET, PATCH, DELETE
3. Enhance `GET /api/patients` with role-aware logic + search + branchId filter
4. Run tests (GREEN)
5. Refactor

### Phase 4: Cross-Entity Validation
1. Test cascade deletes (delete branch → verify patients gone)
2. Test referential integrity (assign patient to non-existent doctor)
3. Run full test suite: `npm run test`
4. Run build: `npm run build`

---

## 6. Files to Create/Modify

### New Files
- `src/app/api/branches/[branchId]/route.ts` — GET, PATCH, DELETE for single branch
- `src/app/api/patients/[patientId]/route.ts` — GET, PATCH, DELETE for single patient
- `src/app/api/branches/__tests__/branches.test.ts` — Branch CRUD tests
- `src/app/api/branches/__tests__/branch-detail.test.ts` — Single branch tests
- `src/app/api/branches/__tests__/members.test.ts` — Member/doctor tests
- `src/app/api/patients/__tests__/patients.test.ts` — Patient list + create tests
- `src/app/api/patients/__tests__/patient-detail.test.ts` — Patient detail/update/delete tests

### Modified Files
- `src/app/api/branches/route.ts` — Add GET handler, enhance POST validation
- `src/app/api/branches/[branchId]/members/[memberId]/route.ts` — Add GET handler, enhance PATCH for ownership transfer
- `src/app/api/patients/route.ts` — Add role-aware filtering, search, branchId param

---

## 7. RBAC Rules Summary

| Action | OWNER | ADMIN | DOCTOR |
|--------|-------|-------|--------|
| List branches | Own branches | Own branches | Own branches |
| View branch detail | Any member branch | Any member branch | Own branch |
| Create branch | Yes | No | No |
| Update branch | Yes | Yes | No |
| Delete branch | Yes (not last) | No | No |
| List members | Any member branch | Any member branch | Own branch |
| Add member | Yes | Yes | No |
| Update member role | Yes | No | No |
| Remove member | Yes | Yes (not OWNER) | No |
| List patients | All in branch | All in branch | Own only |
| View patient | Branch members | Branch members | Own only |
| Create patient | Yes | Yes | Yes (assigns self) |
| Update patient | Yes | Yes | Own only |
| Delete patient | Yes | Yes | Own only |

---

## 8. Error Response Format

All API errors follow the existing pattern:
```ts
{ error: string }  // with appropriate HTTP status code
```

Status codes:
- `400` — Validation error (missing fields, bad format)
- `401` — Not authenticated
- `403` — Insufficient permissions (RBAC)
- `404` — Resource not found
- `409` — Conflict (duplicate member, etc.)
- `500` — Server error

---

## Notes

- All tests must pass `npm run build` (no TypeScript errors)
- Tests use real Neon DB — ensure `DATABASE_URL` is set in `.env`
- Test data is isolated by unique email/name prefixes and cleaned up after each file
- No mocking of Prisma — we want to validate the actual SQL against Neon
- Auth session is mocked via `vi.mock('@/lib/auth')`

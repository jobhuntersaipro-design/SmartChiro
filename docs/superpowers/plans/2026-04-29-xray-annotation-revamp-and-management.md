# X-Ray Annotation Revamp & Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-04-29-xray-annotation-revamp-and-management-design.md](../specs/2026-04-29-xray-annotation-revamp-and-management-design.md)

**Goal:** Revamp the annotation viewer (left rail, MedDream-style mouse conventions, series strip, first-run overlay) and upgrade the patient X-Rays tab (versioned notes, RBAC, batch actions, filters, restore from archive) — single PR, two surfaces.

**Architecture:** New `XrayNote` Prisma model (revisions; current = latest). New permission helper `canManageXray` shared by all mutation routes. New API: `GET/POST /api/xrays/[id]/notes`. UI uses Tailwind v4 + shadcn primitives + Stripe-style hex tokens (4px radius, `#533afd` purple, `#0a1220` rail bg). All logic-level tests live in `src/**/*.test.ts` (vitest node env); UI verified manually since the project has no jsdom setup.

**Tech Stack:** Next.js 16 (server components by default), TypeScript strict, Prisma 7 + Neon, NextAuth v5, Tailwind v4 (no `tailwind.config`), shadcn/ui, lucide-react icons, vitest.

**Branch:** `feat/xray-annotation-revamp-and-management` (already created).

---

## File Structure

### Created

```
prisma/migrations/<timestamp>_add_xray_note/migration.sql
src/lib/auth/xray.ts                      # canManageXray, getXrayCapability
src/lib/__tests__/xray-auth.test.ts
src/app/api/xrays/[xrayId]/notes/route.ts # GET/POST notes
src/app/api/xrays/__tests__/xray-notes.test.ts
src/app/api/xrays/__tests__/xray-rbac.test.ts
src/hooks/useViewerInputs.ts              # middle-drag pan, right-drag W/L, modifier wheel
src/hooks/__tests__/useViewerInputs.test.ts
src/hooks/useXrayNotes.ts                 # client-side notes fetcher + mutator
src/components/annotation/SeriesStrip.tsx
src/components/annotation/FirstRunOverlay.tsx
src/components/annotation/NotesDrawer.tsx
src/components/xray/XrayCard.tsx
src/components/xray/XrayFilterBar.tsx
src/components/xray/XrayBatchToolbar.tsx
src/components/xray/DeleteXrayDialog.tsx
```

### Modified

```
prisma/schema.prisma                                    # +XrayNote model, User relation
src/types/annotation.ts                                 # remove "calibration" from ToolId
src/components/annotation/AnnotationToolbar.tsx         # left rail, no calibration, no undo/redo
src/components/annotation/AnnotationHeader.tsx          # add Notes button, move "?" into Adjust popover
src/components/annotation/AnnotationCanvas.tsx          # wire useViewerInputs, SeriesStrip, FirstRunOverlay, NotesDrawer
src/components/annotation/StatusBar.tsx                 # add undo/redo, drop "Uncalibrated"
src/components/patients/PatientXraysTab.tsx             # rebuild as orchestrator over XrayCard etc.
src/app/api/xrays/[xrayId]/route.ts                     # auth check on PATCH/DELETE; PATCH allowlist += status
src/app/api/xrays/upload-url/route.ts                   # auth check via session
src/app/api/xrays/upload/route.ts                       # auth check via session
context/current-feature.md                              # update Status / History
```

### Deleted

```
src/components/annotation/CalibrationDialog.tsx         # already orphaned (no callers post enhance-3)
src/app/api/xrays/[xrayId]/calibrate/route.ts           # already orphaned
```

---

## Conventions Used Throughout the Plan

- **Test file naming:** `*.test.ts` (vitest node env, jsdom is NOT installed). All "API tests" hit the real Neon DB the way `src/app/api/patients/__tests__/patients.test.ts` does (mocked auth, real DB).
- **Test prefix pattern:** every test suite uses `const TEST_PREFIX = \`test-<topic>-\${Date.now()}\`` to namespace its DB rows; cleanup in `afterAll`.
- **Auth mock pattern:** `vi.mock('@/lib/auth', () => ({ auth: (...args) => mockAuth(...args) }))` and `mockAuth.mockResolvedValue({ user: { id: <userId> } })` per test.
- **Commit style:** Conventional commits (`feat(xray): ...`, `fix(xray): ...`, `chore(xray): ...`). Each task ends with a commit. **NEVER add "Co-Authored-By: Claude"** — see `context/ai-interaction.md`.
- **Run before each commit:** `npm run lint` (fix red) and `npm run test` (the just-added test should pass; existing tests should not regress). End-of-PR also runs `npm run build`.

---

## Phase 1 — Data Model & Permission Helper

### Task 1.1: Add `XrayNote` model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Append to the X-Ray section (after `Annotation`, before `// ─── Appointments ───`):

```prisma
model XrayNote {
  id        String   @id @default(cuid())
  bodyMd    String   // markdown / plain text — rendered as plain text in MVP

  xrayId    String
  xray      Xray     @relation(fields: [xrayId], references: [id], onDelete: Cascade)

  authorId  String
  author    User     @relation("XrayNoteAuthor", fields: [authorId], references: [id])

  createdAt DateTime @default(now())

  @@index([xrayId, createdAt])
  @@index([authorId])
}
```

- [ ] **Step 2: Add the back-relation on `User`**

Find `model User { ... }`. Add this line in the relations block (next to other relations like `branchMemberships`):

```prisma
  xrayNotes        XrayNote[] @relation("XrayNoteAuthor")
```

- [ ] **Step 3: Add the back-relation on `Xray`**

Find `model Xray { ... }`. Add inside the model (next to `annotations Annotation[]`):

```prisma
  notes XrayNote[]
```

- [ ] **Step 4: Verify the schema parses**

Run: `npx prisma format`
Expected: Exits 0; the file is reformatted.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add XrayNote model with author relation"
```

---

### Task 1.2: Create the migration

**Files:**
- Create: `prisma/migrations/<timestamp>_add_xray_note/migration.sql`

- [ ] **Step 1: Run prisma migrate dev**

Run: `npx prisma migrate dev --name add_xray_note`
Expected: Creates a new migration directory with `migration.sql` containing `CREATE TABLE "XrayNote"` and the two indexes; applies to the dev DB; regenerates the Prisma client.

- [ ] **Step 2: Sanity check the generated SQL**

Open the new file under `prisma/migrations/<timestamp>_add_xray_note/migration.sql` and confirm it has:

```sql
CREATE TABLE "XrayNote" (
    "id" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "xrayId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XrayNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XrayNote_xrayId_createdAt_idx" ON "XrayNote"("xrayId", "createdAt");
CREATE INDEX "XrayNote_authorId_idx" ON "XrayNote"("authorId");

ALTER TABLE "XrayNote" ADD CONSTRAINT "XrayNote_xrayId_fkey" FOREIGN KEY ("xrayId") REFERENCES "Xray"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XrayNote" ADD CONSTRAINT "XrayNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

If anything is off, edit `schema.prisma` and rerun.

- [ ] **Step 3: Verify migrate status**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations
git commit -m "feat(db): migrate add XrayNote table"
```

---

### Task 1.3: Permission helper `canManageXray`

**Files:**
- Create: `src/lib/auth/xray.ts`
- Test: `src/lib/__tests__/xray-auth.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/xray-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { canManageXray, getXrayCapability } from '@/lib/auth/xray'

const TEST_PREFIX = `test-xray-auth-${Date.now()}`

let ownerId: string
let adminId: string
let doctorId: string
let outsiderId: string
let xrayId: string

describe('canManageXray / getXrayCapability', () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const admin = await prisma.user.create({ data: { email: `${TEST_PREFIX}-a@t.com`, name: 'A' } })
    const doctor = await prisma.user.create({ data: { email: `${TEST_PREFIX}-d@t.com`, name: 'D' } })
    const outsider = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = owner.id; adminId = admin.id; doctorId = doctor.id; outsiderId = outsider.id

    const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Branch` } })
    const otherBranch = await prisma.branch.create({ data: { name: `${TEST_PREFIX} Other` } })

    await prisma.branchMember.create({ data: { userId: ownerId, branchId: branch.id, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId: branch.id, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId: branch.id, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: otherBranch.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: 'X', branchId: branch.id, doctorId },
    })
    const xray = await prisma.xray.create({
      data: {
        patientId: patient.id,
        uploadedById: doctorId,
        fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x',
      },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xrayNote.deleteMany({ where: { xray: { fileName: 'x.jpg' } } })
    await prisma.xray.deleteMany({ where: { fileName: 'x.jpg' } })
    await prisma.patient.deleteMany({ where: { lastName: 'X', firstName: 'P' } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
  })

  it('returns "manage" for OWNER', async () => {
    expect(await getXrayCapability(ownerId, xrayId)).toBe('manage')
    expect(await canManageXray(ownerId, xrayId)).toBe(true)
  })

  it('returns "manage" for ADMIN', async () => {
    expect(await getXrayCapability(adminId, xrayId)).toBe('manage')
  })

  it('returns "manage" for DOCTOR', async () => {
    expect(await getXrayCapability(doctorId, xrayId)).toBe('manage')
  })

  it('returns null for users outside the branch', async () => {
    expect(await getXrayCapability(outsiderId, xrayId)).toBeNull()
    expect(await canManageXray(outsiderId, xrayId)).toBe(false)
  })

  it('returns null when the xray does not exist', async () => {
    expect(await getXrayCapability(ownerId, 'nonexistent-id')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/xray-auth.test.ts`
Expected: FAIL with "Cannot find module '@/lib/auth/xray'".

- [ ] **Step 3: Implement the helper**

`src/lib/auth/xray.ts`:

```ts
import { prisma } from '@/lib/prisma'

export type XrayCapability = 'read' | 'manage'

/**
 * Returns the user's capability on this xray, or null if they have no access.
 * Membership in the X-ray's patient's branch with role OWNER/ADMIN/DOCTOR -> "manage".
 * Returning null lets callers respond 404 (no existence leak).
 */
export async function getXrayCapability(
  userId: string,
  xrayId: string,
): Promise<XrayCapability | null> {
  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { patient: { select: { branchId: true } } },
  })
  if (!xray) return null

  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: xray.patient.branchId } },
    select: { role: true },
  })
  if (!member) return null

  // OWNER, ADMIN, DOCTOR -> manage (BranchRole has only these three today)
  return 'manage'
}

export async function canManageXray(userId: string, xrayId: string): Promise<boolean> {
  return (await getXrayCapability(userId, xrayId)) === 'manage'
}

/**
 * Same shape, but for the *upload* path where the xray doesn't exist yet —
 * the caller passes a patientId.
 */
export async function canManagePatientXrays(userId: string, patientId: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { branchId: true },
  })
  if (!patient) return false

  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
    select: { role: true },
  })
  return member !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/xray-auth.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/xray.ts src/lib/__tests__/xray-auth.test.ts
git commit -m "feat(auth): add canManageXray permission helper"
```

---

## Phase 2 — API Hardening & Notes Endpoints

### Task 2.1: Tighten `PATCH /api/xrays/[xrayId]` (auth + status allowlist)

**Files:**
- Modify: `src/app/api/xrays/[xrayId]/route.ts`

- [ ] **Step 1: Edit the PATCH handler**

Replace the existing PATCH function in `src/app/api/xrays/[xrayId]/route.ts`:

```ts
import { auth } from '@/lib/auth'
import { canManageXray } from '@/lib/auth/xray'

const ALLOWED_BODY_REGIONS = [
  'CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER',
] as const
const ALLOWED_VIEW_TYPES = ['AP', 'LATERAL', 'OBLIQUE', 'FLEXION', 'EXTENSION', 'OTHER'] as const
const ALLOWED_STATUSES = ['READY', 'ARCHIVED'] as const  // UPLOADING is set by upload, not PATCHable

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }

  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { title, bodyRegion, viewType, status } = body

    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = typeof title === 'string' ? title.slice(0, 200) : null
    if (bodyRegion !== undefined) {
      if (bodyRegion !== null && !ALLOWED_BODY_REGIONS.includes(bodyRegion)) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid bodyRegion.' }, { status: 400 })
      }
      data.bodyRegion = bodyRegion
    }
    if (viewType !== undefined) {
      if (viewType !== null && !ALLOWED_VIEW_TYPES.includes(viewType)) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid viewType.' }, { status: 400 })
      }
      data.viewType = viewType
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid status.' }, { status: 400 })
      }
      data.status = status
    }

    const updated = await prisma.xray.update({ where: { id: xrayId }, data })
    return NextResponse.json({ xray: updated })
  } catch (error) {
    console.error('Failed to update xray:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to update X-ray.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint` then `npx tsc --noEmit`
Expected: Both clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/xrays/[xrayId]/route.ts
git commit -m "feat(xray): require manage permission for PATCH; allow status flips"
```

---

### Task 2.2: Tighten `DELETE /api/xrays/[xrayId]`

**Files:**
- Modify: `src/app/api/xrays/[xrayId]/route.ts`

- [ ] **Step 1: Edit the DELETE handler**

Replace the existing DELETE function in `src/app/api/xrays/[xrayId]/route.ts`:

```ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }

  if (!(await canManageXray(session.user.id, xrayId))) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  try {
    await prisma.xray.update({ where: { id: xrayId }, data: { status: 'ARCHIVED' } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to archive xray:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to archive X-ray.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/xrays/[xrayId]/route.ts
git commit -m "feat(xray): require manage permission for DELETE"
```

---

### Task 2.3: Tighten `POST /api/xrays/upload-url`

**Files:**
- Modify: `src/app/api/xrays/upload-url/route.ts`

- [ ] **Step 1: Replace the auth pattern**

Open `src/app/api/xrays/upload-url/route.ts`. Replace the section that reads `uploadedById` from the body:

```ts
// Was:
//   const uploadedById = body.uploadedById as string
//   if (!uploadedById) { return 401 }
// Becomes:
import { auth } from '@/lib/auth'
import { canManagePatientXrays } from '@/lib/auth/xray'

// inside POST:
const session = await auth()
if (!session?.user?.id) {
  return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
}
const uploadedById = session.user.id

if (!(await canManagePatientXrays(uploadedById, patientId))) {
  return NextResponse.json({ error: 'NOT_FOUND', message: 'Patient not found.' }, { status: 404 })
}
```

The full body destructure becomes `{ fileName, fileSize, mimeType, patientId }` (no `uploadedById`).

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/xrays/upload-url/route.ts
git commit -m "feat(xray): require branch membership for upload-url; use session"
```

---

### Task 2.4: Tighten `POST /api/xrays/upload`

**Files:**
- Modify: `src/app/api/xrays/upload/route.ts`

- [ ] **Step 1: Replace the auth pattern**

Open `src/app/api/xrays/upload/route.ts`. Replace the auth-from-formdata block with session-based auth:

```ts
import { auth } from '@/lib/auth'
import { canManagePatientXrays } from '@/lib/auth/xray'

// inside POST, after parsing formData:
const session = await auth()
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 })
}
const uploadedById = session.user.id

// Remove the formData.get('uploadedById') line entirely.

// after pulling patientId, before creating xray:
if (!(await canManagePatientXrays(uploadedById, patientId))) {
  return NextResponse.json({ error: 'Patient not found.' }, { status: 404 })
}
```

- [ ] **Step 2: Update the client caller**

Open `src/components/xray/XrayUpload.tsx`. Find the `formData.append('uploadedById', uploadedById)` line (currently around the FormData build). Remove it entirely. Also remove `uploadedById` from the component's `XrayUploadProps` interface; remove it from any callers (`PatientXraysTab`, `PatientImageSidebar`).

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/xrays/upload/route.ts src/components/xray/XrayUpload.tsx \
        src/components/patients/PatientXraysTab.tsx \
        src/components/annotation/PatientImageSidebar.tsx
git commit -m "feat(xray): require branch membership for upload; drop uploadedById prop drilling"
```

---

### Task 2.5: API RBAC test matrix

**Files:**
- Create: `src/app/api/xrays/__tests__/xray-rbac.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const TEST_PREFIX = `test-xray-rbac-${Date.now()}`

let ownerId: string, adminId: string, doctorId: string, outsiderId: string
let branchId: string, patientId: string, xrayId: string

function req(method: string, url: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Xray RBAC matrix', () => {
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const a = await prisma.user.create({ data: { email: `${TEST_PREFIX}-a@t.com`, name: 'A' } })
    const d = await prisma.user.create({ data: { email: `${TEST_PREFIX}-d@t.com`, name: 'D' } })
    const x = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = o.id; adminId = a.id; doctorId = d.id; outsiderId = x.id

    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } })
    const ob = await prisma.branch.create({ data: { name: `${TEST_PREFIX} OB` } })
    branchId = b.id

    await prisma.branchMember.create({ data: { userId: ownerId, branchId, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: adminId, branchId, role: 'ADMIN' } })
    await prisma.branchMember.create({ data: { userId: doctorId, branchId, role: 'DOCTOR' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: ob.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: TEST_PREFIX, branchId, doctorId },
    })
    patientId = patient.id

    const xray = await prisma.xray.create({
      data: { patientId, uploadedById: doctorId, fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x' },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xray.deleteMany({ where: { patientId } })
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, adminId, doctorId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
    mockAuth.mockReset()
  })

  describe('PATCH /api/xrays/[xrayId]', () => {
    it.each([
      ['OWNER',   () => ownerId,   200],
      ['ADMIN',   () => adminId,   200],
      ['DOCTOR',  () => doctorId,  200],
      ['outsider',() => outsiderId,404],
    ])('%s -> %i', async (_, getId, expectedStatus) => {
      mockAuth.mockResolvedValueOnce({ user: { id: getId() } })
      const { PATCH } = await import('../[xrayId]/route')
      const res = await PATCH(req('PATCH', `/api/xrays/${xrayId}`, { title: `t-${expectedStatus}` }), {
        params: Promise.resolve({ xrayId }),
      })
      expect(res.status).toBe(expectedStatus)
    })
  })

  describe('DELETE /api/xrays/[xrayId]', () => {
    it.each([
      ['OWNER',   () => ownerId,   200],
      ['outsider',() => outsiderId,404],
    ])('%s -> %i', async (_, getId, expectedStatus) => {
      mockAuth.mockResolvedValueOnce({ user: { id: getId() } })
      const { DELETE } = await import('../[xrayId]/route')
      const res = await DELETE(req('DELETE', `/api/xrays/${xrayId}`), { params: Promise.resolve({ xrayId }) })
      expect(res.status).toBe(expectedStatus)
    })
  })

  describe('POST /api/xrays/upload-url', () => {
    it('outsider -> 404', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: outsiderId } })
      const { POST } = await import('../upload-url/route')
      const res = await POST(req('POST', '/api/xrays/upload-url', {
        fileName: 'a.jpg', fileSize: 100, mimeType: 'image/jpeg', patientId,
      }))
      expect(res.status).toBe(404)
    })

    it('doctor -> 200', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: doctorId } })
      const { POST } = await import('../upload-url/route')
      const res = await POST(req('POST', '/api/xrays/upload-url', {
        fileName: 'a.jpg', fileSize: 100, mimeType: 'image/jpeg', patientId,
      }))
      expect(res.status).toBe(200)
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/app/api/xrays/__tests__/xray-rbac.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/xrays/__tests__/xray-rbac.test.ts
git commit -m "test(xray): add RBAC matrix for PATCH/DELETE/upload-url"
```

---

### Task 2.6: `GET /api/xrays/[xrayId]/notes`

**Files:**
- Create: `src/app/api/xrays/[xrayId]/notes/route.ts`

- [ ] **Step 1: Implement the route (GET only for now)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getXrayCapability } from '@/lib/auth/xray'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }
  if (!(await getXrayCapability(session.user.id, xrayId))) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  const notes = await prisma.xrayNote.findMany({
    where: { xrayId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, email: true } } },
  })

  const [current, ...history] = notes
  return NextResponse.json({ current: current ?? null, history })
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/xrays/[xrayId]/notes/route.ts
git commit -m "feat(xray): add GET /api/xrays/[id]/notes"
```

---

### Task 2.7: `POST /api/xrays/[xrayId]/notes`

**Files:**
- Modify: `src/app/api/xrays/[xrayId]/notes/route.ts`

- [ ] **Step 1: Add the POST handler**

Append to `src/app/api/xrays/[xrayId]/notes/route.ts`:

```ts
const MAX_BODY = 10_000
const HISTORY_CAP = 100

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }
  // Notes write requires "manage" — same as edit metadata.
  const cap = await getXrayCapability(session.user.id, xrayId)
  if (cap !== 'manage') {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  let body: { bodyMd?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON.' }, { status: 400 })
  }
  const bodyMd = typeof body.bodyMd === 'string' ? body.bodyMd : ''
  if (bodyMd.length > MAX_BODY) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: `Body must be <= ${MAX_BODY} characters.` },
      { status: 400 },
    )
  }

  await prisma.xrayNote.create({
    data: { xrayId, authorId: session.user.id, bodyMd: bodyMd.trim() },
  })

  // Soft cap on revisions: keep only the latest HISTORY_CAP rows.
  const total = await prisma.xrayNote.count({ where: { xrayId } })
  if (total > HISTORY_CAP) {
    const stale = await prisma.xrayNote.findMany({
      where: { xrayId },
      orderBy: { createdAt: 'asc' },
      take: total - HISTORY_CAP,
      select: { id: true },
    })
    await prisma.xrayNote.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
  }

  const notes = await prisma.xrayNote.findMany({
    where: { xrayId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, email: true } } },
  })
  const [current, ...history] = notes
  return NextResponse.json({ current: current ?? null, history }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/xrays/[xrayId]/notes/route.ts
git commit -m "feat(xray): add POST /api/xrays/[id]/notes with 100-rev cap"
```

---

### Task 2.8: Notes API integration tests

**Files:**
- Create: `src/app/api/xrays/__tests__/xray-notes.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

const TEST_PREFIX = `test-xray-notes-${Date.now()}`

let ownerId: string, outsiderId: string, xrayId: string

function req(method: string, url: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(`http://localhost:3000${url}`, init)
}

describe('Xray Notes API', () => {
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: 'O' } })
    const x = await prisma.user.create({ data: { email: `${TEST_PREFIX}-x@t.com`, name: 'X' } })
    ownerId = o.id; outsiderId = x.id

    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } })
    const ob = await prisma.branch.create({ data: { name: `${TEST_PREFIX} OB` } })
    await prisma.branchMember.create({ data: { userId: ownerId, branchId: b.id, role: 'OWNER' } })
    await prisma.branchMember.create({ data: { userId: outsiderId, branchId: ob.id, role: 'OWNER' } })

    const patient = await prisma.patient.create({
      data: { firstName: 'P', lastName: TEST_PREFIX, branchId: b.id, doctorId: ownerId },
    })
    const xray = await prisma.xray.create({
      data: { patientId: patient.id, uploadedById: ownerId, fileName: 'x.jpg', fileSize: 1, mimeType: 'image/jpeg', fileUrl: 'http://x' },
    })
    xrayId = xray.id
  })

  afterAll(async () => {
    await prisma.xrayNote.deleteMany({ where: { xrayId } })
    await prisma.xray.deleteMany({ where: { id: xrayId } })
    await prisma.patient.deleteMany({ where: { lastName: TEST_PREFIX } })
    await prisma.branchMember.deleteMany({ where: { userId: { in: [ownerId, outsiderId] } } })
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
  })

  it('GET returns null current when no notes exist', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.current).toBeNull()
    expect(json.history).toEqual([])
  })

  it('POST creates a note and GET reflects it', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: 'hello' }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.current.bodyMd).toBe('hello')
    expect(json.current.author.id).toBe(ownerId)
  })

  it('POST with empty string is allowed (clears note)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: '' }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(201)
  })

  it('POST rejects bodyMd > 10000 chars', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { POST } = await import('../[xrayId]/notes/route')
    const res = await POST(req('POST', `/api/xrays/${xrayId}/notes`, { bodyMd: 'x'.repeat(10001) }), {
      params: Promise.resolve({ xrayId }),
    })
    expect(res.status).toBe(400)
  })

  it('outsider GET -> 404', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: outsiderId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    expect(res.status).toBe(404)
  })

  it('history is ordered newest first', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: ownerId } })
    const { GET } = await import('../[xrayId]/notes/route')
    const res = await GET(req('GET', `/api/xrays/${xrayId}/notes`), { params: Promise.resolve({ xrayId }) })
    const json = await res.json()
    // After previous tests, current is the empty note, history has the "hello" note
    expect(json.current).not.toBeNull()
    if (json.history.length > 0) {
      const ts = json.history.map((h: { createdAt: string }) => new Date(h.createdAt).getTime())
      for (let i = 1; i < ts.length; i++) expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i])
    }
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/app/api/xrays/__tests__/xray-notes.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/xrays/__tests__/xray-notes.test.ts
git commit -m "test(xray): add notes API integration tests"
```

---

## Phase 3 — Patient X-Rays Tab UI

> Manual smoke at the end of Phase 3 verifies the whole tab. Individual UI components are built bottom-up.

### Task 3.1: `useXrayNotes` hook (client-side fetcher)

**Files:**
- Create: `src/hooks/useXrayNotes.ts`

- [ ] **Step 1: Implement**

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'

export interface NoteAuthor { id: string; name: string | null; email: string }
export interface XrayNote {
  id: string
  bodyMd: string
  createdAt: string
  author: NoteAuthor
}
export interface XrayNotesState {
  current: XrayNote | null
  history: XrayNote[]
}

export function useXrayNotes(xrayId: string | null) {
  const [data, setData] = useState<XrayNotesState>({ current: null, history: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    if (!xrayId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/xrays/${xrayId}/notes`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [xrayId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const saveNote = useCallback(async (bodyMd: string) => {
    if (!xrayId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/xrays/${xrayId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyMd }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setLoading(false)
    }
  }, [xrayId])

  return { ...data, loading, error, refresh: fetchNotes, saveNote }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useXrayNotes.ts
git commit -m "feat(xray): add useXrayNotes hook for client-side notes"
```

---

### Task 3.2: `NotesDrawer` component (shared with annotation viewer)

**Files:**
- Create: `src/components/annotation/NotesDrawer.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useXrayNotes } from '@/hooks/useXrayNotes'

interface NotesDrawerProps {
  xrayId: string | null
  xrayTitle?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotesDrawer({ xrayId, xrayTitle, open, onOpenChange }: NotesDrawerProps) {
  const { current, history, loading, error, saveNote } = useXrayNotes(open ? xrayId : null)
  const [draft, setDraft] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    setDraft(current?.bodyMd ?? '')
  }, [current?.id])

  const dirty = draft !== (current?.bodyMd ?? '')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-[#e5edf5]">
          <SheetTitle className="text-[15px] font-medium text-[#061b31]">
            Notes — {xrayTitle ?? 'X-ray'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes about this X-ray…"
            maxLength={10_000}
            className="w-full h-[240px] resize-none rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] p-3 text-[14px] text-[#0a2540] outline-none focus:border-[#533afd]"
          />
          {draft.length > 9_000 && (
            <p className="mt-1 text-[11px] text-[#697386]">{draft.length} / 10000</p>
          )}
          {error && <p className="mt-2 text-[12px] text-[#DF1B41]">{error}</p>}

          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-[13px] font-medium text-[#533afd]"
            >
              {showHistory ? 'Hide history' : `Show history (${history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-[4px] border border-[#e5edf5] bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wide text-[#697386]">
                      {h.author.name ?? h.author.email} · {new Date(h.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[13px] whitespace-pre-wrap text-[#425466]">
                      {h.bodyMd || <em className="text-[#A3ACB9]">(cleared)</em>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-[#e5edf5] px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            disabled={!dirty || loading}
            onClick={() => saveNote(draft)}
            className="bg-[#533afd] text-white hover:bg-[#4434d4] rounded-[4px]"
          >
            {loading ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/annotation/NotesDrawer.tsx
git commit -m "feat(xray): add NotesDrawer component"
```

---

### Task 3.3: `DeleteXrayDialog` component

**Files:**
- Create: `src/components/xray/DeleteXrayDialog.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteXrayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  xrayIds: string[]
  xrayTitles: string[]   // parallel to xrayIds
  onConfirmed: () => void
}

export function DeleteXrayDialog({ open, onOpenChange, xrayIds, xrayTitles, onConfirmed }: DeleteXrayDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true); setError(null)
    try {
      const results = await Promise.all(
        xrayIds.map((id) => fetch(`/api/xrays/${id}`, { method: 'DELETE' })),
      )
      if (results.some((r) => !r.ok)) throw new Error('One or more deletes failed.')
      onConfirmed()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium text-[#061b31]">
            Archive {xrayIds.length === 1 ? 'this X-ray' : `${xrayIds.length} X-rays`}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-[14px] text-[#425466]">
          Annotations will be preserved but the X-ray will be hidden from the patient&apos;s gallery.
          You can restore archived X-rays later from the &quot;Show archived&quot; toggle.
        </p>
        {xrayTitles.length > 0 && (
          <ul className="mt-2 max-h-[160px] overflow-y-auto rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] p-3 text-[13px] text-[#425466]">
            {xrayTitles.map((t, i) => <li key={i}>• {t || 'Untitled'}</li>)}
          </ul>
        )}
        {error && <p className="mt-2 text-[12px] text-[#DF1B41]">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className="bg-[#DF1B41] hover:bg-[#c4153a] text-white rounded-[4px]"
          >
            {busy ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/xray/DeleteXrayDialog.tsx
git commit -m "feat(xray): add DeleteXrayDialog with batch support"
```

---

### Task 3.4: `XrayFilterBar` component

**Files:**
- Create: `src/components/xray/XrayFilterBar.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import type { BodyRegion, ViewType } from '@prisma/client'

export type DateFilter = 'all' | '7d' | '30d'
export type SortBy = 'newest' | 'oldest' | 'title'

export interface FilterState {
  bodyRegions: BodyRegion[]
  viewTypes: ViewType[]
  date: DateFilter
  sort: SortBy
  showArchived: boolean
  batchMode: boolean
}

interface XrayFilterBarProps {
  state: FilterState
  onChange: (next: FilterState) => void
  count: number
}

const BODY_REGIONS: BodyRegion[] = ['CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER']
const VIEW_TYPES: ViewType[] = ['AP', 'LATERAL', 'OBLIQUE', 'FLEXION', 'EXTENSION', 'OTHER']

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[12px] transition-colors"
      style={{
        borderColor: active ? '#533afd' : '#e5edf5',
        backgroundColor: active ? '#ededfc' : '#FFFFFF',
        color: active ? '#533afd' : '#425466',
      }}
    >
      {children}
    </button>
  )
}

export function XrayFilterBar({ state, onChange, count }: XrayFilterBarProps) {
  function toggleRegion(r: BodyRegion) {
    const has = state.bodyRegions.includes(r)
    onChange({ ...state, bodyRegions: has ? state.bodyRegions.filter((x) => x !== r) : [...state.bodyRegions, r] })
  }
  function toggleView(v: ViewType) {
    const has = state.viewTypes.includes(v)
    onChange({ ...state, viewTypes: has ? state.viewTypes.filter((x) => x !== v) : [...state.viewTypes, v] })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-[#061b31]">X-Rays ({count})</span>
      <div className="flex flex-wrap gap-1.5 ml-2">
        {BODY_REGIONS.map((r) => (
          <Chip key={r} active={state.bodyRegions.includes(r)} onClick={() => toggleRegion(r)}>
            {r.replace('_', ' ').toLowerCase()}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VIEW_TYPES.map((v) => (
          <Chip key={v} active={state.viewTypes.includes(v)} onClick={() => toggleView(v)}>{v.toLowerCase()}</Chip>
        ))}
      </div>
      <Chip active={state.date === '7d'} onClick={() => onChange({ ...state, date: state.date === '7d' ? 'all' : '7d' })}>last 7d</Chip>
      <Chip active={state.date === '30d'} onClick={() => onChange({ ...state, date: state.date === '30d' ? 'all' : '30d' })}>last 30d</Chip>
      <Chip active={state.showArchived} onClick={() => onChange({ ...state, showArchived: !state.showArchived })}>archived</Chip>
      <div className="ml-auto flex items-center gap-2">
        <select
          value={state.sort}
          onChange={(e) => onChange({ ...state, sort: e.target.value as SortBy })}
          className="rounded-[4px] border border-[#e5edf5] bg-white px-2 py-1 text-[12px] text-[#425466]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A-Z</option>
        </select>
        <Chip active={state.batchMode} onClick={() => onChange({ ...state, batchMode: !state.batchMode })}>
          {state.batchMode ? 'Cancel select' : 'Select'}
        </Chip>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/xray/XrayFilterBar.tsx
git commit -m "feat(xray): add XrayFilterBar with region/view/date/sort/archived chips"
```

---

### Task 3.5: `XrayCard` component

**Files:**
- Create: `src/components/xray/XrayCard.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useState } from 'react'
import { Calendar, ScanLine, MoreVertical, Pencil, Trash2, FileText, Archive, RotateCcw } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export interface XrayCardData {
  id: string
  title: string | null
  bodyRegion: string | null
  viewType?: string | null
  status: 'UPLOADING' | 'READY' | 'ARCHIVED'
  thumbnailUrl?: string | null
  annotationCount?: number
  hasNotes?: boolean
  notePreview?: string | null
  createdAt: string
}

interface XrayCardProps {
  patientId: string
  xray: XrayCardData
  selected: boolean
  batchMode: boolean
  onToggleSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onOpenNotes: (id: string) => void
  onDelete: (id: string) => void
  onRestore?: (id: string) => void
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function XrayCard({
  patientId, xray, selected, batchMode, onToggleSelect, onRename, onOpenNotes, onDelete, onRestore,
}: XrayCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(xray.title ?? '')
  const archived = xray.status === 'ARCHIVED'

  async function commitRename() {
    setEditing(false)
    if (draft.trim() === (xray.title ?? '')) return
    await onRename(xray.id, draft.trim())
  }

  function handleClick(e: React.MouseEvent) {
    if (batchMode) {
      e.preventDefault()
      onToggleSelect(xray.id)
    }
  }

  return (
    <div
      className="group relative rounded-[6px] border bg-white overflow-hidden transition-colors"
      style={{ borderColor: selected ? '#533afd' : '#e5edf5' }}
    >
      {batchMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(xray.id)}
          className="absolute top-2 left-2 z-10 h-4 w-4 rounded-[3px] accent-[#533afd]"
          aria-label={`Select ${xray.title ?? 'X-ray'}`}
        />
      )}
      <a
        href={`/dashboard/xrays/${patientId}/${xray.id}/annotate`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block"
      >
        <div className="h-[160px] bg-[#1A1F36] flex items-center justify-center overflow-hidden relative">
          {xray.thumbnailUrl ? (
            <img src={xray.thumbnailUrl} alt={xray.title ?? 'X-ray'} className="w-full h-full object-contain" />
          ) : (
            <ScanLine className="w-10 h-10 text-[#4a5568] opacity-40" />
          )}
          {archived && (
            <span className="absolute top-2 left-2 rounded-[4px] bg-[#697386] px-2 py-0.5 text-[10px] text-white">
              Archived
            </span>
          )}
          {xray.status === 'UPLOADING' && (
            <span className="absolute top-2 left-2 rounded-[4px] bg-[#0570DE] px-2 py-0.5 text-[10px] text-white">
              Uploading…
            </span>
          )}
          {(xray.annotationCount ?? 0) > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-[#533afd] px-2 py-0.5 text-[10px] text-white">
              {xray.annotationCount} annot.
            </span>
          )}
        </div>
      </a>

      <div className="px-3 py-2.5">
        {editing ? (
          <input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(xray.title ?? ''); setEditing(false) } }}
            className="w-full rounded-[4px] border border-[#533afd] px-2 py-1 text-[14px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-[14px] font-medium text-[#061b31] truncate w-full hover:underline"
          >
            {xray.title || 'Untitled'}
          </button>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {xray.bodyRegion && (
            <span className="rounded-full px-2 py-0.5 text-[11px] bg-[#f6f9fc] text-[#64748d]">
              {xray.bodyRegion.replace(/_/g, ' ').toLowerCase()}
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-[#97a3b6]">
            <Calendar className="w-3 h-3" />
            {formatDate(xray.createdAt)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenNotes(xray.id)}
          className="mt-1.5 block w-full text-left text-[12px] text-[#64748d] truncate hover:text-[#533afd]"
        >
          {xray.notePreview ? xray.notePreview : <span className="text-[#A3ACB9]">Add notes…</span>}
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute top-2 right-2 z-10 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-[4px] bg-white/90 hover:bg-white text-[#425466]"
            aria-label="More actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenNotes(xray.id)}>
            <FileText className="mr-2 h-3.5 w-3.5" /> Edit notes
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onSelect={() => onRestore?.(xray.id)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onDelete(xray.id)} className="text-[#DF1B41]">
              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              <Trash2 className="ml-1 h-3 w-3 opacity-0" /> {/* spacer for alignment */}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/xray/XrayCard.tsx
git commit -m "feat(xray): add XrayCard with inline rename, notes preview, kebab menu"
```

---

### Task 3.6: `XrayBatchToolbar` component

**Files:**
- Create: `src/components/xray/XrayBatchToolbar.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { Button } from '@/components/ui/button'

interface XrayBatchToolbarProps {
  selectedCount: number
  onDelete: () => void
  onCancel: () => void
}

export function XrayBatchToolbar({ selectedCount, onDelete, onCancel }: XrayBatchToolbarProps) {
  if (selectedCount === 0) return null
  return (
    <div className="sticky bottom-0 z-20 mt-4 rounded-[6px] border border-[#e5edf5] bg-white p-3 flex items-center gap-3 shadow-[0_4px_12px_rgba(18,42,66,.06)]">
      <span className="text-[13px] font-medium text-[#061b31]">{selectedCount} selected</span>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onDelete} className="bg-[#DF1B41] hover:bg-[#c4153a] text-white rounded-[4px]">
          Archive
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/xray/XrayBatchToolbar.tsx
git commit -m "feat(xray): add XrayBatchToolbar"
```

---

### Task 3.7: Rebuild `PatientXraysTab` as orchestrator

**Files:**
- Modify: `src/components/patients/PatientXraysTab.tsx`

- [ ] **Step 1: Replace with orchestrator implementation**

Full new contents of `src/components/patients/PatientXraysTab.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { XrayUpload } from '@/components/xray/XrayUpload'
import { XrayCard, type XrayCardData } from '@/components/xray/XrayCard'
import { XrayFilterBar, type FilterState } from '@/components/xray/XrayFilterBar'
import { XrayBatchToolbar } from '@/components/xray/XrayBatchToolbar'
import { DeleteXrayDialog } from '@/components/xray/DeleteXrayDialog'
import { NotesDrawer } from '@/components/annotation/NotesDrawer'

interface PatientXraysTabProps {
  patientId: string
  xrays: XrayCardData[]
  onRefresh: () => void
}

const DEFAULT_FILTERS: FilterState = {
  bodyRegions: [], viewTypes: [], date: 'all', sort: 'newest', showArchived: false, batchMode: false,
}

export function PatientXraysTab({ patientId, xrays, onRefresh }: PatientXraysTabProps) {
  const [showUpload, setShowUpload] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notesXrayId, setNotesXrayId] = useState<string | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])

  // Reset selections when leaving batch mode.
  useEffect(() => { if (!filters.batchMode) setSelected(new Set()) }, [filters.batchMode])

  const filtered = useMemo(() => {
    const now = Date.now()
    let list = xrays.filter((x) => {
      if (!filters.showArchived && x.status === 'ARCHIVED') return false
      if (filters.bodyRegions.length && (!x.bodyRegion || !filters.bodyRegions.includes(x.bodyRegion as never))) return false
      if (filters.viewTypes.length && (!x.viewType || !filters.viewTypes.includes(x.viewType as never))) return false
      if (filters.date !== 'all') {
        const days = filters.date === '7d' ? 7 : 30
        const cutoff = now - days * 86400 * 1000
        if (new Date(x.createdAt).getTime() < cutoff) return false
      }
      return true
    })
    if (filters.sort === 'newest') list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (filters.sort === 'oldest') list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (filters.sort === 'title') list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return list
  }, [xrays, filters])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleRename(id: string, title: string) {
    await fetch(`/api/xrays/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    onRefresh()
  }

  async function handleRestore(id: string) {
    await fetch(`/api/xrays/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    })
    onRefresh()
  }

  function handleNotesOpen(id: string) {
    setNotesXrayId(id)
  }

  function handleDelete(id: string) {
    setDeleteIds([id])
  }

  function handleBatchDelete() {
    setDeleteIds(Array.from(selected))
  }

  const titleMap = Object.fromEntries(xrays.map((x) => [x.id, x.title ?? 'Untitled']))
  const notesXray = notesXrayId ? xrays.find((x) => x.id === notesXrayId) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <XrayFilterBar state={filters} onChange={setFilters} count={filtered.length} />
        <Button
          onClick={() => setShowUpload((v) => !v)}
          className="ml-3 h-8 rounded-[4px] bg-[#533afd] text-white text-[13px] font-medium hover:bg-[#4434d4] px-3"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Upload X-Ray
        </Button>
      </div>

      {showUpload && (
        <div className="mb-4 rounded-[6px] border border-[#e5edf5] bg-white p-4">
          <XrayUpload patientId={patientId} onUploadComplete={() => { setShowUpload(false); onRefresh() }} />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[14px] text-[#64748d]">No X-rays match these filters.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((x) => (
            <XrayCard
              key={x.id}
              patientId={patientId}
              xray={x}
              selected={selected.has(x.id)}
              batchMode={filters.batchMode}
              onToggleSelect={toggleSelect}
              onRename={handleRename}
              onOpenNotes={handleNotesOpen}
              onDelete={handleDelete}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}

      {filters.batchMode && (
        <XrayBatchToolbar
          selectedCount={selected.size}
          onDelete={handleBatchDelete}
          onCancel={() => setFilters({ ...filters, batchMode: false })}
        />
      )}

      <DeleteXrayDialog
        open={deleteIds.length > 0}
        onOpenChange={(o) => { if (!o) setDeleteIds([]) }}
        xrayIds={deleteIds}
        xrayTitles={deleteIds.map((id) => titleMap[id] ?? 'Untitled')}
        onConfirmed={() => { setDeleteIds([]); setSelected(new Set()); onRefresh() }}
      />

      <NotesDrawer
        xrayId={notesXrayId}
        xrayTitle={notesXray?.title ?? null}
        open={notesXrayId !== null}
        onOpenChange={(o) => { if (!o) setNotesXrayId(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update parent that loads `xrays` to pass annotation counts and note previews**

The patient detail page lives at `src/app/dashboard/patients/[patientId]/details/page.tsx`. Find the section that fetches `xrays` and extend the Prisma query:

```ts
const xrays = await prisma.xray.findMany({
  where: { patientId, status: { in: ['READY', 'ARCHIVED'] } },
  orderBy: { createdAt: 'desc' },
  select: {
    id: true, title: true, bodyRegion: true, viewType: true, status: true,
    thumbnailUrl: true, createdAt: true,
    _count: { select: { annotations: true } },
    notes: {
      take: 1, orderBy: { createdAt: 'desc' },
      select: { bodyMd: true },
    },
  },
})

const xraysForTab = xrays.map((x) => ({
  ...x,
  annotationCount: x._count.annotations,
  hasNotes: x.notes.length > 0,
  notePreview: x.notes[0]?.bodyMd?.slice(0, 80) ?? null,
}))
```

(If the page is a client component, move that logic to the corresponding API route or server component fetcher and pass the shaped data through.)

- [ ] **Step 3: Remove obsolete props from XrayUpload callers**

Confirm `XrayUpload` no longer accepts `uploadedById` (Task 2.4 already removed it). Search for any remaining `uploadedById={...}` usages and delete them:

```bash
grep -rn 'uploadedById=' src/
```

Expected: Nothing matching the JSX prop pattern (DB columns elsewhere are fine).

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 5: Manual smoke**

Open `http://localhost:3001/dashboard/patients/<a-real-patient-id>/details`, X-Rays tab. Verify:
1. Cards render with thumbnails, body region, date, annotation count.
2. Inline rename works (click title → edit → enter saves).
3. Notes drawer opens, write a note, save, reload — note persists.
4. Filter chips toggle correctly.
5. Sort dropdown reorders cards.
6. Toggle "Select" → checkboxes appear → pick 2 → click Archive in toolbar → confirm dialog → cards disappear.
7. Toggle "archived" filter chip → archived cards reappear with restore option.

- [ ] **Step 6: Commit**

```bash
git add src/components/patients/PatientXraysTab.tsx \
        src/app/dashboard/patients/[patientId]/details/page.tsx
git commit -m "feat(xray): rebuild PatientXraysTab with filters/notes/batch/restore"
```

---

## Phase 4 — Annotation Viewer Revamp

### Task 4.1: Remove orphaned calibration tool

**Files:**
- Modify: `src/types/annotation.ts`
- Modify: `src/components/annotation/AnnotationToolbar.tsx`
- Modify: `src/components/annotation/StatusBar.tsx`
- Delete: `src/components/annotation/CalibrationDialog.tsx`
- Delete: `src/app/api/xrays/[xrayId]/calibrate/route.ts`

- [ ] **Step 1: Remove `"calibration"` from ToolId**

In `src/types/annotation.ts`, change:

```ts
export type ToolId =
  | "hand"
  | "line"
  | "freehand"
  | "text"
  | "eraser"
  | "ruler"
  | "angle"
  | "cobb_angle"
```

(Drop the `| "calibration"` line.)

- [ ] **Step 2: Remove the calibration tool from the toolbar**

In `src/components/annotation/AnnotationToolbar.tsx`, remove the line `{ id: "calibration", label: "Calibration", … }` from the `tools` array. Also remove the unused `RulerDimensionLine` import from lucide.

- [ ] **Step 3: Remove "Uncalibrated" + calibration props from StatusBar**

In `src/components/annotation/StatusBar.tsx`, drop the props `isCalibrated`, `pixelsPerMm`, `calibrationNote` from the interface and any UI that renders them. Remove the corresponding usage at the StatusBar call site (`AnnotationCanvas.tsx`) — search for `isCalibrated={` and delete.

- [ ] **Step 4: Delete dead files**

```bash
rm src/components/annotation/CalibrationDialog.tsx
rm -rf src/app/api/xrays/[xrayId]/calibrate
```

- [ ] **Step 5: Verify nothing references calibration**

```bash
grep -rn 'calibration\|Calibration\|isCalibrated\|pixelsPerMm' src/
```

Expected: only schema-comment hits in `prisma/schema.prisma` (DB columns intentionally retained).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(xray): remove orphaned calibration tool, dialog, route, status text"
```

---

### Task 4.2: `useViewerInputs` hook (mouse + wheel conventions)

**Files:**
- Create: `src/hooks/useViewerInputs.ts`
- Test: `src/hooks/__tests__/useViewerInputs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { interpretWheelEvent, interpretPointerDown } from '@/hooks/useViewerInputs'

describe('useViewerInputs interpreters', () => {
  it('wheel without modifier -> scroll-series', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: false, shiftKey: false, deltaY: 100 } as WheelEvent))
      .toEqual({ kind: 'scroll-series', direction: 1 })
  })

  it('wheel with ctrl -> zoom', () => {
    expect(interpretWheelEvent({ ctrlKey: true, metaKey: false, shiftKey: false, deltaY: -50 } as WheelEvent))
      .toEqual({ kind: 'zoom', deltaY: -50 })
  })

  it('wheel with meta -> zoom (mac)', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: true, shiftKey: false, deltaY: -50 } as WheelEvent))
      .toEqual({ kind: 'zoom', deltaY: -50 })
  })

  it('wheel with shift -> window-level fine-tune', () => {
    expect(interpretWheelEvent({ ctrlKey: false, metaKey: false, shiftKey: true, deltaY: 10 } as WheelEvent))
      .toEqual({ kind: 'window-level', deltaY: 10 })
  })

  it('pointer down middle -> pan', () => {
    expect(interpretPointerDown({ button: 1 } as PointerEvent)).toEqual({ kind: 'pan' })
  })

  it('pointer down right -> window-level', () => {
    expect(interpretPointerDown({ button: 2 } as PointerEvent)).toEqual({ kind: 'window-level' })
  })

  it('pointer down left -> tool', () => {
    expect(interpretPointerDown({ button: 0 } as PointerEvent)).toEqual({ kind: 'tool' })
  })
})
```

- [ ] **Step 2: Run test (fails)**

Run: `npx vitest run src/hooks/__tests__/useViewerInputs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
'use client'

import { useEffect } from 'react'

export type WheelIntent =
  | { kind: 'zoom'; deltaY: number }
  | { kind: 'window-level'; deltaY: number }
  | { kind: 'scroll-series'; direction: 1 | -1 }

export type PointerIntent =
  | { kind: 'tool' }
  | { kind: 'pan' }
  | { kind: 'window-level' }

export function interpretWheelEvent(e: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'deltaY'>): WheelIntent {
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', deltaY: e.deltaY }
  if (e.shiftKey) return { kind: 'window-level', deltaY: e.deltaY }
  return { kind: 'scroll-series', direction: e.deltaY > 0 ? 1 : -1 }
}

export function interpretPointerDown(e: Pick<PointerEvent, 'button'>): PointerIntent {
  if (e.button === 1) return { kind: 'pan' }
  if (e.button === 2) return { kind: 'window-level' }
  return { kind: 'tool' }
}

export interface UseViewerInputsOptions {
  canvasRef: React.RefObject<HTMLElement | null>
  onPan: (dx: number, dy: number) => void
  onZoom: (deltaY: number, point: { x: number; y: number }) => void
  onWindowLevel: (dx: number, dy: number) => void
  onScrollSeries: (direction: 1 | -1) => void
}

/**
 * Wires native pointer/wheel events on the canvas root:
 *  - middle-drag -> onPan
 *  - right-drag  -> onWindowLevel (suppresses native context menu)
 *  - wheel       -> onZoom (Ctrl/Meta), onWindowLevel fine-tune (Shift), onScrollSeries (none)
 */
export function useViewerInputs({ canvasRef, onPan, onZoom, onWindowLevel, onScrollSeries }: UseViewerInputsOptions) {
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    let activeIntent: PointerIntent | null = null
    let last: { x: number; y: number } | null = null

    function onPointerDown(e: PointerEvent) {
      const intent = interpretPointerDown(e)
      if (intent.kind === 'tool') return
      e.preventDefault()
      activeIntent = intent
      last = { x: e.clientX, y: e.clientY }
      el!.setPointerCapture(e.pointerId)
    }
    function onPointerMove(e: PointerEvent) {
      if (!activeIntent || !last) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      if (activeIntent.kind === 'pan') onPan(dx, dy)
      else if (activeIntent.kind === 'window-level') onWindowLevel(dx, dy)
    }
    function onPointerUp(e: PointerEvent) {
      if (!activeIntent) return
      activeIntent = null; last = null
      try { el!.releasePointerCapture(e.pointerId) } catch {}
    }
    function onContextMenu(e: MouseEvent) { e.preventDefault() }
    function onWheel(e: WheelEvent) {
      const intent = interpretWheelEvent(e)
      if (intent.kind === 'scroll-series') {
        e.preventDefault()
        onScrollSeries(intent.direction)
      } else if (intent.kind === 'zoom') {
        e.preventDefault()
        const rect = el!.getBoundingClientRect()
        onZoom(intent.deltaY, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      } else if (intent.kind === 'window-level') {
        e.preventDefault()
        onWindowLevel(0, intent.deltaY)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel as EventListener)
    }
  }, [canvasRef, onPan, onZoom, onWindowLevel, onScrollSeries])
}
```

- [ ] **Step 4: Run tests (pass)**

Run: `npx vitest run src/hooks/__tests__/useViewerInputs.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useViewerInputs.ts src/hooks/__tests__/useViewerInputs.test.ts
git commit -m "feat(xray): add useViewerInputs hook with DICOM mouse conventions"
```

---

### Task 4.3: Repaint `AnnotationToolbar` as left rail

**Files:**
- Modify: `src/components/annotation/AnnotationToolbar.tsx`

- [ ] **Step 1: Replace the existing horizontal toolbar with a vertical rail**

Update the rendered JSX in `AnnotationToolbar.tsx`:

- Outer wrapper class becomes `flex flex-col items-center gap-1 py-2` (drop `px-2` and the horizontal `flex`).
- Each tool button retains the existing dimensions (36×36) but the active style changes to `backgroundColor: "#533afd"` + `color: "#FFFFFF"` and inactive to `backgroundColor: "rgba(255,255,255,.06)"` + `color: "#cdd5e2"`.
- Separators become full-width 1px-tall lines: `<div style={{ width: 24, height: 1, backgroundColor: "#1c2738", margin: "4px 0" }} />`.
- **Remove** the leading Undo/Redo buttons (they move to StatusBar in Task 4.7) and the trailing `?` button (moves into Adjust popover footer in Task 4.5).

The tooltip helper (`ToolTooltip`) needs to anchor to the right side of the button instead of below; change the `style` block to:

```ts
top: anchorRect.top + anchorRect.height / 2,
left: anchorRect.right + 8,
transform: 'translateY(-50%)',
```

- [ ] **Step 2: Adjust `AnnotationCanvas.tsx` to host the new rail layout**

In `src/components/annotation/AnnotationCanvas.tsx`, find the layout that currently renders `<AnnotationToolbar ... />` near the top. Move it into a vertical sidebar:

```tsx
<div className="flex flex-1 min-h-0">
  <aside
    style={{ width: 44, backgroundColor: '#0a1220', borderRight: '1px solid #1c2738' }}
    className="flex-shrink-0"
  >
    <AnnotationToolbar
      activeTool={...}
      onToolChange={...}
      // canUndo/canRedo/onUndo/onRedo/onToggleShortcuts removed from this call site
    />
  </aside>
  <div className="flex-1 relative">
    {/* canvas + series strip + first-run overlay live here */}
  </div>
</div>
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/annotation/AnnotationToolbar.tsx src/components/annotation/AnnotationCanvas.tsx
git commit -m "feat(xray): repaint AnnotationToolbar as 44px vertical left rail"
```

---

### Task 4.4: `SeriesStrip` component

**Files:**
- Create: `src/components/annotation/SeriesStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft } from 'lucide-react'

export interface SeriesXray {
  id: string
  title: string | null
  bodyRegion: string | null
  thumbnailUrl: string | null
  createdAt: string
}

interface SeriesStripProps {
  patientId: string
  currentXrayId: string
  xrays: SeriesXray[]
  onBeforeNavigate?: () => void   // e.g. flush autosave
  scrollDirection?: 1 | -1 | null // when set non-null, advances 1 step in that direction (then resets in parent)
  onNavigate?: (xrayId: string) => void
}

export function SeriesStrip({ patientId, currentXrayId, xrays, onBeforeNavigate, scrollDirection, onNavigate }: SeriesStripProps) {
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()

  // Imperatively advance when scrollDirection ticks.
  useEffect(() => {
    if (scrollDirection == null) return
    const idx = xrays.findIndex((x) => x.id === currentXrayId)
    if (idx === -1) return
    const next = xrays[idx + scrollDirection]
    if (!next) return
    onBeforeNavigate?.()
    onNavigate?.(next.id)
    router.push(`/dashboard/xrays/${patientId}/${next.id}/annotate`)
  }, [scrollDirection, xrays, currentXrayId, patientId, onBeforeNavigate, onNavigate, router])

  const width = collapsed ? 18 : 64

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-10 flex flex-col"
      style={{ width, backgroundColor: '#0a1220', borderLeft: '1px solid #1c2738', transition: 'width 150ms ease' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="h-7 flex items-center justify-center text-[#cdd5e2] hover:bg-white/5"
        aria-label={collapsed ? 'Expand series' : 'Collapse series'}
      >
        {collapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {!collapsed && (
        <ul className="flex-1 overflow-y-auto py-2 space-y-2">
          {xrays.map((x) => {
            const active = x.id === currentXrayId
            return (
              <li key={x.id} className="px-1 relative">
                {active && <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-[#533afd]" />}
                <Link
                  href={`/dashboard/xrays/${patientId}/${x.id}/annotate`}
                  onClick={() => onBeforeNavigate?.()}
                  className="block rounded-[4px] overflow-hidden border"
                  style={{ borderColor: active ? '#533afd' : 'transparent' }}
                  title={x.title ?? 'X-ray'}
                >
                  <div className="w-[56px] h-[56px] bg-[#1A1F36]">
                    {x.thumbnailUrl ? (
                      <img src={x.thumbnailUrl} alt={x.title ?? ''} className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <p className="text-[10px] text-[#cdd5e2] mt-0.5 truncate w-[56px]">
                    {x.bodyRegion ? x.bodyRegion.split('_')[0].slice(0, 4) : '—'} ·
                    {' '}{new Date(x.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/annotation/SeriesStrip.tsx
git commit -m "feat(xray): add SeriesStrip right-edge thumbnail navigator"
```

---

### Task 4.5: `FirstRunOverlay` component

**Files:**
- Create: `src/components/annotation/FirstRunOverlay.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { MousePointer2, Move, Sun, ScrollText, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

const KEY = 'smartchiro:viewer-firstrun-v1'

export function FirstRunOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(KEY)) return
    setOpen(true)
  }, [])

  function dismiss() {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, '1')
    setOpen(false)
  }

  if (!open) return null

  const tiles = [
    { icon: <Move className="w-5 h-5" />,        title: 'Pan',           desc: 'Hold middle-click and drag.' },
    { icon: <Sun className="w-5 h-5" />,         title: 'Brightness',    desc: 'Hold right-click and drag.' },
    { icon: <ScrollText className="w-5 h-5" />,  title: 'Switch X-ray',  desc: 'Scroll the wheel — no modifier.' },
    { icon: <ZoomIn className="w-5 h-5" />,      title: 'Zoom',          desc: 'Ctrl/⌘ + scroll wheel.' },
  ]

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-[6px] p-6 max-w-[480px] w-[92%] shadow-[0_8px_24px_rgba(18,42,66,.18)]">
        <div className="flex items-center gap-2 mb-1">
          <MousePointer2 className="w-4 h-4 text-[#533afd]" />
          <h3 className="text-[15px] font-medium text-[#061b31]">New mouse conventions</h3>
        </div>
        <p className="text-[13px] text-[#64748d] mb-4">SmartChiro now uses MedDream-style controls. Quick refresher:</p>
        <ul className="grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <li key={t.title} className="rounded-[4px] border border-[#e5edf5] p-3">
              <div className="text-[#533afd] mb-1">{t.icon}</div>
              <p className="text-[13px] font-medium text-[#061b31]">{t.title}</p>
              <p className="text-[12px] text-[#697386]">{t.desc}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-5">
          <Button onClick={dismiss} className="bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px]">Got it</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/annotation/FirstRunOverlay.tsx
git commit -m "feat(xray): add FirstRunOverlay for new mouse conventions"
```

---

### Task 4.6: Wire `useViewerInputs`, `SeriesStrip`, `FirstRunOverlay` into `AnnotationCanvas`

**Files:**
- Modify: `src/components/annotation/AnnotationCanvas.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { useViewerInputs } from '@/hooks/useViewerInputs'
import { SeriesStrip, type SeriesXray } from './SeriesStrip'
import { FirstRunOverlay } from './FirstRunOverlay'
```

- [ ] **Step 2: Add a series-strip ref/data prop**

`AnnotationCanvas` already receives a `xray` and `patientId`. Extend props:

```ts
interface AnnotationCanvasProps {
  // ...existing
  patientId: string
  patientSeries: SeriesXray[]    // pre-fetched by the page server component
}
```

(Update the page that renders the canvas — `src/app/dashboard/xrays/[patientId]/[xrayId]/annotate/page.tsx` — to fetch `prisma.xray.findMany({ where: { patientId, status: 'READY' }, orderBy: { createdAt: 'desc' }, select: { id, title, bodyRegion, thumbnailUrl, createdAt } })` and pass it.)

- [ ] **Step 3: Wire the hook**

Inside the canvas component, add:

```tsx
const canvasRootRef = useRef<HTMLDivElement>(null)
const [seriesScrollTick, setSeriesScrollTick] = useState<1 | -1 | null>(null)

useViewerInputs({
  canvasRef: canvasRootRef,
  onPan: (dx, dy) => {
    setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }))
  },
  onZoom: (deltaY, point) => {
    // reuse existing zoom-at-point handler
    handleZoomAtPoint(deltaY < 0 ? 1.1 : 0.9, point)
  },
  onWindowLevel: (dx, dy) => {
    setAdjustments((a) => ({
      ...a,
      brightness: Math.max(-100, Math.min(100, a.brightness + Math.round(dx / 4))),
      contrast: Math.max(-100, Math.min(100, a.contrast - Math.round(dy / 4))),
    }))
  },
  onScrollSeries: (direction) => setSeriesScrollTick(direction),
})
```

(`handleZoomAtPoint` may need a small wrapper around the existing zoom logic — refactor inline as needed to expose the focal point math.)

- [ ] **Step 4: Render the strip + overlay inside the canvas region**

```tsx
<div ref={canvasRootRef} className="relative flex-1 overflow-hidden bg-[#0f1626]">
  {/* existing canvas/svg content */}
  <SeriesStrip
    patientId={patientId}
    currentXrayId={xray.id}
    xrays={patientSeries}
    scrollDirection={seriesScrollTick}
    onNavigate={() => setSeriesScrollTick(null)}
    onBeforeNavigate={() => flushAutosave()}
  />
  <FirstRunOverlay />
</div>
```

(The existing `flushAutosave` already exists in the auto-save hook; if not, add a tiny synchronous wrapper that fires the pending save.)

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/annotation/AnnotationCanvas.tsx \
        src/app/dashboard/xrays/[patientId]/[xrayId]/annotate/page.tsx
git commit -m "feat(xray): wire useViewerInputs, SeriesStrip, FirstRunOverlay"
```

---

### Task 4.7: Move undo/redo to StatusBar; add Notes button + shortcuts in Adjust popover footer

**Files:**
- Modify: `src/components/annotation/StatusBar.tsx`
- Modify: `src/components/annotation/AnnotationHeader.tsx`
- Modify: `src/components/annotation/AnnotationCanvas.tsx`

- [ ] **Step 1: Add undo/redo to StatusBar**

In `StatusBar.tsx`, extend props:

```ts
interface StatusBarProps {
  // ...existing fields except calibration ones (already removed in 4.1)
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}
```

Render two icon buttons (Undo2 / Redo2 from lucide) on the right side of the status bar's right cluster, each `h-6 w-6 rounded-[4px] hover:bg-[#f6f9fc]`, disabled when respective flag is false.

- [ ] **Step 2: Add Notes button to AnnotationHeader**

In `AnnotationHeader.tsx`, add to props:

```ts
interface AnnotationHeaderProps {
  // ...existing
  notesCount: number
  onOpenNotes: () => void
}
```

Add a button between Adjust and Save:

```tsx
<button
  onClick={onOpenNotes}
  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm transition-colors"
  style={{ borderRadius: 4, border: '1px solid #e5edf5', backgroundColor: '#FFFFFF', color: '#273951' }}
>
  <FileText size={14} strokeWidth={1.5} />
  Notes{notesCount > 0 ? ` · ${notesCount}` : ''}
</button>
```

- [ ] **Step 3: Move "?" shortcut button into Adjust popover footer**

In the existing `AdjustPopover`, append a footer row:

```tsx
<div className="flex items-center justify-between pt-2 border-t border-[#e5edf5]">
  <button
    onClick={onShowShortcuts}
    className="text-[12px] text-[#533afd] hover:underline"
  >Keyboard shortcuts (?)</button>
</div>
```

Wire `onShowShortcuts` through props and from `AnnotationCanvas`.

- [ ] **Step 4: Wire Notes drawer in AnnotationCanvas**

```tsx
const [notesOpen, setNotesOpen] = useState(false)

// in JSX
<NotesDrawer
  xrayId={xray.id}
  xrayTitle={xray.title}
  open={notesOpen}
  onOpenChange={setNotesOpen}
/>

<AnnotationHeader
  // ...existing props
  notesCount={notesCount /* from a tiny GET on mount */}
  onOpenNotes={() => setNotesOpen(true)}
/>

<StatusBar
  // ...existing
  canUndo={canUndo}
  canRedo={canRedo}
  onUndo={undo}
  onRedo={redo}
/>
```

For `notesCount`, call the existing client hook in the canvas component:

```tsx
import { useXrayNotes } from '@/hooks/useXrayNotes'

const notesData = useXrayNotes(xray.id)
const notesCount = notesData.history.length + (notesData.current ? 1 : 0)
```

(The hook auto-fetches on mount; passing `null` to skip is unnecessary here since the canvas always has an xrayId.)

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/annotation/StatusBar.tsx \
        src/components/annotation/AnnotationHeader.tsx \
        src/components/annotation/AnnotationCanvas.tsx
git commit -m "feat(xray): move undo/redo to StatusBar; add Notes button + shortcuts entry"
```

---

## Phase 5 — Final Cleanup, Smoke, & Docs

### Task 5.1: Manual smoke test of the annotation viewer

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Hit the page**

Open `http://localhost:3001/dashboard/xrays/<patient>/<xray>/annotate` (use a seeded ID).

- [ ] **Step 3: Walk the checklist**

1. Left rail visible at 44px, dark; tools grouped by separators.
2. First-run overlay appears once per browser; "Got it" dismisses; reload doesn't re-show.
3. Middle-click drag pans. Right-click drag adjusts brightness/contrast (no native context menu).
4. Wheel (no modifier) navigates to next/prev X-ray in the patient series. Ctrl+wheel zooms. Shift+wheel changes brightness/contrast.
5. Series strip (right edge) shows thumbnails; click navigates; current is purple-bordered.
6. `Notes` button opens drawer; type → save → drawer shows under "history (1)" after another save; counter on button updates.
7. Undo/redo in status bar works after drawing a freehand stroke.
8. No "Uncalibrated" text anywhere; no Calibration tool in rail.
9. `?` opens the existing keyboard shortcuts panel (entry point now in Adjust popover footer).

- [ ] **Step 4: Capture any regressions**

If a checklist item fails, fix it in a small follow-up commit on the same branch before proceeding.

---

### Task 5.2: Build, lint, full test run

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 3: Tests**

Run: `npm run test`
Expected: All suites pass (existing + new). Note: tests hit the real Neon DB; ensure `DATABASE_URL` is set.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit any fixes from steps above**

```bash
git add -A
git commit -m "chore(xray): fix lint/typecheck/build after revamp"
# Skip if no changes.
```

---

### Task 5.3: Update `context/current-feature.md`

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Replace the "Status" + "Goals" + "Notes" sections with the completion record**

Mark the in-progress feature complete and append to History per the project pattern (see existing entries, e.g., the `Patient Detail — Deep-Linked Info` block).

```markdown
# Current Feature

## Status

Available for next feature.

## History

(prepend the new entry to the existing History list)

- 2026-04-29 **X-Ray Annotation Revamp & Management** — Patient X-Rays tab rebuilt with filter chips (body region / view type / date / archived), inline rename, kebab menu (rename / edit notes / archive / restore), batch select + archive dialog, notes drawer with versioned history (XrayNote model, 100-rev cap). Annotation viewer adopts MedDream-style mouse conventions via `useViewerInputs` (middle-drag pan, right-drag W/L, wheel-scroll-series, Ctrl+wheel zoom, Shift+wheel W/L fine-tune). Toolbar repainted as 44px dark left rail. SeriesStrip on canvas right edge with collapsible thumbnails. FirstRunOverlay teaches new conventions once per browser. Removed orphaned calibration tool/dialog/route + "Uncalibrated" status text. RBAC tightened on PATCH/DELETE/upload/upload-url via shared `canManageXray` helper (4-role × 4-route matrix tested). Notes API at GET/POST `/api/xrays/[id]/notes`. (`docs/superpowers/specs/2026-04-29-xray-annotation-revamp-and-management-design.md`)
```

- [ ] **Step 2: Commit**

```bash
git add context/current-feature.md
git commit -m "chore(context): mark X-ray annotation revamp + management complete"
```

---

### Task 5.4: Open the PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/xray-annotation-revamp-and-management
```

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --title "feat(xray): annotation revamp + patient X-Rays management" --body "$(cat <<'EOF'
## Summary
- New patient X-Rays tab: filters, inline rename, batch archive, restore, notes drawer with versioned history.
- Annotation viewer: 44px left rail, MedDream-style mouse conventions, right-edge series strip, first-run overlay.
- Tightened RBAC on all X-ray mutation routes via shared `canManageXray` helper.
- Removed orphaned calibration tool / dialog / API.

## Test plan
- [ ] `npm run lint`, `npm run test`, `npm run build` all clean
- [ ] X-Rays tab: filter, rename, batch archive, restore, notes save + history
- [ ] Annotation viewer: middle-drag pan, right-drag W/L, wheel scroll-series, Ctrl+wheel zoom
- [ ] First-run overlay shows once
- [ ] RBAC: outsider cannot rename / delete / upload (returns 404)

Spec: docs/superpowers/specs/2026-04-29-xray-annotation-revamp-and-management-design.md
EOF
)"
```

(Skip this step if the user prefers to open the PR manually.)

---

## Self-Review Notes (filled before publishing this plan)

**Spec coverage:**
- §5 XrayNote model — Task 1.1, 1.2 ✓
- §6 Permissions / `canManageXray` — Task 1.3, with RBAC matrix in Task 2.5 ✓
- §7 API surface (GET/POST notes; tightened PATCH/DELETE/upload/upload-url) — Tasks 2.1–2.8 ✓
- §8 X-Rays tab (filters, batch, notes drawer, archive/restore) — Tasks 3.1–3.7 ✓
- §9 Annotation viewer (left rail, mouse conventions, series strip, first-run overlay, header notes button, undo/redo move, calibration cleanup) — Tasks 4.1–4.7 ✓
- §11 Testing (helper unit, API RBAC + notes, hook unit) — Tasks 1.3, 2.5, 2.8, 4.2 ✓
- §13 100-rev cap — Task 2.7 ✓

**Type consistency:** `XrayCardData`, `FilterState`, `WheelIntent`, `PointerIntent`, `SeriesXray`, `XrayNotesState` are defined once and re-imported by their consumers. `BodyRegion`/`ViewType` are sourced from `@prisma/client`.

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate error handling" in any task. Every code-touching step has the exact code.

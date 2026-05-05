# Branches Tab — Full CRUD Refinement & Audit Log

**Date:** 2026-05-05
**Branch:** `feat/branches-crud-refinement`
**Author:** Claude Code (TDD orchestrator) for `jobhunters.ai.pro@gmail.com`
**Status:** Draft — awaiting approval before implementation

---

## 0. Context

The branches feature already has substantial CRUD (`POST /api/branches`, `GET/PATCH/DELETE /api/branches/[id]`, list view, settings tab, delete dialog, multi-step create dialog). This spec covers **three targeted gaps** identified in clarifying Q&A on 2026-05-05:

1. **(Q1.a)** Owners want to **edit a branch directly from the branches list** — today they have to click the card → navigate to detail page → switch to Settings tab → edit → save. We will add an `EditBranchDialog` invoked from the list page.
2. **(Q2)** **Bug**: The "Create Branch" button on `/dashboard/branches` does not appear for some sessions. Root cause is in `src/lib/auth.ts:53-60` — `branchMemberships[0]` is picked arbitrarily, so an OWNER of one branch + DOCTOR of another may end up with `session.user.branchRole === "DOCTOR"` and the button is hidden. Brand-new users with zero memberships also see no button. Fix: drop the role gate on Create.
3. **(Q3)** **Audit trail** — track who edited what when. New `BranchAuditLog` model, written by every CREATE / UPDATE / DELETE. Surface as a read-only timeline in the branch Settings tab.
4. **(Q5)** **RBAC tightening** — only OWNER can update/delete (today PATCH allows OWNER + ADMIN; that role is being demoted). DOCTOR remains read-only.

DB confirmed in sync (`npx prisma migrate status` → 17 migrations applied, no drift).

---

## 1. Goals (in scope)

- Add `EditBranchDialog` reusing the multi-step UX of `CreateBranchDialog`, pre-populated with the branch's current values, invoked from BranchCard kebab menu and list-row "Edit" action.
- Fix the missing-Create-button bug — remove `isOwner` gate from BranchListView, anyone authenticated can create a branch.
- Add `BranchAuditLog` Prisma model + migration; write log rows from `POST /api/branches`, `PATCH /api/branches/[id]`, `DELETE /api/branches/[id]`.
- New endpoint: `GET /api/branches/[id]/audit-log` (paginated, OWNER + ADMIN can read).
- New UI section in `BranchSettingsTab`: "Activity Log" — last 50 changes with actor avatar/name, action, field-level diff for UPDATE, timestamp.
- Tighten RBAC: `PATCH` and `DELETE` on `/api/branches/[id]` → OWNER only (was OWNER + ADMIN for PATCH; DELETE was already OWNER-only).
- TDD-strict: write API + component tests first, watch them fail, implement.
- Verify with manual E2E checklist on the user's seed data before opening PR.

## 2. Non-Goals (out of scope for v1)

- Soft-delete / archive (current DELETE is hard-delete with cascade — unchanged).
- Bulk operations (multi-select edit/delete).
- Branch duplication / clone.
- Restoring deleted branches from audit log.
- Field-level access control (e.g. "ADMIN can edit hours but not billing").
- Audit log retention policy / pruning (rows kept indefinitely; future migration to add TTL if volume grows).
- Audit log of member add/remove (covered by `/api/branches/[id]/members` — separate spec if needed).
- WebSocket / live updates for the activity log (page reload reads fresh).
- Diff visualization for nested JSON fields (only flat string/int columns are diffed in v1).
- Logo upload (Branch.logo field unused; defer).

## 3. Locked Decisions (from Q&A)

| # | Decision |
|---|----------|
| Q1 | Inline edit dialog on the branches list page — no navigation. |
| Q2 | Bug confirmed — fix by removing `isOwner` role gate on Create button. |
| Q3 | Audit trail required — new model + endpoint + UI timeline. |
| Q4 | Live Neon DB confirmed in sync via `prisma migrate status`. |
| Q5 | Only OWNER can edit / delete branches. ADMIN demoted to read-only on these two ops. DOCTOR unchanged (read-only). |

---

## 4. Schema Migration

**File:** `prisma/migrations/20260505000000_branch_audit_log/migration.sql`

```prisma
enum BranchAuditAction {
  CREATE
  UPDATE
  DELETE
}

model BranchAuditLog {
  id        String            @id @default(cuid())
  branchId  String            // not a FK — survives branch deletion
  action    BranchAuditAction

  // Actor
  actorId    String?          // nullable in case user is later deleted
  actorEmail String            // captured at write time, never updated
  actorName  String?

  // Diff payload
  // For CREATE: { after: {<full snapshot>} }
  // For UPDATE: { before: {<changed fields only>}, after: {<changed fields only>} }
  // For DELETE: { before: {<full snapshot>} }
  changes Json

  // Branch name at time of event (so UI can render after the branch is hard-deleted)
  branchNameAtEvent String

  createdAt DateTime @default(now())

  @@index([branchId, createdAt(sort: Desc)])
  @@index([actorId])
}
```

Why no FK on `branchId` / `actorId`: we want logs to outlive their subject (especially for DELETE rows). Both ids stay queryable but referential integrity is intentionally relaxed.

**Backfill:** none required — no historical data to seed.

---

## 5. API Changes

### 5.1 `POST /api/branches` (existing — modify)

After the existing `prisma.branch.create({...})` call:

```ts
await prisma.branchAuditLog.create({
  data: {
    branchId: branch.id,
    action: "CREATE",
    actorId: session.user.id,
    actorEmail: session.user.email!,
    actorName: session.user.name,
    branchNameAtEvent: branch.name,
    changes: { after: snapshotOf(branch) },
  },
});
```

`snapshotOf(branch)` is a small helper in `src/lib/branch-audit.ts` returning a flat plain object of the audited fields (see §5.5). No behavioural change for existing API consumers.

### 5.2 `PATCH /api/branches/[branchId]` (existing — modify)

Two changes:
1. **RBAC**: `if (!membership || membership.role !== "OWNER")` (was `=== "DOCTOR"`).
2. **Audit**: compute the diff *before* `prisma.branch.update`, write to `BranchAuditLog` after.

```ts
const before = snapshotOf(branch);
const updated = await prisma.branch.update({ where: { id: branchId }, data: updateData });
const after = snapshotOf(updated);
const diff = diffSnapshots(before, after); // { before: {<changed>}, after: {<changed>} }

if (Object.keys(diff.before).length > 0) {
  await prisma.branchAuditLog.create({
    data: { branchId, action: "UPDATE", actorId: ..., changes: diff, branchNameAtEvent: updated.name, ... },
  });
}
// No-op updates (zero changed fields) write no log row.
```

### 5.3 `DELETE /api/branches/[branchId]` (existing — modify)

Audit row is written **before** the delete, in a transaction with the delete:

```ts
await prisma.$transaction([
  prisma.branchAuditLog.create({
    data: { branchId, action: "DELETE", changes: { before: snapshotOf(branch) }, branchNameAtEvent: branch.name, ... },
  }),
  prisma.branch.delete({ where: { id: branchId } }),
]);
```

RBAC unchanged — already OWNER-only.

### 5.4 `GET /api/branches/[branchId]/audit-log` (new)

```
GET /api/branches/[branchId]/audit-log?limit=50&cursor=<cuid>

Response:
{
  entries: [
    {
      id, action, actorId, actorEmail, actorName,
      branchNameAtEvent, changes, createdAt
    },
    ...
  ],
  nextCursor: string | null
}
```

- **Auth**: 401 if no session.
- **RBAC**: 403 if caller is not OWNER or ADMIN of the branch (DOCTOR cannot read activity).
- **Order**: `createdAt DESC`.
- **Pagination**: cursor-based on `id` (since cuid is k-sortable). Default `limit=50`, max `limit=100`.
- **404** if branch deleted *and* no audit rows exist (allows reading log of a deleted branch as long as rows exist).

### 5.5 Helper module: `src/lib/branch-audit.ts` (new)

```ts
export const AUDITED_BRANCH_FIELDS = [
  "name", "address", "city", "state", "zip", "phone", "email",
  "website", "operatingHours", "treatmentRooms", "clinicType",
  "ownerName", "licenseNumber", "specialties", "insuranceProviders",
  "billingContactName", "billingContactEmail", "billingContactPhone",
] as const;

export function snapshotOf(branch: Branch): Record<string, unknown>;
export function diffSnapshots(before, after): { before: Record<string, unknown>; after: Record<string, unknown> };
```

`logo` is excluded from audit until logo upload ships. Internal fields (`id`, `createdAt`, `updatedAt`) are excluded.

---

## 6. UI Changes

### 6.1 `BranchListView` — fix Create button + add Edit dialog

**File:** `src/components/dashboard/branches/BranchListView.tsx`

- Remove `isOwner` gate on the Create button (line 129). Show for any authenticated user.
- Update `handleEdit(branchId)`: instead of `router.push(.../settings)`, set `editBranchId` + `setEditOpen(true)`.
- Render `<EditBranchDialog>` alongside `<CreateBranchDialog>` and `<DeleteBranchDialog>`.
- Pass the full `BranchWithStats` row to the edit dialog so it can pre-fill.

### 6.2 `EditBranchDialog` (new)

**File:** `src/components/dashboard/branches/EditBranchDialog.tsx`

- Same 4-step wizard structure as `CreateBranchDialog` (info → contact → hours → billing).
- Pre-populated from `branch` prop.
- Submit calls `PATCH /api/branches/[id]` with only changed fields (computed diff client-side; spec §5.2 still records the canonical server diff).
- Hide / show Edit button per row based on `branch.userRole === "OWNER"`. ADMIN sees no edit option in the kebab menu.
- Reuses internal `BranchInfoStep`, `BranchContactStep`, etc. components from `CreateBranchDialog` — extract those into `_branchFormSteps.tsx` if needed (≤60 LOC duplication threshold per project convention).

### 6.3 `BranchCard` + List-row kebab menu

- Add `<DropdownMenu>` on each card / row exposing **Edit** + **Delete** actions (OWNER only — both gated on `branch.userRole === "OWNER"`).
- DOCTOR / ADMIN see no kebab menu (or see disabled menu — TBD; default: hide).

### 6.4 `BranchSettingsTab` — Activity Log section

**File:** `src/components/dashboard/branches/BranchSettingsTab.tsx`

- Add new section below "Danger Zone": **Activity Log**.
- Fetch `GET /api/branches/[id]/audit-log` on mount.
- Render last 50 entries with:
  - **Actor**: avatar (initials fallback) + name + email tooltip.
  - **Action pill**: `Created` (green) / `Updated` (blue) / `Deleted` (red — only visible if you're somehow viewing audit for a deleted branch in future).
  - **Diff**: for UPDATE, show changed-field rows (`Phone: 03-7728-1234 → 03-7728-9999`); for CREATE, "Created branch with name X".
  - **Timestamp**: relative (`2 hours ago`) with absolute on hover.
- "Load more" button if `nextCursor` returned.
- Empty state: "No activity yet."

### 6.5 Empty / first-run state

- If user has 0 branches AND audit log table has 0 rows for them: existing EmptyState already covers this — just verify Create button now visible.

---

## 7. Type Definitions

**File:** `src/types/branch.ts` (existing — extend)

```ts
export type BranchAuditEntry = {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  branchNameAtEvent: string;
  changes:
    | { after: Record<string, unknown> }
    | { before: Record<string, unknown>; after: Record<string, unknown> }
    | { before: Record<string, unknown> };
  createdAt: string;
};
```

---

## 8. RBAC Matrix

| Action                                | OWNER | ADMIN | DOCTOR |
|---------------------------------------|:-----:|:-----:|:------:|
| `GET /api/branches`                    | ✅    | ✅    | ✅     |
| `POST /api/branches` (creates new)     | ✅    | ✅    | ✅     |
| `GET /api/branches/[id]`               | ✅    | ✅    | ✅     |
| `PATCH /api/branches/[id]`             | ✅    | ❌ 403 | ❌ 403 |
| `DELETE /api/branches/[id]`            | ✅    | ❌ 403 | ❌ 403 |
| `GET /api/branches/[id]/audit-log`     | ✅    | ✅    | ❌ 403 |
| See Edit button in BranchCard kebab    | ✅    | ❌    | ❌     |
| See Delete button in BranchCard kebab  | ✅    | ❌    | ❌     |
| See Activity Log in Settings tab       | ✅    | ✅    | ❌     |

Cross-branch leak: returns 404 (not 403) if the branch exists but caller has no membership — matches existing pattern in `/api/branches/[id]` GET.

---

## 9. File Inventory

### New (5 files)
- `prisma/migrations/20260505000000_branch_audit_log/migration.sql`
- `src/lib/branch-audit.ts`
- `src/app/api/branches/[branchId]/audit-log/route.ts`
- `src/app/api/branches/[branchId]/audit-log/__tests__/route.test.ts`
- `src/components/dashboard/branches/EditBranchDialog.tsx`
- `src/components/dashboard/branches/BranchActivityLog.tsx`
- `src/components/dashboard/branches/__tests__/EditBranchDialog.test.tsx`
- `src/components/dashboard/branches/__tests__/BranchActivityLog.test.tsx`
- `src/lib/__tests__/branch-audit.test.ts`

### Modified (5 files)
- `prisma/schema.prisma` — add `BranchAuditLog` + `BranchAuditAction` enum.
- `src/app/api/branches/route.ts` — emit `CREATE` audit row.
- `src/app/api/branches/[branchId]/route.ts` — RBAC tighten + emit `UPDATE` / `DELETE` audit rows.
- `src/app/api/branches/__tests__/route.test.ts` — extend with audit-row assertions.
- `src/app/api/branches/[branchId]/__tests__/route.test.ts` — extend with RBAC tightening + audit-row assertions.
- `src/components/dashboard/branches/BranchListView.tsx` — drop `isOwner` gate; wire EditBranchDialog.
- `src/components/dashboard/branches/BranchCard.tsx` — add kebab menu with Edit / Delete.
- `src/components/dashboard/branches/BranchSettingsTab.tsx` — mount `<BranchActivityLog>`.
- `src/types/branch.ts` — add `BranchAuditEntry`.

Estimated diff: ~600–800 LOC across 5 new + 8 modified files.

---

## 10. Implementation Order (TDD-strict)

1. **Write failing API tests:**
   - `audit-log/__tests__/route.test.ts` — auth/RBAC/list/cursor pagination.
   - Extend existing `route.test.ts` for `[branchId]` — assert audit-row created on PATCH + DELETE; assert ADMIN now gets 403 on PATCH.
   - Extend existing `route.test.ts` for `branches` — assert audit-row created on POST.
2. `prisma migrate dev --name branch_audit_log`. Verify Neon picks up the migration.
3. Implement `src/lib/branch-audit.ts` (`snapshotOf`, `diffSnapshots`) + unit tests → green.
4. Wire audit emission into POST / PATCH / DELETE → API tests green.
5. Tighten RBAC on PATCH (OWNER-only) → API tests green.
6. Implement `GET /api/branches/[id]/audit-log` route → API tests green.
7. **Write failing component tests:**
   - `EditBranchDialog.test.tsx` — pre-fills, submits diff only, closes on success.
   - `BranchActivityLog.test.tsx` — renders entries, paginates, empty state.
8. Build `EditBranchDialog` (extract shared steps from `CreateBranchDialog` into `_branchFormSteps.tsx` if duplication >60 LOC) → tests green.
9. Build `BranchActivityLog` → tests green.
10. Drop `isOwner` gate on Create button in `BranchListView`. Wire `EditBranchDialog`. Add kebab menu to `BranchCard`. Mount `<BranchActivityLog>` in `BranchSettingsTab`.
11. `npm run build` + `npm run lint` + `npm test` all green.
12. Manual E2E checklist (§11) on `jobhunters.ai.pro@gmail.com` seed.
13. Open PR `feat/branches-crud-refinement`.

---

## 11. Manual E2E Checklist

Run on `http://localhost:3000` signed in as `jobhunters.ai.pro@gmail.com`.

- [ ] `/dashboard/branches` shows **Create Branch** button (was hidden previously). Confirms Q2 bug fix.
- [ ] Click **Create Branch** → 4-step wizard → submit → new card appears in grid → activity log on its Settings tab shows 1 row: "Created branch by you, just now".
- [ ] On a branch you OWN, click kebab → **Edit** → dialog opens pre-filled → change phone → save → card updates → Settings → Activity Log shows new UPDATE row with `phone: <old> → <new>`.
- [ ] On a branch you do NOT own (you are ADMIN there), kebab → no Edit option visible. Direct PATCH via curl returns 403.
- [ ] On a branch you do NOT own (you are DOCTOR there), kebab → no menu. Direct GET on `/audit-log` returns 403.
- [ ] Click kebab → **Delete** → typed-confirm dialog → delete → card disappears. Audit log for the deleted branch is no longer reachable via UI (branch is gone) but rows persist in DB (verify via `npx prisma studio`).
- [ ] Edit a branch with no actual changes (open dialog, click Save without modifying) → no audit row written (verified via Activity Log).
- [ ] Activity Log paginates: edit phone 51 times → "Load more" appears → click → 51st row visible.
- [ ] Sign out → Activity Log endpoint returns 401.
- [ ] As DOCTOR (different account), `/dashboard/branches` shows the Create Branch button. After they create, they become OWNER of the new branch.

---

## 12. Open Questions (non-blocking)

- **Q12.1** Audit log of member add / remove → out of scope here. Flag during PR review if you want it bundled.
- **Q12.2** Should ADMIN see the kebab menu but with **disabled** (greyed-out) Edit / Delete and a tooltip explaining "OWNER only", or hide entirely? Default chosen: hide. Reverse with one-line change if you want disabled-with-tooltip.
- **Q12.3** "Load more" button vs infinite-scroll for Activity Log → defaulting to button (matches `PatientImageSidebar` convention).

---

## 13. Risks

- **Migration on production**: `BranchAuditLog` is additive — zero downtime, no backfill. Run `prisma migrate deploy` on Vercel deploy hook (already wired).
- **Audit row write failure** must not block the user action. Wrap audit writes in try/catch with `console.error` — drop the row, succeed the mutation. (Open question: do you want the opposite — fail loud if audit write fails? Default: fail-soft, log to Sentry post-MVP.)
- **`branchRole` session bug**: this spec only fixes the *symptom* (Create button hidden). Root cause — `branchMemberships[0]` arbitrary pick — should be addressed separately. Recommend opening follow-up issue: "Replace single `branchRole` in session with per-branch role lookup helper."

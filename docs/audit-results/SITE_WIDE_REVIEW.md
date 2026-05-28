# SmartChiro — Site-Wide Code Audit
_Surfaces not covered by APPOINTMENTS_TAB_REVIEW.md or AUTH_SECURITY_REVIEW.md_

---

## Summary
- Critical: 3
- High: 7
- Medium: 10
- Low: 6

---

## 🔴 Critical

### 1. Annotation GET/PUT/DELETE have no authentication or authorization
- **File**: `src/app/api/xrays/[xrayId]/annotations/[annotationId]/route.ts`
- **Line(s)**: 10–124
- **Category**: Security
- **Issue**: All three handlers — GET, PUT, DELETE — have zero auth. Any unauthenticated HTTP client can read the full `canvasState` JSON (including AI landmarks and all annotation data) of any annotation by guessing/enumerating the annotationId. PUT lets them overwrite it; DELETE lets them destroy it. There is not even a session check.
- **Fix**: Add `const session = await auth(); if (!session?.user?.id) return 401;` then call `canManageXray(session.user.id, xrayId)` — the same guard already on the sibling PATCH/DELETE `/api/xrays/[xrayId]` route.

### 2. Annotation POST accepts a caller-supplied `createdById` instead of using the session
- **File**: `src/app/api/xrays/[xrayId]/annotations/route.ts`
- **Line(s)**: 60–75
- **Category**: Security
- **Issue**: A `// TODO: Replace createdById with real auth` comment and body destructure on line 60 means any authenticated (or even unauthenticated, see #1) caller can set `createdById` to any arbitrary user ID. A doctor can create annotations attributed to the clinic owner, and the `Annotation.createdById` FK constraint does not prevent this because the value just has to be a valid User id.
- **Fix**: Remove `createdById` from the body destructure; replace with `const createdById = session.user.id` derived from the session. Remove the TODO comment.

### 3. Annotation GET list has no authentication
- **File**: `src/app/api/xrays/[xrayId]/annotations/route.ts`
- **Line(s)**: 7–48
- **Category**: Security
- **Issue**: The GET handler lists annotation summaries for any X-ray with no session check whatsoever. The X-ray existence check on line 14 is the only gate — any unauthenticated request returns the annotation list if the xrayId is valid.
- **Fix**: Add auth guard and `canManageXray` check at the top of the GET handler, mirroring the POST guard pattern.

---

## 🟠 High

### 4. DOCTOR-role user on `GET /api/patients` is not branch-scoped — they see patients across any branch if `branchId` filter is omitted
- **File**: `src/app/api/patients/route.ts`
- **Line(s)**: 136–155
- **Category**: Security
- **Issue**: When the caller is a DOCTOR (not OWNER/ADMIN), the query uses `where.doctorId = userId` (line 155) without a `branchId` constraint. A doctor who has been added as a member of Branch A but their `doctorId` appears on patients in Branch B (e.g., after data migration or seed drift) would see those cross-branch patients. The branchId filter only applies for the OWNER/ADMIN path.
- **Fix**: Add `where.branchId = activeBranchId` in the DOCTOR branch (line 155) alongside `where.doctorId = userId`, so the doctor only sees their patients within the current branch context.

### 5. `GET /api/xrays/[xrayId]` has no authentication
- **File**: `src/app/api/xrays/[xrayId]/route.ts`
- **Line(s)**: 19–60
- **Category**: Security
- **Issue**: The GET handler fetches the X-ray record (including `fileUrl`, `thumbnailUrl`, all metadata and annotation summaries) with zero authentication. Any unauthenticated client knowing or guessing an xrayId gets full X-ray metadata back.
- **Fix**: Add `const session = await auth(); if (!session?.user?.id) return 401;` and a `canManageXray` guard before the database query.

### 6. `dispatchDue` processes reminders sequentially in a tight loop — up to 200 sequential DB round-trips per cron tick
- **File**: `src/lib/reminders/dispatcher.ts`
- **Line(s)**: 75–89
- **Category**: Performance
- **Issue**: The `dispatchDue` loop fetches 200 reminder IDs then calls `await processOne(id, now)` one at a time inside a `for...of`. Each `processOne` does 2–3 additional Prisma queries plus an external HTTP/email call. Under normal load this is fine, but as the clinic count grows this will saturate the 5-minute cron window.
- **Fix**: Process in concurrent batches: `await Promise.all(due.map(({id}) => processOne(id, now).catch(e => console.error(e))))` — the per-item try/catch inside `processOne` already handles individual failures without throwing.

### 7. `POST /api/patients` — `isOwnerOrAdmin` derived from `branchMemberships[0]` only
- **File**: `src/app/api/patients/route.ts`
- **Line(s)**: 298–301
- **Category**: Security / Bug
- **Issue**: The `take: 1` on line 297 means `user?.branchMemberships[0]` is the first membership Prisma happens to return, which is non-deterministic ordering. If a user is OWNER of branch A and DOCTOR of branch B, and Prisma returns branch B first, `isOwnerOrAdmin` is false, preventing the user from assigning a custom doctor to new patients in branch A.
- **Fix**: After resolving `branchId`, look up the specific membership: `const mem = user?.branchMemberships.find(m => m.branchId === branchId)` and derive `isOwnerOrAdmin` from that.

### 8. `useDrawingTools` is 1373 lines and defines inline functions inside the render body that are re-created on every render
- **File**: `src/hooks/useDrawingTools.ts`
- **Line(s)**: 252–1373
- **Category**: Decomposition / Performance
- **Issue**: `updateAnglePreview`, `commitAngle`, `updateCobbPreview`, and `commitCobb` are declared as plain `function` statements inside the hook body (lines 1122–1209). They capture `shapes` from the render closure, so they are re-created on every render. They also mutate refs synchronously. The file is 1373 lines mixing five different tool concerns.
- **Fix**: Extract Angle and Cobb into separate helper modules (or `useRef`-based stable callbacks). Split the file into `usePolylineTool.ts`, `useAngleTool.ts`, `useCalibrateRulerTool.ts`, and `useDrawingTools.ts` (orchestrator only).

### 9. N+1 in `buildDoctorListItem` — called once per POST but runs 3 count queries after a transaction
- **File**: `src/app/api/doctors/route.ts`
- **Line(s)**: 276–310
- **Category**: Performance
- **Issue**: `buildDoctorListItem` does 4 sequential Prisma queries (`findUniqueOrThrow` + 3 `count`). This is invoked immediately after the create transaction on every `POST /api/doctors`. The three `count` calls are batched via `Promise.all`, which is correct, but the pattern is duplicated verbatim in `GET /api/doctors/[userId]` (lines 402–406), creating copy-paste debt.
- **Fix**: Merge the three count queries into the `findUniqueOrThrow` include with `_count: { select: { assignedPatients: true, visits: true, uploadedXrays: true } }` to eliminate the extra round-trips. Deduplicate with a shared helper.

### 10. `GET /api/doctors/[userId]` — no authorization check when caller is the target user
- **File**: `src/app/api/doctors/[userId]/route.ts`
- **Line(s)**: 43–57
- **Category**: Security
- **Issue**: The authorization block only runs `if (session.user.id !== userId)`. When a user fetches their own profile, no branch membership is verified at all — the check is skipped entirely. This is mostly fine for self-reads, but the handler also returns branch membership details and per-doctor stats for all branches, including branches the user may have been removed from if a membership was deleted but the profile fetch uses the cached include.
- **Fix**: Minor risk — add a comment clarifying the intentional self-read bypass, or explicitly verify the user still has at least one active membership before returning.

---

## 🟡 Medium

### 11. `POST /api/patients/[patientId]/visits` — doctorId is always set to `session.user.id`, ignoring any assigned doctor
- **File**: `src/app/api/patients/[patientId]/visits/route.ts`
- **Line(s)**: 213
- **Category**: Code Quality / Bug
- **Issue**: `doctorId: session.user.id` is hardcoded. An OWNER or ADMIN booking a visit on behalf of another doctor creates a visit attributed to themselves, not the treating doctor. No body field for `doctorId` is accepted.
- **Fix**: Accept an optional `body.doctorId`; if the caller is OWNER/ADMIN and `body.doctorId` is provided, verify it's a branch member, then use it; otherwise default to `session.user.id`.

### 12. `GET /api/patients/[patientId]` — `include=detail` triggers 3 sequential unbounded queries (allVisits fetch)
- **File**: `src/app/api/patients/[patientId]/route.ts`
- **Line(s)**: 119–133
- **Category**: Performance
- **Issue**: `prisma.visit.findMany({ where: { patientId }, select: { visitType: true } })` loads every visit for the patient with no `take` limit. A patient with hundreds of visits causes a large result set just to compute a 5-bucket count.
- **Fix**: Use `prisma.visit.groupBy({ by: ['visitType'], where: { patientId }, _count: { id: true } })` to let Postgres do the aggregation instead of fetching all rows into Node.

### 13. `GET /api/branches/[branchId]/audit-log` — deleted-branch access check is a timing-attack oracle
- **File**: `src/app/api/branches/[branchId]/audit-log/route.ts`
- **Line(s)**: 24–35
- **Category**: Security
- **Issue**: When a branch no longer exists, the endpoint reveals whether the caller authored any audit rows for that `branchId`. This is a minor information disclosure: a caller who was evicted from a branch can probe whether a particular branch ID exists in the audit log.
- **Fix**: Return 404 unconditionally for all callers when the branch no longer exists, instead of allowing partial access to the orphaned log. If audit log access after deletion is needed, gate it behind a global ADMIN role.

### 14. Reminders cron endpoint accepts both `POST` and `GET` — `GET` on a cron route that mutates state
- **File**: `src/app/api/reminders/dispatch/route.ts`
- **Line(s)**: 24–25
- **Category**: Security
- **Issue**: Exporting `GET = handler` makes the reminder dispatch (which upserts reminder rows and sends WhatsApp/email) reachable via a browser `GET` request. The `CRON_SECRET` check prevents unauthorized use, but browsers, CDN prefetch, and Next.js route prerendering can all trigger GET with no body — if `CRON_SECRET` is empty (dev), the check on line 10 short-circuits to false and the function blocks, but the surface is unnecessarily wide.
- **Fix**: Remove the `GET` export. Vercel Cron calls `POST` by default when `method` is omitted from `vercel.json` — check your config and use POST only.

### 15. `PATCH /api/patients/[patientId]` — DOCTOR role can reassign the patient to any branch member, including themselves
- **File**: `src/app/api/patients/[patientId]/route.ts`
- **Line(s)**: 290–300
- **Category**: Security
- **Issue**: The `doctorId` change path (lines 290–300) verifies the new doctor is a branch member but does not check if the caller is OWNER/ADMIN. A DOCTOR assigned to this patient can call PATCH with a different `doctorId` to reassign the patient away from themselves to any other branch member.
- **Fix**: Add a role check: only allow `doctorId` changes when the caller is OWNER or ADMIN of the branch. Derive the caller's role from `checkPatientAccess` and guard accordingly.

### 16. `GET /api/doctors/[userId]/visits` — no pagination, upper-bound is only 50
- **File**: `src/app/api/doctors/[userId]/visits/route.ts`
- **Line(s)**: 14, 42–49
- **Category**: Performance
- **Issue**: `take: limit` with `limit = min(50, ...)` means the endpoint always returns at most 50 visits with no offset/cursor pagination. The UI uses this for "recent visits" so the cap is fine, but the response includes full `subjective` and `assessment` text. For a busy doctor this could still be a large payload.
- **Fix**: Low urgency, but add cursor pagination or mark the endpoint as intentionally summary-only and strip long text fields.

### 17. `email.ts` — patient name interpolated directly into HTML email body without escaping
- **File**: `src/lib/email.ts`
- **Line(s)**: 176–205
- **Category**: Security
- **Issue**: `sendDoctorBookingNotification` interpolates `args.patientName`, `args.branchName`, `args.treatmentLabel`, and `args.bookedByName` directly into the HTML template string (lines 192–197). If any of these contain `<`, `>`, or `"` characters (e.g., a branch name like `Smith & Sons <Chiro>`), the rendered email HTML will be malformed. While this is not a stored XSS vector (the email is sent to the doctor's inbox, not rendered in the app), it can cause email rendering issues and unexpected HTML injection in email clients.
- **Fix**: Escape user-supplied values before interpolation: `const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')`.

### 18. `src/app/api/xrays/[xrayId]/route.ts` — PATCH sets `data.title = null` if title is not a string, silently clearing the title
- **File**: `src/app/api/xrays/[xrayId]/route.ts`
- **Line(s)**: 89–91
- **Category**: Code Quality / Bug
- **Issue**: `data.title = typeof title === "string" ? title.slice(0, 200) : null` — if a caller sends `title: 123` (a number), the title is silently cleared to null instead of returning a 400 validation error. This is a silent data mutation.
- **Fix**: Return a 400 if `title` is provided but not a string: `if (title !== undefined && title !== null && typeof title !== 'string') return 400`.

### 19. Schema: `Patient.status` is a plain `String?` field used as an enum without a DB-level constraint
- **File**: `prisma/schema.prisma`
- **Line(s)**: 444
- **Category**: Code Quality
- **Issue**: `status String? @default("active")` is used as a string enum (values: "active", "inactive") but Prisma does not enforce this at the DB level. Any string value can be written. The API does accept arbitrary status values via PATCH (line 331 in `[patientId]/route.ts`: `updateData.status = status || null`).
- **Fix**: Convert to a Prisma `enum PatientStatus { ACTIVE INACTIVE }` with a migration, or at minimum add allowlist validation in both POST and PATCH handlers.

### 20. `dispatchDue` — no distributed lock; concurrent cron invocations double-dispatch the same reminders
- **File**: `src/lib/reminders/dispatcher.ts`
- **Line(s)**: 75–89
- **Category**: Bug
- **Issue**: Two simultaneous cron invocations (possible on Vercel if a slow previous invocation overlaps the next tick) both query `status: PENDING, scheduledFor: { lte: now }` and get the same rows before either has updated them to SENT/FAILED. Both will call `processOne` on the same reminder, sending duplicate WhatsApp/email messages.
- **Fix**: Add an `UPDATE ... SET status = 'IN_FLIGHT' WHERE status = 'PENDING'` atomic claim step (or use `prisma.$executeRaw` with a CTE), or use Vercel's `maxDuration` + cron schedule to prevent overlap. Alternatively, use Prisma's `updateMany` with a `where: { status: 'PENDING' }` and collect updated IDs before dispatching.

---

## 🟢 Low

### 21. `src/lib/reminders/templates.ts` — `renderTemplate` does not sanitize placeholder values; a context value containing `{...}` could cause recursive expansion
- **File**: `src/lib/reminders/templates.ts`
- **Line(s)**: 25–31
- **Category**: Code Quality
- **Issue**: `tpl.replace(/\{(\w+)\}/g, ...)` replaces each placeholder with the raw context value. If `ctx.patientName` itself contains `{date}`, the replacement regex won't re-process it (JS `String.replace` with a regex is single-pass), so this is not actually exploitable — but it's worth a comment explaining this assumption.
- **Fix**: Add a one-line comment: `// Single-pass replace — substituted values are not re-scanned for placeholders`.

### 22. `src/app/api/branches/[branchId]/patients/route.ts` — no DOCTOR data-isolation; any branch member can list all branch patients
- **File**: `src/app/api/branches/[branchId]/patients/route.ts`
- **Line(s)**: 24–29, 32–33
- **Category**: Security (minor)
- **Issue**: `if (!membership) return 403` — any membership role passes, including DOCTOR. A DOCTOR can therefore list every patient in the branch, not just their own patients, via this branch-scoped endpoint. The patient-scoped endpoint enforces per-doctor isolation, but this one does not.
- **Fix**: If the caller's role is DOCTOR, add `where.doctorId = session.user.id` to the query to scope results to their own patients only.

### 23. Missing index on `Appointment.dateTime` + `branchId` composite — used together on hot calendar queries
- **File**: `prisma/schema.prisma`
- **Line(s)**: 663–668
- **Category**: Performance
- **Issue**: The calendar API queries `{ branchId, dateTime: { gte, lt } }` and the availability endpoint queries break-times and time-off with date ranges. There is a `@@index([dateTime])` and `@@index([branchId])` separately, but no composite `@@index([branchId, dateTime])`. Postgres will pick one index and scan the other, which is inefficient for a date-windowed calendar fetch.
- **Fix**: Add `@@index([branchId, dateTime])` to the `Appointment` model.

### 24. `GET /api/xrays/[xrayId]` — returns the raw `fileUrl` (public R2 URL) in the unauthenticated response
- **File**: `src/app/api/xrays/[xrayId]/route.ts`
- **Line(s)**: 52–53
- **Category**: Security (minor, contingent on #5 being fixed)
- **Issue**: Even after adding auth (see finding #5), the response includes the raw `fileUrl` which is the public R2 URL. If the R2 bucket is configured with a public CDN, the URL itself is a long-lived shareable link. Returning it in the API response lets authenticated callers extract and share the direct URL.
- **Fix**: If R2 is not using signed URLs for reads, consider returning a short-lived presigned download URL instead of the permanent public URL. This is a design decision contingent on R2 bucket policy.

### 25. `src/lib/email.ts` — `sendVerificationEmail` and `sendPasswordResetEmail` interpolate `name` into HTML without escaping
- **File**: `src/lib/email.ts`
- **Line(s)**: 49, 119
- **Category**: Security (minor)
- **Issue**: `Hi ${name},` is interpolated directly into the email HTML. User-supplied names with `<` or `>` will break the HTML in email clients. Same root cause as finding #17.
- **Fix**: Same fix — apply a minimal HTML escape to all user-supplied strings before template interpolation.

### 26. `src/middleware.ts` matcher excludes `*.png` files from auth — overly broad exclusion
- **File**: `src/middleware.ts`
- **Line(s)**: 35
- **Category**: Security (minor)
- **Issue**: The matcher regex `(?!.*\\.png$)` excludes all `.png` URLs from middleware processing, including any future `dashboard/*.png` API routes. This was added to avoid matching favicons, but the exclusion applies globally rather than only to static assets.
- **Fix**: Narrow the exclusion to `_next/` and `public/` prefixes: `'/((?!api|_next/static|_next/image|favicon.ico|public/).*)'` and let the file-extension exclusion cover only explicitly static assets.

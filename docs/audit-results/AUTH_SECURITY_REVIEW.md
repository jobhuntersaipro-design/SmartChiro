# Auth Security Review

**Date:** 2026-05-25
**Auditor:** auth-auditor agent
**Scope:** Authentication, authorization, email verification, password reset, profile management, annotation/xray access control

---

## Summary

| Severity | Count |
|----------|-------|
| 🚨 Critical | 1 |
| ❌ High | 3 |
| ⚠️ Medium | 4 |
| 💡 Low | 4 |

---

## 🚨 Critical

### 1. Annotation routes have zero authentication or authorization

- **Files:**
  - `src/app/api/xrays/[xrayId]/annotations/route.ts:6-127`
  - `src/app/api/xrays/[xrayId]/annotations/[annotationId]/route.ts:10-124`
- **Issue:** Every annotation endpoint (GET list, POST create, GET single, PUT update, DELETE) contains no authentication check whatsoever. POST literally has `// TODO: Replace createdById with real auth` and accepts `createdById` from the request body — any anonymous caller can supply an arbitrary user ID, read any patient's X-ray annotations, and overwrite or delete any annotation by guessing or enumerating annotation IDs.
- **Impact:** Unauthenticated read of all clinical annotation data (AI landmark positions, measurement coordinates, full canvas state JSON). Unauthenticated write corrupts annotation data for any patient. DELETE on guessed IDs is irrevocable.
- **Fix:** Add `auth()` + `canManageXray(session.user.id, xrayId)` at the top of every handler in both files; replace request-body `createdById` with `session.user.id`. Cross-tenant should return 404 to match convention.

---

## ❌ High

### 2. `GET /api/xrays/[xrayId]` has no authentication check

- **File:** `src/app/api/xrays/[xrayId]/route.ts:19-61`
- **Issue:** PATCH and DELETE call `auth()` + `canManageXray()`; GET skips both entirely. Any request with a valid/guessable xrayId returns the full X-ray record including `fileUrl`, `thumbnailUrl`, patient linkage, calibration data, and annotation summaries.
- **Impact:** Unauthenticated disclosure of patient X-ray file URLs and metadata. If R2 is configured for public reads, the leaked `fileUrl` permits anonymous access to actual diagnostic imagery.
- **Fix:** Mirror the PATCH/DELETE auth guard at the top of GET — 401 if no session, 404 (not 403) if `canManageXray` returns false.

### 3. No rate limiting on any auth endpoint

- **Files:** `src/app/api/auth/register/route.ts`, `src/app/api/auth/resend-verification/route.ts`, `src/app/api/auth/forgot-password/route.ts`, NextAuth credentials flow
- **Issue:** Forgot-password has a 60s per-account throttle but no IP throttle. Register and resend-verification have no throttle at all. Credentials login has none either.
- **Impact:** Unlimited verification/reset emails to any address (email-bomb). Unlimited password guessing. Account-creation spam.
- **Fix:** Add `@vercel/kv` sliding-window or `upstash/ratelimit`. Suggested limits: Register 5/15min/IP, Resend 3/hr/IP, Forgot-password 10/hr/IP, Login 10/15min/IP.

### 4. Google OAuth doesn't check `email_verified` claim

- **File:** `src/lib/auth.ts:109-176`
- **Issue:** The `signIn` callback links Google accounts to existing users by email match without verifying Google reported the email as verified (`profile.email_verified`). In edge cases (Workspace configs, delayed Google verification), an attacker controlling a Google account with the victim's email could link to the victim's SmartChiro account.
- **Fix:** Reject sign-in if `(profile as Record<string, unknown>).email_verified` is falsy:
  ```ts
  if (account?.provider === 'google' && profile?.email) {
    if (!(profile as { email_verified?: boolean }).email_verified) return false
    // ... rest
  }
  ```

---

## ⚠️ Medium

### 5. Registration leaks user existence via 409 vs 201

- **File:** `src/app/api/auth/register/route.ts:37-46`
- **Issue:** Existing email → 409 + "A user with this email already exists". New email → 201. Email enumeration trivially possible.
- **Fix:** Return 200 with the same generic message ("If this email is not already registered, a verification email has been sent.") in both branches.

### 6. `GET /api/appointments/[appointmentId]` returns 403 on cross-branch — leaks existence

- **File:** `src/app/api/appointments/[appointmentId]/route.ts:28-31`
- **Status:** **FIXED** in commit `355f5f3` (appointments-tab-review). Now returns 404.

### 7. `POST /api/patients` uses `branchMemberships[0]` for RBAC

- **File:** `src/app/api/patients/route.ts:300-301`
- **Issue:** Same as the known `auth.ts:53-60` follow-up, but in a different place. A user who is DOCTOR in branch A and OWNER in branch B may be granted OWNER privileges when creating a patient in branch A if `branchMemberships[0]` returns the OWNER row first.
- **Fix:** After resolving `branchId`, look up the specific membership: `user?.branchMemberships.find(m => m.branchId === branchId)?.role`. The GET handler at line 137-140 already does this correctly.

### 8. Google OAuth send-verification has no throttle

- **File:** `src/lib/auth.ts:153-161`
- **Issue:** Every Google sign-in for an unverified email triggers `sendVerificationEmail` with no rate check. Attacker bombs the victim's inbox by repeatedly initiating Google OAuth.
- **Fix:** Before sending, check for a recent VerificationToken row for the email; skip send if one exists within the last 5 minutes.

---

## 💡 Low

### 9. `branchMemberships[0]` arbitrary pick on credentials login

- **File:** `src/lib/auth.ts:52-60`
- **Status:** Known follow-up (tracked in `context/current-feature.md`). API routes re-query the DB so this is UI-only; severity limited.

### 10. Password complexity: only 8-char minimum

- **Files:** `src/app/api/auth/register/route.ts:30`, `reset-password/route.ts:18`, `settings/password/route.ts:11`
- **Issue:** Allows `aaaaaaaa`, `12345678`. bcrypt(12) helps but doesn't compensate for trivially-guessable passwords.
- **Fix:** Optionally add HIBP k-anonymity check or top-1000 blocklist. Consider min 12.

### 11. Cron dispatch accepts both GET and POST

- **File:** `src/app/api/reminders/dispatch/route.ts:24-25`
- **Issue:** State-mutating endpoint exposed as GET (semantically wrong). Secret-gated, so no auth bypass — design nit.
- **Fix:** Export `POST` only; configure `vercel.json` to use POST.

### 12. `GET /api/doctors/[userId]` returns 403 on cross-branch (existence leak)

- **File:** `src/app/api/doctors/[userId]/route.ts:52-57`
- **Fix:** Return 404 to match the convention used elsewhere.

---

## ✅ Passed Checks

- bcrypt cost factor 12 (above OWASP minimum) — verified at `register`, `reset-password`, `settings/password`, `doctors/route.ts:227`.
- Verification token entropy: `randomBytes(32).toString('hex')` (256 bits).
- Verification token single-use: atomic `prisma.$transaction` deletes on success.
- Password reset token TTL 1h, single-use, atomic update.
- `resend-verification` and `forgot-password` are correctly enumeration-resistant (uniform responses).
- `settings/password` requires current password (except OAuth-only accounts setting first password).
- `canManageXray` correctly scopes to BranchMember via composite unique key; returns null (not throw) so callers can 404 cleanly.
- All queries are parameterized Prisma — no `$queryRaw`/`$executeRaw` in auth-adjacent code.
- Email verification enforced on credentials login via `EmailNotVerifiedError`.
- Middleware protects all `/dashboard/*` routes via NextAuth `auth()` wrapper.
- Passwords never logged or stored plaintext.

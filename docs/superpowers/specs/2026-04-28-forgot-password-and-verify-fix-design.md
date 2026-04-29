# Forgot Password & Verify Email Link Fix — Design Spec

**Date:** 2026-04-28
**Status:** Approved (ready for plan)
**Branch (proposed):** `feat/forgot-password-and-verify-fix`

## 1. Problem

Two related auth gaps:

1. **Verify email link freezes.** When a newly registered user clicks the verification link in Gmail, the link is wrapped by Gmail (`google.com/url?q=...`) and then by Resend's click-tracking host (`resend-clicks-a.com`) before reaching `localhost:3000/api/auth/verify?token=...`. The redirect chain stalls or breaks the verification flow in practice. Diagnostic URL captured from a real Gmail inbox confirms the chain.
2. **No password reset flow.** Users who forget their password have no recovery path. There is also no path for Google-only users (signed up via OAuth, no password set) to gain a password and dual sign-in.

## 2. Goals & Non-Goals

**Goals**
- Verification links arrive in inboxes as raw `${APP_URL}/api/auth/verify?token=...` URLs (no third-party redirect wrapping).
- Self-service password reset via emailed magic link.
- Google-only users can use the reset flow to set a password, gaining email/password sign-in alongside Google.

**Non-Goals**
- Multi-factor authentication, account recovery codes, or phone-based reset.
- Centralized session revocation on password change. JWT sessions in this project cannot be invalidated server-side; this is a known, accepted trade-off carried over from the existing auth design.
- Per-IP rate limiting with a dedicated store (e.g., Upstash). A simple per-email DB throttle is sufficient for MVP.
- Replacing the magic-link verify flow with a 6-digit code. Considered and rejected in brainstorm.

## 3. Root Cause: Verify Link Freeze

Resend rewrites every link in outbound emails when **click tracking** is enabled at the domain level. The shared `smartchiro.org` domain currently has tracking ON, so all links — including the verify link — are routed through `*.resend-clicks-a.com` before redirecting to the target URL.

Confirmed via Resend documentation (deep research):
- Click and open tracking are **domain-level only**. There is no per-email override and no header workaround.
- API: `resend.domains.update(domainId, { clickTracking: false, openTracking: false })`.
- Default for new domains is OFF; tracking is on for `smartchiro.org` because it was explicitly enabled.

Therefore the fix is **a Resend configuration change, not application code**.

## 4. Solution Overview

### Part A — Disable Resend tracking on `smartchiro.org`

1. **Manual (primary):** In the Resend dashboard, navigate to Domains → `smartchiro.org` → toggle **Click tracking OFF** and **Open tracking OFF**.
2. **Programmatic (belt-and-suspenders):** Add `scripts/disable-resend-tracking.ts`, an idempotent one-shot script that reads `RESEND_API_KEY` and `RESEND_DOMAIN_ID` from env and calls `resend.domains.update(...)`. Runnable via `npx tsx scripts/disable-resend-tracking.ts`. Logs the resulting tracking flags. Source-controlled so any accidental dashboard re-enablement can be reversed by re-running the script.
3. **Documentation:** Add an "Email setup" section to `README.md` documenting that click/open tracking must remain disabled for auth emails to work, and pointing at the script.

No changes to `src/lib/email.ts`, `src/app/api/auth/verify/route.ts`, or any verify-related component.

### Part B — Forgot password feature

Standard token-based reset:

```
forgot-password page → POST /api/auth/forgot-password
                            │
                            ▼
                     send reset email
                            │
                            ▼
            user clicks link → /reset-password?token=xxx
                            │
                            ▼
                     POST /api/auth/reset-password
                            │
                            ▼
                  redirect to /login?reset=success
```

## 5. Data Model

New Prisma model in `prisma/schema.prisma`:

```prisma
model PasswordResetToken {
  id         String   @id @default(cuid())
  userId     String
  token      String   @unique
  expires    DateTime
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
}
```

Add to `User` model:
```prisma
passwordResetTokens PasswordResetToken[]
```

**Why a dedicated model rather than reusing `VerificationToken`:** the existing table is keyed by `identifier` (email) and is conceptually NextAuth's. Mixing semantics would couple two unrelated flows. A separate, FK'd table is cleaner and supports cascading delete on user removal.

Migration name: `add_password_reset_token`. Generated via `prisma migrate dev`, not `db push` (per project coding standard).

## 6. API Routes

### `POST /api/auth/forgot-password`

**Request body** (Zod-validated):
```ts
{ email: string }  // valid email, lowercased & trimmed before lookup
```

**Response:** always `200 { success: true }` regardless of outcome (no user-existence leak).

**Logic:**
1. Normalize email (lowercase, trim).
2. Look up user by email; if not found → return success silently (no token, no email).
3. **Throttle:** if a `PasswordResetToken` exists for this `userId` with `createdAt > now − 60s` → return success silently (no new token, no new email).
4. Delete any existing `PasswordResetToken` rows for this `userId` (single-active-token invariant).
5. Generate token: `randomBytes(32).toString('hex')`. Expiry: `now + 1h`.
6. Create token row.
7. Send email via new `sendPasswordResetEmail(email, name)`. Wrap in try/catch — on send failure, log the error and still return `200 { success: true }` (the response shape never reveals whether sending succeeded, to preserve the no-leak invariant).

### `POST /api/auth/reset-password`

**Request body** (Zod-validated):
```ts
{ token: string, password: string }  // password min 8 chars
```

**Responses:**
- `200 { success: true }` on success
- `400 { error: 'invalid_token' }` on missing/unknown token or orphaned (no user)
- `400 { error: 'expired_token' }` on expired token (token row also deleted)
- `400 { error: <validation message> }` on schema validation failure

**Logic:**
1. Look up token by string; if missing → `invalid_token`.
2. If `expires < now` → delete token, return `expired_token`.
3. Look up user by `token.userId`; if missing → `invalid_token`.
4. Hash new password via bcryptjs (saltRounds 12, matching existing register flow).
5. **Single transaction (`prisma.$transaction`):**
   - Update `user.password = newHash`.
   - Set `user.emailVerified = now` if currently null (a successful password reset via emailed link proves email ownership; this is what promotes Google-only users into dual sign-in).
   - Delete the `PasswordResetToken` row.
6. Return `{ success: true }`.

**Error envelope** matches existing routes (`{ error: string }` with appropriate HTTP status). Error string keys are stable so the client can branch on them without parsing copy.

## 7. Email Template

New function `sendPasswordResetEmail(email: string, name: string)` in `src/lib/email.ts`. Mirrors existing `sendVerificationEmail`:

- `from: 'SmartChiro <noreply@smartchiro.org>'`
- Subject: `Reset your SmartChiro password`
- Same Stripe-styled HTML shell (purple `#533afd` button, `#061b31` heading, `#273951` body, `#64748d` footer).
- Body copy: "Hi `${name}`, we received a request to reset your SmartChiro password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email — your password won't change."
- Button: "Reset password" → `${APP_URL}/reset-password?token=${token}`.
- Footer: "This link expires in 1 hour."

Helper for shared link generation (`createPasswordResetToken(userId)`) lives next to the existing `createVerificationToken` helper.

## 8. UI Pages

All new pages live under the existing `src/app/(auth)/` route group, inheriting the auth layout (no sidebar/topbar, centered card on `#f6f9fc`).

### `src/app/(auth)/forgot-password/page.tsx`
- Server component shell.
- Card: "Smart Chiro" purple badge, heading "Reset your password", subtext "Enter the email associated with your account and we'll send you a link to reset your password."
- Renders `<ForgotPasswordForm />`.
- "Back to sign in" link below the card.

### `ForgotPasswordForm` (client)
- Single email input (HTML5 `type="email"`, required, autocomplete `email`).
- Submit button "Send reset link" (4px radius, `#533afd`).
- Submits to `POST /api/auth/forgot-password`.
- On success → swap to confirmation state: green check icon, copy "Check your email — if an account exists with `<email>`, we've sent a reset link. The link expires in 1 hour.", and a "Back to sign in" link. (Pattern mirrors existing `RegisterForm` "check your email" state for visual consistency.)
- On network/server error → inline red error text. Never reveals whether the email matched.

### `src/app/(auth)/reset-password/page.tsx`
- Server component. Reads `?token=` from `searchParams`.
- If `token` is missing → renders an "invalid link" state with copy "This reset link is invalid." and a "Request a new reset link" button → `/forgot-password`.
- Otherwise renders `<ResetPasswordForm token={token} />`.
- Heading: "Set a new password". Subtext: "Enter a new password for your account."

### `ResetPasswordForm` (client)
- New password (min 8 chars) + confirm password fields.
- Show/hide toggle on both (eye icon, matches register form pattern).
- Client-side check: passwords match before submit.
- Submits to `POST /api/auth/reset-password`.
- On `invalid_token` / `expired_token` → swap card to error state: heading "This link expired" / "This link is invalid", body explaining, CTA "Request a new reset link" → `/forgot-password`.
- On `success` → `router.push('/login?reset=success')`.

### `/login` page changes
1. **Forgot password link.** Right-aligned, just above the password input. Color `#533afd`, no underline default, underline on hover.
2. **Success banner.** When `searchParams.reset === 'success'`, render a banner above the form: "Password updated. Sign in with your new password." Style: `#30B130` text on `#E6F4EA` background, 4px radius, 12px padding.

### Middleware
The current `src/middleware.ts` is a deny-list (only `/dashboard*` is protected; everything else is public by default), so no allowlist change is needed for unauthenticated access. We DO mirror the existing `/login` + `/register` parity by redirecting already-signed-in users away from `/forgot-password` and `/reset-password` to `/dashboard`.

## 9. Tracking Script & README

### `scripts/disable-resend-tracking.ts`
```ts
// Pseudocode (exact final form decided in implementation)
import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const domainId = process.env.RESEND_DOMAIN_ID
if (!apiKey || !domainId) { console.error('Missing env'); process.exit(1) }

const resend = new Resend(apiKey)
const { data, error } = await resend.domains.update(domainId, {
  clickTracking: false,
  openTracking: false,
})
if (error) { console.error(error); process.exit(1) }
console.log('Tracking disabled:', data)
```

Run: `npx tsx scripts/disable-resend-tracking.ts`. Idempotent (no-op if already disabled).

### `README.md`
New "Email setup" section near the existing setup docs:
- Describes the env vars (`RESEND_API_KEY`, `RESEND_DOMAIN_ID`, `NEXT_PUBLIC_APP_URL`).
- States: **Click tracking and open tracking must be disabled on the Resend domain.** Re-enabling either will cause verification and password-reset links to be wrapped through `resend-clicks-a.com`, breaking the auth flows.
- Points at `scripts/disable-resend-tracking.ts` as a one-shot idempotent enforcement.

## 10. Testing

Following the existing project pattern (confirmed by reading `src/app/api/auth/__tests__/register.test.ts` and `verify.test.ts`): Vitest with mocked Prisma, mocked bcryptjs, mocked email module via `vi.mock(...)`. Tests invoke route handlers directly with a constructed `NextRequest`. React Testing Library for components.

### `src/app/api/auth/__tests__/forgot-password.test.ts`
1. Returns success when email does not exist (no token created, no email sent).
2. Returns success when email exists; creates exactly one `PasswordResetToken` for the user; expiry ≈ 1 h from now.
3. Throttle: second call within 60 s does not create a new token row.
4. After 60 s window, second call creates a new token row and deletes the prior one.
5. Email send failure is caught and does not 500 the response.
6. Email is normalized (uppercase / whitespace input still finds the user).

### `src/app/api/auth/__tests__/reset-password.test.ts`
1. Missing token → `400 invalid_token`.
2. Unknown token → `400 invalid_token`.
3. Expired token → `400 expired_token`; token row is deleted.
4. Valid token → user's password hash differs from old; token row is deleted; `emailVerified` is set if previously null.
5. Password shorter than 8 chars → 400 with validation error.
6. Token cannot be reused: second call with same token returns `invalid_token`.
7. Google-only user (no prior password) can complete the flow; `bcrypt.compare(newPwd, user.password)` returns true afterwards.

### Component-level checks
The codebase has no React component tests today (no `@testing-library/react` dependency, no `.test.tsx` files). Rather than introducing a new test infrastructure for two small forms, component behavior is verified by manual smoke pass on the dev server: confirmation state after submit (forgot-password), passwords-don't-match inline error and expired/invalid-token swap (reset-password). If component tests are added project-wide later, the two forms become natural first targets.

### Manual / Playwright smoke (no automated browser test required)
End-to-end via dev server: register → request reset → click email link (verify link is **not** wrapped through `resend-clicks-a.com`) → set new password → sign in with new password.

### Tracking script verification
After running, manually verify in Resend dashboard that click + open tracking show OFF for `smartchiro.org`, then send yourself a test email and confirm the link is no longer wrapped.

**Test count target:** ~14 new route tests (7 forgot-password + 7 reset-password). Brings total from 311 to ~325.

## 11. Out-of-Scope / Accepted Risks

- Live JWT session revocation on password change is not implemented (consistent with the rest of the project's JWT-based auth).
- Per-IP rate limiting requires an external store and is deferred until abuse is observed.
- This spec does not modify `resend-verification` or the existing verify flow.

## 12. Files Changed

**New**
- `prisma/migrations/<timestamp>_add_password_reset_token/migration.sql`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(auth)/reset-password/ResetPasswordForm.tsx`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/api/auth/__tests__/forgot-password.test.ts`
- `src/app/api/auth/__tests__/reset-password.test.ts`
- `scripts/disable-resend-tracking.ts`

**Modified**
- `prisma/schema.prisma` — add `PasswordResetToken` model + `User.passwordResetTokens` relation.
- `src/lib/email.ts` — add `createPasswordResetToken` and `sendPasswordResetEmail`.
- `src/app/(auth)/login/page.tsx` — render the success banner when `searchParams.reset === 'success'`.
- `src/app/(auth)/login/LoginForm.tsx` — "Forgot password?" link above password input.
- `src/middleware.ts` — redirect signed-in users away from `/forgot-password` and `/reset-password` (parity with `/login`, `/register`).
- `README.md` — new "Email setup" section.
- `context/current-feature.md` — feature header per project workflow.

**No changes**
- `src/app/api/auth/verify/route.ts`, `src/app/(auth)/verify-email/page.tsx`, `src/app/api/auth/resend-verification/route.ts`, `src/lib/auth.ts`, `src/lib/auth.config.ts`.

## 13. Acceptance Criteria

1. Verification email clicked from Gmail goes directly to `${APP_URL}/api/auth/verify?token=...` with no `resend-clicks-a.com` hop.
2. User on `/login` can click "Forgot password?", submit their email, receive an email, click the link, set a new password, and sign in with that new password.
3. Submitting `/forgot-password` for a non-existent email returns the same UI state as for an existing one (no enumeration).
4. A reset token cannot be reused after a successful reset.
5. A reset token cannot be used after 1 hour.
6. A Google-only user (no password) can complete the reset flow; afterwards they can sign in via either Google or email/password.
7. After a successful reset, the user lands on `/login?reset=success` with a green banner; they are not auto-signed-in.
8. New tests pass; `npm run build` and `npm run lint` succeed.

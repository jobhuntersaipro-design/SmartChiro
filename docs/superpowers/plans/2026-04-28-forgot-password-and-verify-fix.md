# Forgot Password & Verify Email Link Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project rule (overrides skill defaults):** Do NOT auto-commit. Each "Commit" step prepares the message but the executor MUST ask the user for permission before running `git commit`.

**Goal:** Ship two related auth changes in one branch — (a) disable Resend domain-level click/open tracking so verification links arrive unwrapped, and (b) add a self-service password reset flow that also lets Google-only users gain a password.

**Architecture:** New Prisma `PasswordResetToken` model + two new auth API routes (`forgot-password`, `reset-password`) + two new pages under `src/app/(auth)/` + helper additions in `src/lib/email.ts` + a one-shot ops script. The verify-link freeze is fixed by an idempotent script and Resend dashboard toggle — no app-code changes to the existing verify flow.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 + Neon, NextAuth v5, bcryptjs (saltRounds 12), Resend SDK v6, Vitest with `vi.mock(...)` for Prisma/bcrypt/email.

**Spec:** `docs/superpowers/specs/2026-04-28-forgot-password-and-verify-fix-design.md`

**Branch:** `feat/forgot-password-and-verify-fix`

---

## File Structure (lock-in)

**New files**

| File | Responsibility |
|---|---|
| `prisma/migrations/<timestamp>_add_password_reset_token/migration.sql` | DB migration |
| `scripts/disable-resend-tracking.ts` | One-shot ops script: turn off Resend click/open tracking |
| `src/app/api/auth/forgot-password/route.ts` | POST — request reset, no-leak response, 60 s throttle |
| `src/app/api/auth/reset-password/route.ts` | POST — validate token, replace password, set emailVerified |
| `src/app/api/auth/__tests__/forgot-password.test.ts` | Route tests (mocked Prisma + email) |
| `src/app/api/auth/__tests__/reset-password.test.ts` | Route tests (mocked Prisma + bcrypt) |
| `src/app/(auth)/forgot-password/page.tsx` | Server shell — redirects logged-in users, renders form |
| `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx` | Client form, two states (input → confirmation) |
| `src/app/(auth)/reset-password/page.tsx` | Server shell — reads `?token`, renders form or invalid-state |
| `src/app/(auth)/reset-password/ResetPasswordForm.tsx` | Client form with show/hide toggles, success → redirect to /login?reset=success |

**Modified files**

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `PasswordResetToken` model + `User.passwordResetTokens` relation |
| `src/lib/email.ts` | Add `createPasswordResetToken(userId)` + `sendPasswordResetEmail(email, name, token)` |
| `src/components/auth/LoginForm.tsx` | Add "Forgot password?" link above password input; render success banner from `searchParams.reset === 'success'` (passed via prop) |
| `src/app/(auth)/login/page.tsx` | Read `searchParams.reset`, pass through to `LoginForm` |
| `src/middleware.ts` | Redirect signed-in users away from `/forgot-password` and `/reset-password` (parity with `/login`, `/register`) |
| `README.md` | Add "Email setup" section documenting required tracking-disabled state and the helper script |
| `context/current-feature.md` | Project-workflow housekeeping per `context/ai-interaction.md` |

**No changes:** `src/app/api/auth/verify/route.ts`, `src/app/api/auth/resend-verification/route.ts`, `src/app/(auth)/verify-email/page.tsx`, `src/lib/auth.ts`, `src/lib/auth.config.ts`.

---

## Task 0: Branch + feature file housekeeping

**Files:**
- Modify: `context/current-feature.md`

- [ ] **Step 1: Create the feature branch from `main`**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/forgot-password-and-verify-fix
```

Expected: switched to a new branch `feat/forgot-password-and-verify-fix`.

- [ ] **Step 2: Update `context/current-feature.md`**

Replace the **entire** content of `context/current-feature.md` with:

```markdown
# Current Feature

## Status

In Progress — feat/forgot-password-and-verify-fix

## Goals

- Fix the verify email link freeze caused by Resend domain-level click tracking.
- Add a self-service forgot-password / reset-password flow.
- Allow Google-only users to set a password via the reset flow (gain dual sign-in).

## Notes

Spec: `docs/superpowers/specs/2026-04-28-forgot-password-and-verify-fix-design.md`
Plan: `docs/superpowers/plans/2026-04-28-forgot-password-and-verify-fix.md`

## History
```

Note: do **not** delete the existing `## History` section — preserve every prior entry verbatim. The block above replaces only the `Status / Goals / Notes` portion.

- [ ] **Step 3: Commit (ASK USER FIRST)**

Proposed message:
```
chore: open feat/forgot-password-and-verify-fix branch
```

Stop and ask the user before running `git commit`. The user controls when commits land.

---

## Task 1: Prisma schema — add `PasswordResetToken`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_password_reset_token/migration.sql` (auto-generated)

- [ ] **Step 1: Add the model**

Open `prisma/schema.prisma`. Find the existing `VerificationToken` model (around line 77) and append the following **immediately after it**:

```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expires   DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
}
```

- [ ] **Step 2: Add the back-relation on `User`**

In the `User` model (top of the file), find the block of relation lines (it currently includes `accounts`, `sessions`, `branchMemberships`, `doctorProfile`, etc.). Add this line in that block:

```prisma
  passwordResetTokens PasswordResetToken[]
```

Place it next to `sessions` for readability. Exact placement is not load-bearing — Prisma is order-insensitive within a model.

- [ ] **Step 3: Generate the migration against the dev DB**

Run:
```bash
npx prisma migrate dev --name add_password_reset_token
```

Expected:
- Prisma reports "Applying migration `<timestamp>_add_password_reset_token`".
- A new directory `prisma/migrations/<timestamp>_add_password_reset_token/` is created with `migration.sql`.
- `npx prisma generate` runs implicitly; Prisma Client is regenerated.

If Prisma reports drift or asks to reset the dev DB, **stop and ask the user**. Do not auto-reset.

- [ ] **Step 4: Verify the migration SQL**

Read `prisma/migrations/<timestamp>_add_password_reset_token/migration.sql`. It should contain a `CREATE TABLE "PasswordResetToken"` statement plus two `CREATE INDEX` statements (one for `userId`, one for `expires`) and a foreign-key constraint cascading on user delete. If anything else changed (e.g., other tables were touched), `git diff prisma/schema.prisma` to investigate; do not proceed.

- [ ] **Step 5: Commit (ASK USER FIRST)**

Stage:
```bash
git add prisma/schema.prisma prisma/migrations/
```

Proposed message:
```
feat(db): add PasswordResetToken model and migration
```

Ask the user before running `git commit`.

---

## Task 2: `src/lib/email.ts` — add reset-token helpers and email sender

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Add the helpers and sender**

Open `src/lib/email.ts`. **Append** the following at the end of the file (do not modify the existing `sendVerificationEmail`):

```ts
const PASSWORD_RESET_EXPIRY_HOURS = 1

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000)

  // Single-active-token invariant: drop any prior tokens for this user
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  })

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expires,
    },
  })

  return token
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  const { error } = await resend.emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: email,
    subject: 'Reset your SmartChiro password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #533afd; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #061b31; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Reset your password
        </h1>
        <p style="color: #273951; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${name}, we received a request to reset your SmartChiro password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${resetUrl}" style="display: inline-block; background: #533afd; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Reset password
          </a>
        </div>
        <p style="color: #64748d; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${PASSWORD_RESET_EXPIRY_HOURS} hour. If you didn't request a reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5edf5; margin: 32px 0;" />
        <p style="color: #64748d; font-size: 13px; text-align: center;">
          SmartChiro — See More. Treat Better.
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('Failed to send password reset email:', error)
    throw new Error('Failed to send password reset email')
  }
}
```

Notes:
- `randomBytes`, `prisma`, `resend`, and `APP_URL` are already imported/declared at the top of `email.ts`. Do not re-import.
- Sender takes `token` as a parameter (rather than recreating it) so the route can pass through whatever was just persisted — keeps the function pure.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. (Project may have pre-existing type-check warnings — ensure no **new** ones related to `email.ts` appear.)

- [ ] **Step 3: Commit (ASK USER FIRST)**

Stage:
```bash
git add src/lib/email.ts
```

Proposed message:
```
feat(email): add createPasswordResetToken and sendPasswordResetEmail
```

Ask the user before running `git commit`.

---

## Task 3: `POST /api/auth/forgot-password` — TDD

**Files:**
- Create: `src/app/api/auth/__tests__/forgot-password.test.ts`
- Create: `src/app/api/auth/forgot-password/route.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/app/api/auth/__tests__/forgot-password.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma
const mockUserFindUnique = vi.fn()
const mockTokenFindFirst = vi.fn()
const mockTokenDeleteMany = vi.fn()
const mockTokenCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    passwordResetToken: {
      findFirst: (...args: unknown[]) => mockTokenFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockTokenDeleteMany(...args),
      create: (...args: unknown[]) => mockTokenCreate(...args),
    },
  },
}))

// Mock email
const mockCreatePasswordResetToken = vi.fn()
const mockSendPasswordResetEmail = vi.fn()

vi.mock('@/lib/email', () => ({
  createPasswordResetToken: (...args: unknown[]) => mockCreatePasswordResetToken(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/auth/forgot-password', () => {
  let POST: typeof import('../forgot-password/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    mockTokenFindFirst.mockResolvedValue(null)
    mockCreatePasswordResetToken.mockResolvedValue('generated_token_abc')
    mockSendPasswordResetEmail.mockResolvedValue(undefined)
    const mod = await import('../forgot-password/route')
    POST = mod.POST
  })

  it('returns 200 success when email does not exist (no token created, no email sent)', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest({ email: 'unknown@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns 200 and sends a reset email when the user exists', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)

    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('user_1')
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Test User',
      'generated_token_abc'
    )
  })

  it('lowercases and trims the email before user lookup', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })

    await POST(createRequest({ email: '   USER@Example.COM   ' }))

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    })
  })

  it('throttles when an existing token was created within the last 60 seconds', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    // Token created 30 seconds ago
    mockTokenFindFirst.mockResolvedValue({
      id: 'tok_1',
      createdAt: new Date(Date.now() - 30_000),
    })

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    expect(mockCreatePasswordResetToken).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('does not throttle when the latest token is older than 60 seconds', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    // Token created 90 seconds ago
    mockTokenFindFirst.mockResolvedValue({
      id: 'tok_old',
      createdAt: new Date(Date.now() - 90_000),
    })

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)

    expect(mockCreatePasswordResetToken).toHaveBeenCalledWith('user_1')
    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1)
  })

  it('still returns 200 success when the email send throws', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      name: 'Test User',
    })
    mockSendPasswordResetEmail.mockRejectedValue(new Error('Resend down'))

    const res = await POST(createRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })
  })

  it('returns 400 when email is missing or malformed', async () => {
    const res = await POST(createRequest({}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npm test -- src/app/api/auth/__tests__/forgot-password.test.ts
```

Expected: all 7 tests fail because `../forgot-password/route` doesn't exist yet (resolve error).

- [ ] **Step 3: Implement the route**

Create `src/app/api/auth/forgot-password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createPasswordResetToken,
  sendPasswordResetEmail,
} from '@/lib/email'

const THROTTLE_MS = 60_000

function isValidEmail(s: string): boolean {
  // Permissive but rejects obvious garbage
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: unknown }
    const rawEmail = typeof body.email === 'string' ? body.email : ''
    const email = rawEmail.trim().toLowerCase()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // No-leak: silent success when the user does not exist
    if (!user) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Throttle: if a token was created within the last 60s, return success silently
    const recent = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - THROTTLE_MS) },
      },
    })
    if (recent) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const token = await createPasswordResetToken(user.id)

    try {
      await sendPasswordResetEmail(user.email, user.name ?? 'there', token)
    } catch (e) {
      // Always return success to avoid revealing send failures
      console.error('forgot-password: send failed', e)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('forgot-password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
npm test -- src/app/api/auth/__tests__/forgot-password.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit (ASK USER FIRST)**

Stage:
```bash
git add src/app/api/auth/forgot-password/route.ts src/app/api/auth/__tests__/forgot-password.test.ts
```

Proposed message:
```
feat(auth): add POST /api/auth/forgot-password with no-leak + 60s throttle
```

Ask the user before running `git commit`.

---

## Task 4: `POST /api/auth/reset-password` — TDD

**Files:**
- Create: `src/app/api/auth/__tests__/reset-password.test.ts`
- Create: `src/app/api/auth/reset-password/route.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/app/api/auth/__tests__/reset-password.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Prisma — every call we observe gets its own vi.fn() so we can assert payloads
const mockTokenFindUnique = vi.fn()
const mockTokenDelete = vi.fn()
const mockUserFindUnique = vi.fn()
const mockUserUpdate = vi.fn()
const mockTokenDeleteInTxn = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: (...args: unknown[]) => mockTokenFindUnique(...args),
      // For the orphaned-user cleanup path AND the expired-token branch
      delete: (...args: unknown[]) => mockTokenDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      // Captured for transaction-payload assertions; the route invokes this
      // synchronously inside the array passed to $transaction
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_new_password'),
}))

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validBody = { token: 'tok_valid', password: 'newSecret123' }

describe('POST /api/auth/reset-password', () => {
  let POST: typeof import('../reset-password/route').POST

  beforeEach(async () => {
    vi.clearAllMocks()
    // Sensible defaults; tests override per-case
    mockTransaction.mockResolvedValue([])
    mockTokenDelete.mockResolvedValue({})
    mockUserUpdate.mockReturnValue({ __op: 'user.update' })
    const mod = await import('../reset-password/route')
    POST = mod.POST
  })

  it('returns 400 invalid_token when token is missing from the body', async () => {
    const res = await POST(createRequest({ password: 'newSecret123' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('returns 400 with validation error when password is shorter than 8 chars', async () => {
    const res = await POST(createRequest({ token: 'tok_valid', password: 'short' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Password must be at least 8 characters')
  })

  it('returns 400 invalid_token when the token row does not exist', async () => {
    mockTokenFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('returns 400 expired_token and deletes the token when expired', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() - 1000),
    })
    mockTokenDelete.mockResolvedValue({})

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('expired_token')
    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok_1' } })
  })

  it('returns 400 invalid_token when the linked user no longer exists', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'ghost',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue(null)

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid_token')
  })

  it('updates password, deletes token, and sets emailVerified when previously null', async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      emailVerified: null,
      password: 'old_hash',
    })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ success: true })

    // The route invokes prisma.user.update(...) and prisma.passwordResetToken.delete(...)
    // synchronously inside the array passed to $transaction; we can inspect both.
    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    const userUpdateArg = mockUserUpdate.mock.calls[0][0] as {
      where: { id: string }
      data: { password: string; emailVerified?: Date }
    }
    expect(userUpdateArg.where).toEqual({ id: 'user_1' })
    expect(userUpdateArg.data.password).toBe('hashed_new_password')
    expect(userUpdateArg.data.emailVerified).toBeInstanceOf(Date)

    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { id: 'tok_1' } })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('updates password but does not overwrite an already-set emailVerified', async () => {
    const existingVerified = new Date('2024-01-01T00:00:00Z')
    mockTokenFindUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      token: 'tok_valid',
      expires: new Date(Date.now() + 60_000),
    })
    mockUserFindUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      emailVerified: existingVerified,
      password: 'old_hash',
    })

    const res = await POST(createRequest(validBody))
    expect(res.status).toBe(200)

    expect(mockUserUpdate).toHaveBeenCalledTimes(1)
    const userUpdateArg = mockUserUpdate.mock.calls[0][0] as {
      data: { password: string; emailVerified?: Date }
    }
    expect(userUpdateArg.data.password).toBe('hashed_new_password')
    // The key must NOT be present at all (not "set to existing value")
    expect('emailVerified' in userUpdateArg.data).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npm test -- src/app/api/auth/__tests__/reset-password.test.ts
```

Expected: all 7 tests fail because `../reset-password/route` does not yet exist.

- [ ] **Step 3: Implement the route**

Create `src/app/api/auth/reset-password/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown
      password?: unknown
    }
    const token = typeof body.token === 'string' ? body.token : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const tokenRow = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!tokenRow) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    if (tokenRow.expires < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: tokenRow.id } })
      return NextResponse.json({ error: 'expired_token' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: tokenRow.userId } })

    if (!user) {
      // Orphaned token — clean up and reject
      await prisma.passwordResetToken.delete({ where: { id: tokenRow.id } })
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    const newHash = await hash(password, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: newHash,
          // A successful password reset via emailed link proves email ownership.
          // Promotes Google-only users into dual sign-in. Don't overwrite if already set.
          ...(user.emailVerified ? {} : { emailVerified: new Date() }),
        },
      }),
      prisma.passwordResetToken.delete({ where: { id: tokenRow.id } }),
    ])

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('reset-password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run the tests, verify they pass**

```bash
npm test -- src/app/api/auth/__tests__/reset-password.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit (ASK USER FIRST)**

Stage:
```bash
git add src/app/api/auth/reset-password/route.ts src/app/api/auth/__tests__/reset-password.test.ts
```

Proposed message:
```
feat(auth): add POST /api/auth/reset-password with token validation and bcrypt rehash
```

Ask the user before running `git commit`.

---

## Task 5: `/forgot-password` page + form

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/(auth)/forgot-password/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = {
  title: 'Forgot Password — SmartChiro',
}

export default async function ForgotPasswordPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <ForgotPasswordForm />
    </div>
  )
}
```

- [ ] **Step 2: Create the client form**

Create `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        // Only schema/validation errors land here (the route otherwise always returns 200)
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setLoading(false)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#30B130]">
            <CheckCircle2 size={24} className="text-white" />
          </div>
          <h1 className="text-[23px] font-light text-[#061b31]">
            Check your email
          </h1>
          <p className="mt-2 text-[15px] text-[#273951] leading-relaxed">
            If an account exists with{' '}
            <span className="font-medium text-[#061b31]">{email}</span>, we&apos;ve sent a reset link.
            <br />
            The link expires in 1 hour.
          </p>
        </div>

        <p className="mt-6 text-center text-[14px] text-[#64748d]">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-[#533afd] hover:text-[#4434d4] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-[#061b31]">
          Reset your password
        </h1>
        <p className="mt-1 text-[15px] text-[#64748d]">
          Enter the email associated with your account
        </p>
      </div>

      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white p-6"
        style={{
          boxShadow:
            'rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
            />
          </div>

          {error && <p className="text-[14px] text-[#DF1B41]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4] disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset link'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[14px] text-[#64748d]">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-[#533afd] hover:text-[#4434d4] transition-colors"
        >
          <ArrowLeft size={14} />
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Visual smoke test**

Start the dev server:
```bash
npm run dev
```

Navigate to `http://localhost:3000/forgot-password`. Confirm:
- Page renders the centered card.
- Submitting an email shows the green "Check your email" state with the email echoed back.
- The "Back to sign in" link returns to `/login`.

Do NOT continue if anything looks broken — fix style issues (e.g., missing imports) inline before moving on.

- [ ] **Step 4: Commit (ASK USER FIRST)**

Stage:
```bash
git add "src/app/(auth)/forgot-password/"
```

Proposed message:
```
feat(auth): add /forgot-password page and form
```

Ask the user before running `git commit`.

---

## Task 6: `/reset-password` page + form

**Files:**
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/app/(auth)/reset-password/ResetPasswordForm.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/(auth)/reset-password/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = {
  title: 'Reset Password — SmartChiro',
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const session = await auth()
  if (session) redirect('/dashboard')

  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 text-center flex flex-col items-center">
            <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
              <span className="text-[14px] font-bold text-white">Smart Chiro</span>
            </div>
            <h1 className="text-[23px] font-light text-[#061b31]">
              Invalid reset link
            </h1>
            <p className="mt-2 text-[15px] text-[#273951]">
              This password reset link is invalid.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4]"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <ResetPasswordForm token={token} />
    </div>
  )
}
```

- [ ] **Step 2: Create the client form**

Create `src/app/(auth)/reset-password/ResetPasswordForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkState, setLinkState] = useState<'ok' | 'invalid' | 'expired'>('ok')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data.error === 'invalid_token') {
          setLinkState('invalid')
          setLoading(false)
          return
        }
        if (data.error === 'expired_token') {
          setLinkState('expired')
          setLoading(false)
          return
        }
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      router.push('/login?reset=success')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (linkState !== 'ok') {
    const title = linkState === 'expired' ? 'This link has expired' : 'Invalid reset link'
    const body =
      linkState === 'expired'
        ? 'Your password reset link has expired. Request a new one to continue.'
        : 'This password reset link is invalid or has already been used.'

    return (
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
            <span className="text-[14px] font-bold text-white">Smart Chiro</span>
          </div>
          <h1 className="text-[23px] font-light text-[#061b31]">{title}</h1>
          <p className="mt-2 text-[15px] text-[#273951]">{body}</p>
        </div>

        <Link
          href="/forgot-password"
          className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4]"
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="mb-4 rounded-[6px] bg-[#533afd] px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-light text-[#061b31]">Set a new password</h1>
        <p className="mt-1 text-[15px] text-[#64748d]">Enter a new password for your account</p>
      </div>

      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white p-6"
        style={{
          boxShadow:
            'rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
            >
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="h-[40px] w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 pr-10 text-[15px] text-[#061b31] placeholder-[#64748d] transition-colors focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] cursor-pointer"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-[14px] text-[#DF1B41]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex h-[40px] w-full items-center justify-center rounded-[4px] bg-[#533afd] text-[15px] font-medium text-white transition-colors hover:bg-[#4434d4] disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Visual smoke test**

With the dev server still running, navigate to:
- `http://localhost:3000/reset-password` (no token) — should render the "Invalid reset link" card with the CTA button to `/forgot-password`.
- `http://localhost:3000/reset-password?token=fake_test_token` — should render the form.

Submitting with `fake_test_token` will return `invalid_token` from the API; the form should swap to the "Invalid reset link" state.

- [ ] **Step 4: Commit (ASK USER FIRST)**

Stage:
```bash
git add "src/app/(auth)/reset-password/"
```

Proposed message:
```
feat(auth): add /reset-password page and form
```

Ask the user before running `git commit`.

---

## Task 7: Login page — "Forgot password?" link + reset success banner

**Files:**
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Add the success banner prop and "Forgot password?" link**

Open `src/components/auth/LoginForm.tsx`. Make three changes:

1. **Update the prop signature** (line 10):

Change:
```tsx
export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
```
to:
```tsx
export function LoginForm({
  googleEnabled = false,
  resetSuccess = false,
}: {
  googleEnabled?: boolean
  resetSuccess?: boolean
}) {
```

2. **Add a success banner** above the existing `<form ...>` (just inside the `<div className="rounded-[6px] border ...">` opening, before the form). Insert:

```tsx
{resetSuccess && (
  <div className="mb-4 rounded-[4px] border border-[#30B130]/30 bg-[#E8F5E9] p-3">
    <p className="text-[14px] font-medium text-[#0A5D1A]">Password updated</p>
    <p className="mt-1 text-[13px] text-[#273951]">
      Sign in with your new password.
    </p>
  </div>
)}
```

3. **Add a "Forgot password?" link** above the password input. Find the password `<label>` block (around line 102):

```tsx
<label
  htmlFor="password"
  className="mb-1.5 block text-[14px] font-medium text-[#061b31]"
>
  Password
</label>
```

Replace it with:

```tsx
<div className="mb-1.5 flex items-center justify-between">
  <label
    htmlFor="password"
    className="block text-[14px] font-medium text-[#061b31]"
  >
    Password
  </label>
  <Link
    href="/forgot-password"
    className="text-[13px] text-[#533afd] hover:underline transition-colors"
  >
    Forgot password?
  </Link>
</div>
```

(`Link` is already imported at the top of the file.)

- [ ] **Step 2: Pass the reset flag from the server page**

Open `src/app/(auth)/login/page.tsx`. Replace the entire file with:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In — SmartChiro',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const session = await auth()
  if (session) redirect('/dashboard')

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  const { reset } = await searchParams
  const resetSuccess = reset === 'success'

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <LoginForm googleEnabled={googleEnabled} resetSuccess={resetSuccess} />
    </div>
  )
}
```

- [ ] **Step 3: Visual smoke test**

With the dev server running, navigate to:
- `http://localhost:3000/login` — should show the existing form with a "Forgot password?" link to the right of the "Password" label, no banner.
- `http://localhost:3000/login?reset=success` — should show the same form with a green "Password updated" banner above the email input.
- Clicking "Forgot password?" navigates to `/forgot-password`.

- [ ] **Step 4: Commit (ASK USER FIRST)**

Stage:
```bash
git add src/components/auth/LoginForm.tsx "src/app/(auth)/login/page.tsx"
```

Proposed message:
```
feat(auth): add Forgot password link and reset success banner to login
```

Ask the user before running `git commit`.

---

## Task 8: Middleware — redirect signed-in users away from forgot/reset pages

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Extend the existing logged-in redirect**

Open `src/middleware.ts`. Find this block (current line 16-18):

```ts
  // Redirect logged-in users away from login/register
  if ((pathname === '/login' || pathname === '/register') && isLoggedIn) {
    return Response.redirect(new URL('/dashboard', req.url))
  }
```

Replace with:

```ts
  // Redirect logged-in users away from auth pages
  if (
    (pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-password') &&
    isLoggedIn
  ) {
    return Response.redirect(new URL('/dashboard', req.url))
  }
```

- [ ] **Step 2: Visual smoke test**

With the dev server running and logged in (use the demo account from seed if available):
- Navigate to `http://localhost:3000/forgot-password` — should redirect to `/dashboard`.
- Navigate to `http://localhost:3000/reset-password?token=anything` — should redirect to `/dashboard`.

Then sign out and confirm both pages render normally for unauthenticated users.

- [ ] **Step 3: Commit (ASK USER FIRST)**

Stage:
```bash
git add src/middleware.ts
```

Proposed message:
```
feat(auth): redirect signed-in users away from forgot/reset pages
```

Ask the user before running `git commit`.

---

## Task 9: Disable Resend tracking — script + dashboard toggle

**Files:**
- Create: `scripts/disable-resend-tracking.ts`
- Modify: `README.md`

- [ ] **Step 1: Create the script**

Create `scripts/disable-resend-tracking.ts`:

```ts
/**
 * One-shot ops script: disable Resend domain-level click + open tracking.
 *
 * Why this exists: Resend tracking rewrites every link to route through
 * resend-clicks-a.com, which breaks the verify-email and password-reset
 * flows (Gmail double-wraps and the redirect chain hangs). Tracking is
 * domain-level only — there is no per-email override.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx RESEND_DOMAIN_ID=dom_xxx npx tsx scripts/disable-resend-tracking.ts
 */
import { Resend } from 'resend'

async function main() {
  const apiKey = process.env.RESEND_API_KEY
  const domainId = process.env.RESEND_DOMAIN_ID

  if (!apiKey) {
    console.error('Missing RESEND_API_KEY env var.')
    process.exit(1)
  }
  if (!domainId) {
    console.error('Missing RESEND_DOMAIN_ID env var.')
    console.error('Find your domain ID at https://resend.com/domains')
    process.exit(1)
  }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.domains.update(domainId, {
    clickTracking: false,
    openTracking: false,
  })

  if (error) {
    console.error('Failed to update domain tracking settings:', error)
    process.exit(1)
  }

  console.log('Tracking disabled successfully:')
  console.log(JSON.stringify(data, null, 2))
}

main()
```

- [ ] **Step 2: Document required env vars and the script in README**

Open `README.md`. Append a new section at the bottom (or after any existing setup section). The exact content:

```markdown
## Email setup (Resend)

SmartChiro sends auth emails (verification + password reset) via Resend. **Click and open tracking must be disabled** on the sender domain — Resend's tracking rewrites every link through `*.resend-clicks-a.com`, which breaks the verify and reset flows (Gmail double-wraps the URL and the redirect chain stalls).

Required env vars:

- `RESEND_API_KEY` — your Resend API key (`re_…`)
- `RESEND_DOMAIN_ID` — the domain ID for `smartchiro.org`, found at <https://resend.com/domains>
- `NEXT_PUBLIC_APP_URL` — public app URL used in email links (e.g., `http://localhost:3000` in dev, your prod URL otherwise)

To turn tracking off (manual):

1. Open the Resend dashboard → Domains → `smartchiro.org`.
2. Toggle **Click tracking** OFF and **Open tracking** OFF.

Or run the idempotent enforcement script:

```bash
RESEND_API_KEY=re_xxx RESEND_DOMAIN_ID=dom_xxx npx tsx scripts/disable-resend-tracking.ts
```

Re-run any time tracking is accidentally re-enabled.
```

- [ ] **Step 3: Run the script**

Manual step (do once per environment):

```bash
RESEND_API_KEY=$RESEND_API_KEY RESEND_DOMAIN_ID=$RESEND_DOMAIN_ID npx tsx scripts/disable-resend-tracking.ts
```

Expected output: a JSON object echoing the domain config with `click_tracking: false` and `open_tracking: false`. If `RESEND_DOMAIN_ID` is not yet set in the executor's env, **stop and ask the user** for the value (it is found at <https://resend.com/domains>).

- [ ] **Step 4: Verify in the Resend dashboard**

Open <https://resend.com/domains>, click on `smartchiro.org`, and confirm both tracking toggles show OFF.

- [ ] **Step 5: Commit (ASK USER FIRST)**

Stage:
```bash
git add scripts/disable-resend-tracking.ts README.md
```

Proposed message:
```
chore(email): add disable-resend-tracking script and Email setup README section
```

Ask the user before running `git commit`.

---

## Task 10: End-to-end manual smoke + final checks

This task is verification only — no new code, no commits.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Test count should be the prior 311 plus the 14 new tests added in Tasks 3 and 4 (≈ 325). If any pre-existing test fails, investigate before proceeding — it likely means a refactor inadvertently touched something else.

- [ ] **Step 2: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: lint clean, build succeeds. Per `context/ai-interaction.md`: "Do NOT commit without permission and until the build passes."

- [ ] **Step 3: Manual end-to-end (dev server)**

```bash
npm run dev
```

Verify the full happy path:

1. Sign out if signed in.
2. Use a real email you control. Register a fresh account at `/register`.
3. Open the verification email in Gmail. **Hover over the "Verify email address" button** and read the URL in the bottom-left of the browser. Confirm it is a direct `http://localhost:3000/api/auth/verify?token=...` link with no `resend-clicks-a.com` hop. (If the link still goes through `resend-clicks-a.com`, Task 9 has not been completed for this environment — return to Task 9 Step 3.)
4. Click the link. Confirm the page lands on `/verify-email?status=success`.
5. Go to `/login`, click "Forgot password?", enter the email you just registered.
6. Confirm the "Check your email" confirmation card appears.
7. Open the reset email. Hover the "Reset password" button — it should be a direct `http://localhost:3000/reset-password?token=...` link.
8. Click it. On the reset page, set a new password (≥ 8 chars), confirm, submit.
9. Page should redirect to `/login?reset=success` with the green "Password updated" banner.
10. Sign in with the new password. Confirm landing on `/dashboard`.
11. Sign out, click "Forgot password?" again with a non-existent email — confirm the same "Check your email" UI is shown (no leak).

- [ ] **Step 4: Update `context/current-feature.md` history**

Append a new entry to the bottom of the `## History` section in `context/current-feature.md`. Use today's date (`2026-04-28`), and follow the existing entry style:

```markdown
- 2026-04-28 **Forgot Password & Verify Email Link Fix** — Disabled Resend domain-level click/open tracking via one-shot script (`scripts/disable-resend-tracking.ts`) so verify links arrive unwrapped (no more `resend-clicks-a.com` redirect freeze). New `PasswordResetToken` model with cascade-on-user-delete. New `/forgot-password` and `/reset-password` pages, `POST /api/auth/forgot-password` (no-leak response, 60 s per-email throttle), `POST /api/auth/reset-password` (validates token, bcrypt rehash, single transaction, sets `emailVerified` if previously null — promotes Google-only users to dual sign-in). Login page gains a "Forgot password?" link and a green "Password updated" banner via `?reset=success`. Middleware redirects signed-in users away from forgot/reset pages. README "Email setup" section documents required tracking-disabled state. 14 new unit tests (~325 total). (`docs/superpowers/specs/2026-04-28-forgot-password-and-verify-fix-design.md`)
```

Then reset the top of the file to the empty default (matches the project's per-feature flow). The final state of `context/current-feature.md` should be:

```markdown
# Current Feature

## Status

Not Started

## Goals

## Notes

## History

…(all prior entries unchanged)…

- 2026-04-28 **Forgot Password & Verify Email Link Fix** — …(entry from above)…
```

- [ ] **Step 5: Commit (ASK USER FIRST)**

Stage:
```bash
git add context/current-feature.md
```

Proposed message:
```
chore: record forgot-password feature in current-feature history
```

Ask the user before running `git commit`.

- [ ] **Step 6: Open the PR (ASK USER FIRST)**

After all commits land on `feat/forgot-password-and-verify-fix`, ask the user whether to open a PR. If they say yes, push the branch and run `gh pr create` per the standard pattern in `CLAUDE.md`.

```bash
git push -u origin feat/forgot-password-and-verify-fix
gh pr create --title "feat: forgot password flow + Resend tracking fix" --body "$(cat <<'EOF'
## Summary
- Disabled Resend domain-level click/open tracking so verify links arrive unwrapped
- Added forgot-password / reset-password flow with no-leak response and 60s throttle
- Google-only users can set a password via reset → dual sign-in

## Test plan
- [ ] `npm test` — 14 new tests pass, total ~325
- [ ] `npm run build` and `npm run lint` clean
- [ ] Manual: register → verify link is a direct `localhost:3000` URL → forgot-password → reset → sign in with new password
- [ ] Manual: forgot-password for non-existent email shows same UI (no enumeration)
EOF
)"
```

Per CLAUDE.md, do not push to remote unless explicitly asked.

---

## Acceptance Criteria (mirror of spec §13)

1. Verification email link in Gmail goes directly to `${APP_URL}/api/auth/verify?token=...` — no `resend-clicks-a.com` hop. (Task 9, Task 10 Step 3)
2. User on `/login` clicks "Forgot password?", submits email, receives email, clicks link, sets new password, signs in. (Tasks 5–8, Task 10 Step 3)
3. Submitting `/forgot-password` for a non-existent email returns the same UI as for an existing one. (Task 3 test 1, Task 10 Step 3 #11)
4. Reset token cannot be reused after a successful reset. (Task 4 test "updates password, deletes token…")
5. Reset token cannot be used after 1 hour. (Task 4 test "expired_token", Task 2 `PASSWORD_RESET_EXPIRY_HOURS = 1`)
6. Google-only user (no password) can complete the reset flow; afterwards `bcrypt.compare(newPwd, user.password)` succeeds and `emailVerified` is set. (Task 4 implementation: `...(user.emailVerified ? {} : { emailVerified: new Date() })`)
7. After a successful reset, the user lands on `/login?reset=success` with a green banner; not auto-signed-in. (Task 6 form, Task 7 banner)
8. New tests pass; `npm run build` and `npm run lint` succeed. (Task 10)

---

## Notes for the executor

- **Always ask before committing.** This project's `context/ai-interaction.md` mandates it.
- **Use `prisma migrate dev`, never `prisma db push`** — see `context/coding-standard.md`.
- **Tailwind v4: no `tailwind.config.ts`.** All theme tokens live in `src/app/globals.css` `@theme` block. The styles in this plan use explicit hex codes (matching existing forms) so no theme changes are needed.
- **Don't refactor the existing verify flow.** It is correct; the freeze is a Resend config issue.
- **Test mocking style:** mirror `register.test.ts` and `verify.test.ts` exactly. `vi.mock('@/lib/prisma', ...)` etc. No real-DB integration.

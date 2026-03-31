# Login Page Specification

## Overview

Create a login page at `/login` with NextAuth v5 integration. Users authenticate via email/password or Google OAuth. After login, users select whether they are logging in as a **Branch Owner** or **Branch Staff**, which determines their clinic-level role and post-login experience.

## Requirements

### 1. NextAuth v5 Setup

- Install and configure `next-auth@5` with Prisma adapter
- Configure two providers:
  - **Credentials** — email + password (bcryptjs verification against `User.password`)
  - **Google** — OAuth via `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env vars
- Auth config file at `src/lib/auth.ts` (export `handlers`, `signIn`, `signOut`, `auth`)
- API route at `src/app/api/auth/[...nextauth]/route.ts`
- Session strategy: **JWT** (stateless, no DB session lookups)
- Include `user.id`, `user.role`, and `user.clinicRole` in the JWT and session

### 2. Login Page (`/login`)

- Route: `src/app/(auth)/login/page.tsx`
- Full-page centered layout with white card on `#F6F9FC` background
- SmartChiro logo/branding at top of card
- **Role selector** — two clickable cards at the top of the form:
  - **Branch Owner** — icon: `Building2`, description: "Manage your clinic, staff, and patients"
  - **Branch Staff** — icon: `UserCheck`, description: "Access assigned patients and tools"
  - Selected card gets `#F0EEFF` background + `#635BFF` border
  - Default selection: Branch Owner
- **Email/password form** below the role selector:
  - Email input (required, type="email")
  - Password input (required, type="password", show/hide toggle)
  - "Sign in" primary button (`#635BFF`)
  - Form validation with error messages (invalid credentials, account not found)
- **Divider** — "or continue with" separator line
- **Google sign-in button** — white bg, Google logo, "Sign in with Google" text
- **Footer link** — "Don't have an account? Contact your clinic admin" (no self-signup for now)
- Redirect to `/dashboard` on successful login
- If already authenticated, redirect away from `/login` to `/dashboard`

### 3. Schema Changes

#### Rename `ClinicRole` values to match Branch Owner / Branch Staff concept

Current `ClinicRole` enum: `OWNER | DOCTOR | ADMIN | VIEWER`

**Add a new `loginRole` field to `ClinicMember`** to distinguish the login context:

```prisma
// No enum changes needed — map login roles to existing ClinicRole:
// "Branch Owner"  → ClinicRole.OWNER
// "Branch Staff"  → ClinicRole.DOCTOR (default for staff)
```

The role selector on the login page determines which `ClinicMember` record to look up:
- **Branch Owner** — user must have a `ClinicMember` with `role: OWNER` for at least one clinic. If none exists, show error: "No clinic found. Please create a clinic first."
- **Branch Staff** — user must have a `ClinicMember` with `role: DOCTOR | ADMIN | VIEWER` for at least one clinic. If none exists, show error: "You are not assigned to any clinic."

#### Add `activeClinicId` to User

```prisma
model User {
  // ... existing fields
  activeClinicId String?  // last-selected clinic for session context
}
```

This stores the user's currently active clinic so the dashboard knows which clinic's data to show. Set on login based on the first matching `ClinicMember` for the selected role.

### 4. Middleware (`src/middleware.ts`)

- Protect all `/dashboard/*` routes — redirect unauthenticated users to `/login`
- Allow public access to: `/`, `/login`, `/api/auth/*`
- Use `next-auth/middleware` or manual JWT check

### 5. Auth Utilities

- `src/lib/auth.ts` — NextAuth config with providers, callbacks, adapter
- `src/lib/auth-utils.ts` — helper functions:
  - `getCurrentUser()` — get authenticated user from session (server-side)
  - `requireAuth()` — throw/redirect if not authenticated
  - `getUserClinicRole(userId, clinicId)` — fetch user's role for a specific clinic

### 6. Seed Data Update

Update `prisma/seed.ts` to create:
- A `Clinic` record: "SmartChiro Demo Clinic"
- A `ClinicMember` linking demo user as `OWNER` of the demo clinic
- Set `activeClinicId` on the demo user

This ensures `demo@smartchiro.org` / `12345678` can log in as Branch Owner immediately.

## UI Design

Follow the Stripe-inspired design system from `context/project-overview.md`:
- Card: white bg, `rounded-[6px]`, `shadow-card`, 1px `#E3E8EE` border
- Buttons: `rounded-[4px]`, primary `#635BFF`, 32px height
- Inputs: 1px `#E3E8EE` border, `rounded-[4px]`, `#F6F9FC` bg, focus ring `#635BFF`
- Text: headings `#0A2540`, body `#425466`, muted `#697386`
- Role cards: 1px border, `rounded-[6px]`, hover `#F0F3F7`, selected `#F0EEFF` bg + `#635BFF` border
- Font sizes: 15% larger than Stripe defaults per design system spec

## Component Structure

```
src/app/(auth)/login/page.tsx          — Login page (server component, redirect if authed)
src/components/auth/LoginForm.tsx       — Client component with form + role selector
src/components/auth/RoleSelector.tsx    — Branch Owner / Branch Staff toggle cards
src/components/auth/GoogleSignInButton.tsx — Google OAuth button
src/components/auth/AuthCard.tsx        — Shared card wrapper with logo
```

## Environment Variables

```env
AUTH_SECRET=           # Generate with `npx auth secret`
AUTH_GOOGLE_ID=        # Google OAuth client ID
AUTH_GOOGLE_SECRET=    # Google OAuth client secret
```

## Dependencies

```bash
npm install next-auth@5 @auth/prisma-adapter
```

## References

- @context/project-overview.md — design system, tech stack
- @context/coding-standard.md — Tailwind v4, component patterns
- @prisma/schema.prisma — current schema
- @prisma/seed.ts — seed script to update

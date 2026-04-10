# Current Feature

## Status

Completed

## Goals

N/A — see next feature below.

## Next Up: Database Restructuring (Clinic → Branch, Role System)

Rename Clinic → Branch, replace roles with OWNER/ADMIN/DOCTOR, add Patient.practitionerId for data isolation, fix dangling string FKs. See conversation history for full proposal.

## History

<!-- Keep this updated. Earliest to latest -->

- 2026-03-31 **Dashboard UI Phase 1** — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- 2026-03-31 **Dashboard UI Phase 2** — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- 2026-03-31 **Prisma + Neon PostgreSQL Setup** — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)
- 2026-03-31 **User Table: Pro & Stripe Columns** — Added isPro, phoneNumber, stripeCustomerId, stripeSubscriptionId columns to User model with Prisma migration (`context/features/seed-spec.md`)
- 2026-03-31 **Seed Data Script** — Prisma seed script with demo user (demo@smartchiro.org), bcryptjs password hashing, upsert for idempotency (`context/features/seed-spec.md`)
- 2026-03-31 **X-Ray Upload & Storage** — Prisma enums (XrayStatus, BodyRegion, ViewType, CalibrationMethod), Xray model updates, R2 presigned upload flow, upload-url and confirm API routes, client-side validation & thumbnail generation, XrayUpload component with drag-drop and progress UX, Vitest setup with 21 tests (`context/features/xray-annotation-part1-spec.md`)
- 2026-03-31 **X-Ray Annotation Canvas Engine** — Canvas layout (dark #1A1F36 canvas + light chrome), viewport with zoom/pan (5%-3200%), tool state machine, undo/redo command pattern (100-cap), image adjustments (brightness/contrast/invert/window-level via CSS filters), auto-save (30s interval + beacon), selection system with transform handles, properties panel with layers tab, annotation API route, X-rays listing page (`context/features/xray-annotation-part2-spec.md`)
- 2026-03-31 **X-Ray Annotation Drawing Tools** — Shape type system (8 shape types), drawing tool behaviors with pointer events and modifier keys, eraser tool, keyboard shortcuts, default styles and color presets, properties panel, ShapeRenderer with SVG rendering, inline text editor, server-side upload proxy (R2 CORS fix), X-rays page with upload UI, 25 unit tests (`context/features/xray-annotation-part3-spec.md`)
- 2026-03-31 **X-Ray Annotation Measurement Tools** — Ruler (M), Angle (Shift+M), Cobb Angle (Cmd+Shift+M), Calibration Reference (K) tools, measurement computation library, SVG rendering with end ticks/label pills/arc indicators/perpendicular construction lines, calibration dialog with mm/px conversion, calibrate API endpoint (PUT/DELETE), measurement properties panel with classification badges, measurements summary tab, teal #00D4AA measurement style + yellow #FFCC00 calibration style, 20 unit tests (`context/features/xray-annotation-part4-spec.md`)
- 2026-03-31 **X-Ray Annotation API & Export** — X-ray CRUD (GET list/single, PATCH, DELETE archive), annotation CRUD (GET/POST/PUT/DELETE + fork), PNG/PDF export pipeline (sharp SVG compositing + pdf-lib with header/footer/measurement summary), comparison view with linked pan/zoom and draggable divider, auto-save retry with exponential backoff, canvas state size warnings (5MB/10MB), standardized error responses, 21 unit tests (`context/features/xray-annotation-part5-spec.md`)
- 2026-03-31 **X-Ray Multi-View & Patient Image Sidebar** — ViewModeSwitcher (single/2x2/4x4) at bottom of left toolbar, PatientImageSidebar with thumbnails and metadata (body region, view type, date), MultiViewGrid with independent zoom/pan per viewport cell, click thumbnails to load into active grid slot, single mode navigates to X-ray annotation page
- 2026-03-31 **X-Ray Annotation UX Improvements** — Reduced zoom sensitivity by 30% (scroll wheel + pinch), moved patient image sidebar from right to left (shown by default), replaced ViewModeSwitcher with dropdown selector limited to 1x1/2x2/4x4 options
- 2026-03-31 **Annotation Enhancement Tools** — Fixed undo/redo (Ctrl+Z / Ctrl+Shift+Z) to apply changes directly to canvas, shape dragging for repositioning, copy/paste (Cmd+C / Cmd+V) with 20px offset, arrow key nudging (1px / 10px with Shift), undo/redo UI buttons in status bar
- 2026-03-31 **Login Page & NextAuth Integration** — NextAuth v5 with Credentials + Google OAuth (JWT sessions), login page at /login with Branch Owner/Staff role selector, Stripe-inspired UI, middleware protecting /dashboard, activeClinicId on User model, auth utilities, demo clinic seed data (`context/features/login-page-spec.md`)
- 2026-03-31 **Auth Credentials - Email/Password Provider** — Split auth into auth.config.ts (Edge-safe) + auth.ts (bcrypt override), registration API at POST /api/auth/register with validation and bcryptjs hashing, sidebar logout button, login sign-up link (`context/features/auth-spec-files/auth-spec-2.md`)
- 2026-03-31 **Auth UI - Register Page** — Register page at /register with name, email, password, confirm password fields, Google sign-up button, form validation (passwords match, email format), submits to POST /api/auth/register, redirects to login on success, Stripe-inspired UI (`context/features/auth-spec-files/auth-spec-3.md`)
- 2026-04-01 **Auth - Google Sign-Up / Sign-In Flow** — Conditional Google OAuth button on login/register pages (hidden when AUTH_GOOGLE_ID not configured), googleEnabled prop from server pages, spec with Google Cloud Console setup instructions and OAuth flow documentation (`context/features/auth-spec-files/auth-spec-4.md`)
- 2026-04-01 **Email Verification on Register** — Resend integration for verification emails, 24-hour token expiry, verify API route with redirect to status page (success/expired/invalid/already-verified), credentials provider blocks unverified users with custom CredentialsSignin error, RegisterForm shows "check your email" state, LoginForm shows verification warning with resend button, resend-verification API (no user existence leak), 18 unit tests
- 2026-04-01 **Auth Middleware Fix & Test Coverage** — Fixed redirect loop caused by getToken using wrong cookie prefix (next-auth.* vs authjs.*), replaced with NextAuth v5 auth() middleware wrapper, added register API tests (10) and auth-utils tests (6), gitignored .playwright-mcp/

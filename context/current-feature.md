# Current Feature: X-Ray Annotation UX Improvements

## Status

In Progress

## Goals

- [ ] Reduce zoom sensitivity by 30% on the X-ray annotation canvas
- [ ] Move patient image preview sidebar to the left side, beside annotation tools — show by default
- [ ] Limit multi-view options to 1x1, 2x2, and 4x4 only — use a dropdown selector instead of current switcher

## Notes

- These are UX refinements to the existing X-ray annotation screen
- Zoom applies to the canvas viewport (scroll wheel / pinch zoom)
- Patient image sidebar currently on right side — move to left
- ViewModeSwitcher currently at bottom of left toolbar — convert to dropdown with 3 options

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

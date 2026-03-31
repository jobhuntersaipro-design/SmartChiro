# Current Feature: X-Ray Annotation Measurements (Part 4)

## Status

In Progress

## Goals

- Ruler tool (`M`) — two-point distance measurement with end ticks, pixel or calibrated mm display
- Angle tool (`Shift+M`) — three-click angle measurement with arc indicator and supplementary angle
- Cobb Angle tool (`Ctrl/Cmd+Shift+M`) — four-click scoliosis measurement with perpendicular construction lines and severity classification (mild/moderate/severe)
- Calibration Reference tool (`K`) — draw line on known reference, enter mm value, compute px-to-mm ratio, update Xray calibration state
- Calibration system — reference marker overrides clinic default, recalculates all rulers on calibration change
- Measurement properties panel — ruler/angle/cobb/calibration-specific fields when selected
- Measurement summary panel — table of all measurements with click-to-select
- Measurement default styles — teal `#00D4AA` stroke, yellow `#FFCC00` for calibration
- Keyboard shortcuts — M, Shift+M, Ctrl/Cmd+Shift+M, K

## Notes

- Measurement shapes extend `BaseShape` interface from Part 3
- Calibration sources (priority): Reference Marker > Clinic Default > Manual Entry
- Only one calibration reference per X-ray (new replaces old)
- Deleting calibration reference reverts Xray to uncalibrated
- Cobb angle classification: <10° mild, 10-25° moderate, >25° severe
- Label rendering: semi-transparent dark pill (#1A1F36 at 80% opacity), 12px white text
- Perpendicular construction lines: dashed [6,4], same color at 60% opacity
- Spec file: `context/features/xray-annotation-part4-spec.md`

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

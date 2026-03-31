# Current Feature: X-Ray Annotation Drawing Tools (Part 3)

## Status

In Progress

## Goals

- Implement shape type definitions (BaseShape + all shape-specific interfaces: freehand, line, polyline, arrow, rectangle, ellipse, bezier, text)
- Build drawing tool behaviors with pointer events (pointerDown/Move/Up) for each shape type
- Implement modifier key support (Shift for angle/shape constraints, Alt for center-draw)
- Add eraser tool (click-to-delete and drag-to-delete shapes)
- Wire keyboard shortcuts for tool switching (V, P, L, Shift+L, A, R, E, B, T, X)
- Define default styles (red #FF3B30 stroke, 2px width) and color presets (8 WCAG-AA colors)
- Build properties panel for shape editing (common props + type-specific props)
- Integrate shapes with existing canvas engine (viewport, undo/redo, selection, auto-save)
- Implement Ctrl/Cmd+D for shape duplication

## Notes

- Shape schemas stored as JSON in `Annotation.canvasState.shapes`
- All coordinates in image-pixel space (not screen space)
- Freehand uses Ramer-Douglas-Peucker simplification on pointerUp (tolerance 1.5px at 100% zoom)
- Polyline: click-to-place vertices, double-click/Enter to commit, Escape to cancel, Backspace to undo last vertex
- Bezier: click for anchors, drag for control handles, Alt breaks handle symmetry
- Text: inline editor on click, auto-expand, Escape/click-outside to commit, empty text discarded
- Eraser radius: 8px at 100% zoom, scales with zoom
- Minimum sizes: lines 3px, rectangles 3x3px, ellipses 3px radius, freehand 2 points
- Measurement tools (ruler, angle, cobb_angle, calibration_reference) are Part 4 — not this scope
- Spec file: `context/features/xray-annotation-part3-spec.md`

## History

<!-- Keep this updated. Earliest to latest -->

- 2026-03-31 **Dashboard UI Phase 1** — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- 2026-03-31 **Dashboard UI Phase 2** — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- 2026-03-31 **Prisma + Neon PostgreSQL Setup** — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)
- 2026-03-31 **User Table: Pro & Stripe Columns** — Added isPro, phoneNumber, stripeCustomerId, stripeSubscriptionId columns to User model with Prisma migration (`context/features/seed-spec.md`)
- 2026-03-31 **Seed Data Script** — Prisma seed script with demo user (demo@smartchiro.org), bcryptjs password hashing, upsert for idempotency (`context/features/seed-spec.md`)
- 2026-03-31 **X-Ray Upload & Storage** — Prisma enums (XrayStatus, BodyRegion, ViewType, CalibrationMethod), Xray model updates, R2 presigned upload flow, upload-url and confirm API routes, client-side validation & thumbnail generation, XrayUpload component with drag-drop and progress UX, Vitest setup with 21 tests (`context/features/xray-annotation-part1-spec.md`)
- 2026-03-31 **X-Ray Annotation Canvas Engine** — Canvas layout (dark #1A1F36 canvas + light chrome), viewport with zoom/pan (5%-3200%), tool state machine, undo/redo command pattern (100-cap), image adjustments (brightness/contrast/invert/window-level via CSS filters), auto-save (30s interval + beacon), selection system with transform handles, properties panel with layers tab, annotation API route, X-rays listing page (`context/features/xray-annotation-part2-spec.md`)

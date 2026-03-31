# Current Feature: X-Ray Annotation Part 2 — Canvas Engine

## Status

In Progress

## Goals

- Build the annotation canvas layout: dark canvas area (#1A1F36) with light chrome (header, toolbar 56px, properties panel 280px collapsible, zoom bar, status bar 28px)
- Implement coordinate system in image-pixel space with view transform (zoom/pan) matrix
- Implement zoom (5%–3200%, scroll ×1.1, shortcut ×1.25, cursor-anchored) and pan (Hand tool, Space+drag, middle mouse, touch gestures)
- Build zoom presets bar (Fit, 100%, custom %) at bottom of canvas
- Implement layer architecture: locked image layer below interactive annotation shapes layer
- Build Properties Panel with Layers tab (shape list, visibility/lock toggles, drag reorder)
- Implement selection system: single click, Shift+click multi-select, marquee selection, Ctrl/Cmd+A
- Build transform handles: 8-point resize, rotation handle, proportional resize, axis-constrained move
- Implement tool state machine (Idle → ToolSelected → Drawing → ShapeCommitted, with continuous mode)
- Build undo/redo system with command pattern (ADD/DELETE/MODIFY/REORDER/BATCH), max 100 commands, session-only
- Define and store AnnotationCanvasState JSON (version, shapes, viewport, metadata) in Annotation.canvasState
- Update Prisma Annotation model with canvasState, canvasStateSize, imageAdjustments, thumbnailUrl fields
- Implement image adjustments: brightness, contrast, invert (CSS filters), window/level controls, reset button
- Implement auto-save (30s interval, tool switch debounce, beforeunload beacon, Ctrl/Cmd+S manual)
- Add keyboard shortcuts for navigation, selection, and layer ordering
- Ensure accessibility: keyboard nav, screen reader labels, WCAG AA contrast, focus indicators, reduced motion

## Notes

- Canvas library is TBD (evaluating Konva.js, Fabric.js, or custom) — all structures are library-agnostic
- Coordinate space: all shape coords stored in original image pixel space, zoom/pan are view-only transforms
- Undo/redo history is per-session only, not persisted to DB
- Auto-save uses last-write-wins conflict handling (no real-time collaboration in v1)
- Image adjustments saved per-annotation (different annotations on same X-ray can have different adjustments)
- CSS filters for brightness/contrast/invert (GPU-accelerated); canvas pixel ops or WebGL for window/level
- Performance: progressive loading for large images, virtual rendering for many shapes, RDP simplification for freehand, canvasState capped at 10MB
- Spec reference: `context/features/xray-annotation-part2-spec.md`

## History

<!-- Keep this updated. Earliest to latest -->

- 2026-03-31 **Dashboard UI Phase 1** — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- 2026-03-31 **Dashboard UI Phase 2** — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- 2026-03-31 **Prisma + Neon PostgreSQL Setup** — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)
- 2026-03-31 **User Table: Pro & Stripe Columns** — Added isPro, phoneNumber, stripeCustomerId, stripeSubscriptionId columns to User model with Prisma migration (`context/features/seed-spec.md`)
- 2026-03-31 **Seed Data Script** — Prisma seed script with demo user (demo@smartchiro.org), bcryptjs password hashing, upsert for idempotency (`context/features/seed-spec.md`)
- 2026-03-31 **X-Ray Upload & Storage** — Prisma enums (XrayStatus, BodyRegion, ViewType, CalibrationMethod), Xray model updates, R2 presigned upload flow, upload-url and confirm API routes, client-side validation & thumbnail generation, XrayUpload component with drag-drop and progress UX, Vitest setup with 21 tests (`context/features/xray-annotation-part1-spec.md`)

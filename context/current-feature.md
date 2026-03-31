# Current Feature: X-Ray Annotation API & Export

## Status

In Progress

## Goals

- X-Ray CRUD endpoints: GET list (paginated, filterable), GET single with annotation summaries, PATCH metadata, DELETE (soft-delete/archive)
- Annotation CRUD endpoints: GET list, GET single (full canvasState), POST create, PUT update (version increment), POST fork (copy), DELETE (hard-delete)
- Export endpoint: POST export with PNG/PDF format support, server-side rendering pipeline (load image → apply adjustments → render shapes → encode → upload to R2 → return presigned URL)
- PDF export: auto-fit page size, header (patient/xray/clinic info), footer, measurement summary table on second page
- PNG export: full-resolution rasterized output with all visible annotations
- Comparison view endpoint: GET compare with 2 xray IDs, validate same patient, return both xrays + annotations
- Client-side comparison: side-by-side canvases with linked pan/zoom, draggable divider
- Standardized error responses: upload errors, annotation errors, export errors with proper HTTP status codes
- Client-side error UX: auto-retry with exponential backoff on save failure, canvas state size warnings at 5MB, block save at 10MB
- Export storage: R2 /exports/ path with 24h TTL auto-expiry

## Notes

- Spec: `context/features/xray-annotation-part5-spec.md`
- This is Part 5 of 5 in the X-Ray Annotation series
- Canvas state max size: 10MB (10,485,760 bytes)
- Export files stored at `/xrays/{clinicId}/{patientId}/{xrayId}/exports/{exportId}.{png|pdf}`
- PDF DPI: configurable, default 150, max 300
- Presigned download URLs expire after 24 hours
- No caching of exports — re-exporting always generates a new file
- Comparison view: exactly 2 IDs required, both must be READY status and same patient
- Fork creates a new annotation with copied canvasState, version reset to 1, label appended with "(copy)"

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

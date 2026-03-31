# Current Feature: X-Ray Upload & Storage (Part 1 of 5)

## Status

In Progress

## Goals

- Client-side file validation (type, size, dimensions) before upload
- Thumbnail generation (256px longest edge, JPEG 80%) on client
- Presigned upload flow to Cloudflare R2 (original + thumbnail)
- API route: POST /api/xrays/upload-url — generates presigned PUT URLs
- API route: POST /api/xrays/{xrayId}/confirm — finalizes upload, sets status READY
- Prisma schema updates: Xray model with enums (XrayStatus, BodyRegion, ViewType, CalibrationMethod)
- R2 storage structure: /xrays/{clinicId}/{patientId}/{xrayId}/...
- Upload progress UX with progress bar, preview, error toasts, retry
- Status lifecycle: UPLOADING → READY → ARCHIVED

## Notes

- Max file size: 300 MB; allowed types: .png, .jpg, .jpeg
- Min dimensions: 100×100 px; max dimensions: 16384×16384 px
- Presigned URL expiry: 5 minutes; auto-retry on expiry
- Stale upload cleanup: daily job deletes UPLOADING records older than 24h
- Calibration fields (pixelSpacing, calibrationMethod) written by Part 4 measurement tools
- This is Part 1 of 5 in the X-Ray Annotation series
- Spec file: context/features/xray-annotation-part1-spec.md

## History

<!-- Keep this updated. Earliest to latest -->

- 2026-03-31 **Dashboard UI Phase 1** — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- 2026-03-31 **Dashboard UI Phase 2** — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- 2026-03-31 **Prisma + Neon PostgreSQL Setup** — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)
- 2026-03-31 **User Table: Pro & Stripe Columns** — Added isPro, phoneNumber, stripeCustomerId, stripeSubscriptionId columns to User model with Prisma migration (`context/features/seed-spec.md`)
- 2026-03-31 **Seed Data Script** — Prisma seed script with demo user (demo@smartchiro.org), bcryptjs password hashing, upsert for idempotency (`context/features/seed-spec.md`)

# Current Feature: Seed Data Script

## Status

In Progress

## Goals

- Create `prisma/seed.ts` to populate the database with sample data for development and demos
- Seed a demo user with email `demo@smartchiro.org`, name `Demo Wojak`
- Hash password `12345678` with bcryptjs (12 rounds)
- Set `isPro: false` and `emailVerified` to current date

## Notes

- Spec file: `context/features/seed-spec.md`
- Only seeding the User model for now (no clinic, patient, or other data specified)

## History

<!-- Keep this updated. Earliest to latest -->

- 2026-03-31 **Dashboard UI Phase 1** — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- 2026-03-31 **Dashboard UI Phase 2** — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- 2026-03-31 **Prisma + Neon PostgreSQL Setup** — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)
- 2026-03-31 **User Table: Pro & Stripe Columns** — Added isPro, phoneNumber, stripeCustomerId, stripeSubscriptionId columns to User model with Prisma migration (`context/features/seed-spec.md`)

# Current Feature — User Table: Pro & Stripe Columns

## Status

In Progress

## Goals

- Add `isPro` (Boolean, default false) to User model
- Add `phoneNumber` (String, optional) to User model
- Add `stripeCustomerId` (String, optional, unique) to User model
- Add `stripeSubscriptionId` (String, optional, unique) to User model
- Create and apply Prisma migration via Neon MCP
- Verify schema matches in Neon database

## Notes

- Use Neon MCP to verify/apply migration
- `isPro` defaults to `false` — tracks whether user is on Pro plan
- `stripeCustomerId` and `stripeSubscriptionId` are unique (one Stripe customer/sub per user)
- `phoneNumber` is optional, no uniqueness constraint

## History

<!-- Keep this updated. Earliest to latest -->

- **Dashboard UI Phase 1** (2026-03-31) — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- **Dashboard UI Phase 2** (2026-03-31) — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps
- **Prisma + Neon PostgreSQL Setup** (2026-03-31) — Prisma 7 ORM with Neon serverless adapter, full schema (NextAuth, Clinic, Patient, Visit, Xray, Annotation, Appointment, Invoice, PatientDocument), indexes, cascade deletes, initial migration (`context/features/databse-spec.md`)

# Current Feature: Prisma + Neon PostgreSQL Setup

## Status

In Progress

## Goals

- Set up Prisma 7 ORM with Neon PostgreSQL (serverless)
- Create initial schema based on data models in project-overview.md
- Include NextAuth models (Account, Session, VerificationToken)
- Add appropriate indexes and cascade deletes
- Always use migrations (`prisma migrate dev`), never `db push`

## Notes

- Use Prisma 7 (has breaking changes from v6 — must read upgrade guide)
- DATABASE_URL points to Neon development branch; separate production branch exists
- Reference specs: `context/project-overview.md`, `context/coding-standard.md`
- Prisma 7 upgrade guide: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7
- Prisma Postgres quickstart: https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/prisma-postgres

## History

<!-- Keep this updated. Earliest to latest -->

- **Dashboard UI Phase 1** (2026-03-31) — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search
- **Dashboard UI Phase 2** (2026-03-31) — Your Overview stat cards, Today's Schedule table with status badges, Recent Activity feed with timestamps

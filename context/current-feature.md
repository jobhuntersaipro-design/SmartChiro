# Current Feature: Dashboard UI Phase 2

## Status

In Progress

## Goals

- Your Overview section — stat cards (Payments, Net volume, MRR, Failed payments, New customers) with chart placeholders matching the screenshot layout
- Today's Schedule — table with patient name, time, status badge, and service columns, with List View / Timeline toggle
- Recent Activity — feed of recent events with timestamps
- Use mock data from `src/lib/mock-data.ts` (import directly, no database yet)
- Match the Stripe-inspired design from the screenshot (`context/screenshots/dashboard_dashboard.png`)

## Notes

- Phase 2 of 3 for dashboard UI
- Sidebar already built and collapsible (Phase 1)
- Top bar with search, nav tabs, user avatar already built (Phase 1)
- Stat cards should show "No data" or "MYR 0.00" states as shown in screenshot
- Reference: `context/features/dashboard-phase-2.md`

## History

<!-- Keep this updated. Earliest to latest -->

- **Dashboard UI Phase 1** (2026-03-31) — ShadCN UI init, Stripe-inspired design system, dashboard route with collapsible sidebar layout and top bar with search

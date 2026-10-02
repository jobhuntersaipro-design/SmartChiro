# Design System — Arc UI

SmartChiro uses the design language of [Arc UI](https://uiarc.dev) (replaced the
earlier Stripe-inspired system on 2026-10-02).

- **Tokens:** `src/app/globals.css` (`:root` values from Arc's foundation, exposed to
  Tailwind in `@theme inline`).
- **Rules and token table:** `context/project-overview.md` → "UI / UX — Arc UI Design System".
- **Why and how it was applied:** `context/features/arc-ui-revamp-spec.md`.

In short: neutral oklch grays, black primary pill buttons, pill inputs on a muted
surface, generously rounded white panels with a resting shadow, Geist headings over
Inter body text, one violet accent (`#7747ff`) for links, active and focus states,
and visible focus rings.

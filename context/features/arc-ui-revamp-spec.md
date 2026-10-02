# Arc UI Revamp (site-wide)

Restyle the whole app to the design of [Arc UI](https://uiarc.dev): neutral grays,
black primary buttons, pill-shaped controls, rounded panels, Geist headings, soft
shadows. This replaces the Stripe-inspired look described in `DESIGN.md` and
`context/project-overview.md`.

Source of truth for the tokens: Arc's foundation registry item
(`https://uiarc.dev/r/arc-foundation.json`, file `foundation.css`), read 2026-10-02.

## Approach

The look changes; behaviour and component APIs do not.

1. **Tokens first.** Arc's foundation tokens go into `src/app/globals.css` and are
   exposed to Tailwind. Every color, radius and shadow in the app then comes from
   one place.
2. **Restyle our shadcn primitives** (`src/components/ui/*`) to Arc's specs. We do
   **not** install Arc's own source components: they are CSS modules + the
   `motion` package with a different API (`variant="primary"` vs our
   `variant="default"`), so swapping them in means touching every caller for the
   same visual result.
3. **Token sweep.** 4,006 hardcoded hex classes (`text-[#061b31]`,
   `bg-[#533afd]`…) across 201 files are rewritten to token classes by a one-off
   codemod. Without this, any future restyle means hand-editing 201 files again.
4. **Shell and page polish**, area by area, with screenshots.

## Design tokens

### Color (light)

| Tailwind token | Arc value | Replaces (old hex) |
| --- | --- | --- |
| `foreground` | `--foreground` oklch(15% 0 0) | `#061B31` `#0A2540` `#273951` |
| `fg-secondary` | `--text-secondary` oklch(46% 0 0) | `#425466` `#64748D` |
| `fg-muted` | `--text-muted` oklch(59% 0 0) | `#697386` `#8B93A7` `#94A3B8` |
| `fg-disabled` | neutral-6 oklch(72% 0 0) | `#A3ACB9` `#CBD5E1` (as text) |
| `surface-muted` | `--surface-muted` oklch(97.8% 0 0) | `#F6F9FC` |
| `surface-hover` | neutral-3 oklch(95.8% 0 0) | `#F0F3F7` `#EEF2F7` `#F1F5F9` |
| `surface-subtle` | neutral-1 oklch(99% 0 0) | `#FAFBFD` |
| `border` | `--border` oklch(93.5% 0 0) | `#E5EDF5` `#E3E8EE` |
| `border-strong` | `--border-strong` oklch(82% 0 0) | `#C1C9D2` `#CDD5E2` `#CBD5E1` (as border) |
| `primary` | `--foreground` (black button) | `#533AFD` `#635BFF` as a **button** background |
| `brand` | Arc violet accent `#7747ff` | `#533AFD` `#635BFF` everywhere else (links, active nav, indicators, borders, rings) |
| `brand-strong` | `#5528ce` | `#4434D4` `#5851EB` `#4530D4` `#3F2BD1` |
| `brand-subtle` | `rgb(119 71 255 / .13)` | `#EDEDFC` `#F0EEFF` `#F7F5FF` |
| `danger` / `danger-subtle` | `--danger` oklch(54% .21 25) / 10% tint | `#DF1B41` `#EA2261` `#C4183C` `#B41A36` `#B3162F` / `#FDE8EC` `#FDE7EC` `#FEF2F4` `#FEF2F5` `#FDECEF` `#FFF0F3` `#FCD0DB` |
| `success` / `success-subtle` | `--success` oklch(49% .19 150) / 10% tint | `#30B130` `#15BE53` `#108C3D` `#1F7A1F` `#1E7A35` / `#ECFDF5` `#E8F7EE` `#E8F5E8` `#E5F8E5` |
| `warning` / `warning-subtle` | `--warning` oklch(58% .18 75) / 12% tint | `#F5A623` `#F59E0B` `#D97706` `#9B6829` `#8A5A00` / `#FFF8E1` `#FFF8EB` `#FFF4E0` |
| `info` | blue `#0562ef` | `#0570DE` |
| `canvas` / `canvas-raised` | Arc dark oklch(19%) / oklch(24%) | `#1A1F36` / `#2D3348` (X-ray viewer chrome) |

Rules:
- A brand-violet background that is a button (it has a `hover:bg-[#4434D4]`-style
  sibling class) becomes `bg-primary hover:bg-primary/90`. Any other violet
  background becomes `bg-brand`.
- A hover shade (`hover:bg-[#4434D4]`, `hover:bg-[#B41A36]`…) becomes the base
  token at `/90`, so hover stays visible.
- shadcn variables map onto Arc: `--primary` = foreground, `--accent` (menu hover)
  = surface-hover, `--muted-foreground` = fg-muted, `--destructive` = danger,
  `--ring` = brand.
- Hex values in TS data (status/treatment/doctor palettes, chart colors) stay as
  they are; they are data, not theme.

### Radius, type, shadow

| Token | Value | Use |
| --- | --- | --- |
| `rounded-control` | 1.125rem (Arc `--radius-control`) | buttons, inputs, selects, nav items, chips: pills at our 32–36px heights |
| `rounded-panel` | 1.625rem → tuned in P5 if dense tables clip | cards, popovers, menus |
| `rounded-surface` | 2.125rem | dialogs, sheets |
| `rounded-sm/md/lg/xl` | `--radius` raised from 0.25rem to 0.75rem | everything already using Tailwind's scale |
| Fonts | Geist (headings), Inter (body), via the existing Google Fonts link | |
| Heading tracking | `-0.03em` (Arc `--tracking-display`) | |
| Shadows | Arc `resting` / `raised` / `floating` replace the blue-tinted Stripe shadows; the existing `--shadow-*` names are kept and re-pointed | |
| Motion | Arc durations and easings (`--ease-standard`, 160ms fast) as CSS transitions; press feedback `active:scale-[.97]` | |

Font sizes stay on the 15%-bumped scale (`text-[14px]`… `text-[23px]`) for
clinical readability.

### Deliberate deviations from Arc

- **Focus rings stay.** Arc removes all focus outlines; that fails WCAG 2.4.7 and
  breaks keyboard use at the front desk. We keep a visible `focus-visible` ring in
  `brand`.
- **No `motion` dependency.** Arc's press/morph animations use the `motion`
  package; CSS transitions cover press and hover. Add `motion` only if we adopt
  Arc's animated components (morph select, voice orb…).
- **Dark mode tokens are not shipped.** There is no theme toggle in the spec;
  the token layer makes it a values-only change later.

## Phases

Each phase: implement → `npm run lint` → `npm run test` → `npm run build` →
screenshots (desktop 1440px + mobile 390px) → commit.

1. **Foundation** — Arc tokens in `globals.css` (`:root` + `@theme inline`),
   shadcn variable mapping, radius/shadow re-pointing, Geist font, body/heading
   defaults, focus ring.
2. **Primitives** — `button` (primary black pill, secondary bordered, ghost,
   destructive, link; press scale), `input` / `textarea` / `input-group` /
   `date-input`, `select`, `badge`, `tabs` (pill segmented), `dialog` / `sheet`,
   `popover` / `dropdown-menu` / `command` / `tooltip`, `calendar`, `avatar`,
   `sonner`.
3. **Token sweep** — codemod over `src/**/*.tsx|ts` (tests included where they
   assert class strings): hex classes per the table, `rounded-[4px]` →
   `rounded-control`, `rounded-[6px]` → `rounded-panel`, `rounded-[8px]` →
   `rounded-surface`, arbitrary Stripe shadows → `shadow-(--shadow-card)`. The
   codemod is run once and not committed; the long tail of unmapped hex is listed
   in this spec after the run.
4. **Shell** — sidebar (pill nav items, brand active state), top bar, mobile
   drawer, page background, loading skeletons; auth pages (login, register,
   forgot/reset, verify).
5. **Page polish** — dashboard (owner + doctor), patients list + detail,
   appointments (list + calendar, incl. `react-big-calendar` CSS), branches,
   doctors, invoices, reports, settings, X-rays list + annotation chrome,
   anatomy, public booking `/book/[slug]`, patient portal `/portal`.
6. **Docs** — rewrite the design section of `context/project-overview.md`, the
   "explicit hex colors" rule in `context/coding-standard.md` (now: use tokens),
   and `DESIGN.md`; record in `context/current-feature.md` history.

## Out of scope

New features, Arc Pro components, dark-mode toggle, data/schema/API changes.

## Acceptance

- No page still shows the Stripe indigo/navy palette (except data colors).
- Lint, tests and build pass.
- Screenshots of each area in the PR/merge notes; production screenshot after the
  merge deploys.

## Result (2026-10-02)

- Phase order changed: the token sweep (P3) ran before the primitives (P2), because
  until the sweep the hardcoded hex classes hid every token change.
- Codemod coverage: every arbitrary hex class mapped except WhatsApp's brand green
  `#25D366` (kept on purpose). A second pass mapped Stripe neutrals/indigo in string
  literals, styled-jsx and inline styles (charts, SVG, annotation viewer), Stripe
  inline box-shadows (cards → resting, dialogs/menus → floating) and rgba tint
  classes. 260 hand-rolled controls (`h-6`–`h-11`) moved from `rounded-md` to
  `rounded-control`.
- Radius kept at Arc values (panel 1.625rem); dense tables read fine inside panels.
  Day-calendar event cards use `rounded-md` with a clipped accent bar instead.
- Headings and metrics moved from Stripe's weight 300 to 500.
- Also fixed in passing: patient header actions overflowing on mobile (pre-existing).

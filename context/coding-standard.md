# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs)
- Use Server Actions for form submissions and simple mutations
- Use API routes when you need:
  - Webhooks (Stripe, GitHub, etc.)
  - File uploads with progress tracking
  - Long-running operations
  - Specific HTTP status codes or headers
  - Endpoints for future mobile/CLI clients
  - Third-party integrations
- Otherwise, fetch data directly in server components
- Dynamic routes for item/collection pages

## Tailwind CSS v4

**CRITICAL**: We are using Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` files (those are for v3)
- All theme configuration must be done in CSS using the `@theme` directive in `src/app/globals.css`
- Use CSS custom properties for colors, spacing, etc.
- No JavaScript-based config allowed

Example v4 configuration:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
}
```

### Arbitrary values: when to use them

Tailwind v4 uses a continuous spacing scale (1 unit = `0.25rem` = 4px), so
nearly every px value has a token equivalent. The Tailwind IntelliSense
extension flags arbitrary values that have one (e.g. `max-w-[420px]` →
`max-w-105`, `h-[40px]` → `h-10`, `py-[6px]` → `py-1.5`).

**Prefer token classes** for spacing/sizing utilities:
`w / h / max-w / max-h / min-w / min-h / m* / p* / gap* / top / bottom /
left / right / inset* / space-x / space-y / size`.

**Arbitrary values are still fine** when:
- They reference a CSS variable: `shadow-(--shadow-card)` (v4 paren syntax,
  not `[var(--shadow-card)]`).
- They're a hardcoded brand color: `bg-[#635BFF]`, `text-[#061b31]` —
  the project intentionally uses explicit hex per the Stripe design tokens
  block, not abstract var names.
- They're font-size / line-height / tracking values that don't match
  Tailwind's default typography scale: the project's `text-[14px]`,
  `text-[15px]`, `text-[23px]` are part of the 15%-bumped Stripe scale
  and don't have token equivalents until/unless registered under
  `@theme { --font-size-* }`.
- They're tight `rounded-[4px]` / `rounded-[6px]` — the project's Stripe
  radius scale doesn't match Tailwind defaults.

If you find yourself writing `*-[Npx]` for one of the spacing utilities
above and the IDE doesn't flag it, double-check the prefix is in the list
— if so, switch to the token form.

## File Organization

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- Server Actions: `src/actions/[feature].ts`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts`

## Naming

- Components: PascalCase (`ItemCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling
- Use shadcn/ui components where applicable
- No inline styles

## Database

- Use Prisma ORM for all database operations
- Always use `prisma migrate dev` for schema changes (not `db push`)
- Run `prisma migrate status` before committing to verify migrations are in sync
- Production deployments must run `prisma migrate deploy` before the app starts

## Data Fetching

- Server components fetch directly with Prisma
- Client components use Server Actions
- Validate all inputs with Zod

## Error Handling

- Use try/catch in Server Actions
- Return `{ success, data, error }` pattern from actions
- Display user-friendly error messages via toast

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
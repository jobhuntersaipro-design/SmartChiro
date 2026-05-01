# E2E Tests

## One-time setup

The e2e suite needs a non-prod Neon branch it can wipe and reseed. You can either reuse your existing dev branch or make a dedicated one:

**Option 1 — reuse your dev branch (simpler, what we recommend if you keep a 2-branch dev/prod setup):**
```bash
neonctl connection-string <dev-branch-name> --pooled
```

**Option 2 — dedicated e2e branch:**
```bash
neonctl branches create --name smartchiro-test --parent main
neonctl connection-string smartchiro-test --pooled
```

Then:
1. Paste the connection string into `.env.test` as `DATABASE_URL_TEST`.
2. Apply the current schema once: `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`

After that, `npm run test:e2e` handles seeding and reset automatically. `playwright.config.ts` and `e2e/fixtures/seed.ts` both load `.env.test` explicitly (it takes precedence over `.env`), so your prod `.env` stays untouched.

## Safety guards

`seedE2E()` refuses to run unless `DATABASE_URL_TEST` is set. There is no fallback to `DATABASE_URL` — that's the most important guard, because the seed runs `prisma.appointmentReminder.deleteMany({})` and `prisma.waSession.deleteMany({})` with no filter.

We deliberately don't substring-match the URL (Neon endpoints are random adjective-noun hashes that don't carry the branch name, so a "test" check would just be theatre). The real safety is **you manually pasting the dev URL into `.env.test`** — that's the explicit opt-in.

If you want belt-and-suspenders, give the credentials in `.env.test` read-write access only on the dev branch via Neon IAM.

## Commands

- `npm run test:e2e` — headless Playwright (auto-seeds via `auth.setup.ts`)
- `npm run test:e2e:ui` — interactive Playwright UI
- `npm run test:e2e:debug` — step-debugger
- `npx tsx e2e/fixtures/seed-cli.ts` — wipe and reseed without running tests
  (use this if you need to inspect a known-good DB state)

## Why two seed files?

`e2e/fixtures/seed.ts` is the library — `seedE2E()` is imported by `auth.setup.ts`. It uses CJS-friendly imports because Playwright's test transformer mis-handles `import.meta.url`, top-level dynamic imports, and several CJS packages' conditional exports.

`e2e/fixtures/seed-cli.ts` is the standalone runner — it loads `.env.test` via dotenv and invokes `seedE2E()`. Playwright never touches it, so it's free to use ESM features.

# E2E Tests

## One-time setup

1. Create a Neon branch dedicated to e2e (cheap, isolated):
   ```bash
   neonctl branches create --name smartchiro-test --parent main
   neonctl connection-string smartchiro-test --pooled
   ```
2. Copy the connection string into `.env.test` as `DATABASE_URL_TEST`.
3. Apply the current schema once:
   ```bash
   DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
   ```

After that, `npm run test:e2e` handles seeding and reset automatically. The `playwright.config.ts` and `e2e/fixtures/seed.ts` both load `.env.test` explicitly (it takes precedence over `.env`), so your prod `.env` stays untouched.

## Safety guards

`seedE2E()` refuses to run unless:
- `DATABASE_URL_TEST` is set (no fallback to `DATABASE_URL`).
- The connection string contains `test` or points at `localhost` / `127.0.0.1`.

If you need to run e2e against a connection that doesn't include `test` in its URL, rename the Neon branch or update the regex in `e2e/fixtures/seed.ts`. Do not silence the guard — it's the last line of defense against wiping production reminder/WA-session rows.

## Commands

- `npm run test:e2e` — headless Playwright (auto-seeds via `auth.setup.ts`)
- `npm run test:e2e:ui` — interactive Playwright UI
- `npm run test:e2e:debug` — step-debugger
- `npx tsx e2e/fixtures/seed-cli.ts` — wipe and reseed without running tests
  (use this if you need to inspect a known-good DB state)

## Why two seed files?

`e2e/fixtures/seed.ts` is the library — `seedE2E()` is imported by `auth.setup.ts`. It uses CJS-friendly imports because Playwright's test transformer mis-handles `import.meta.url`, top-level dynamic imports, and several CJS packages' conditional exports.

`e2e/fixtures/seed-cli.ts` is the standalone runner — it loads `.env.test` via dotenv and invokes `seedE2E()`. Playwright never touches it, so it's free to use ESM features.

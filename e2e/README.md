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

- `npm run test:e2e` — headless Playwright
- `npm run test:e2e:ui` — interactive Playwright UI
- `npm run test:e2e:debug` — step-debugger

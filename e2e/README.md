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

After that, `npm run test:e2e` handles seeding and reset automatically.

## Commands

- `npm run test:e2e` — headless Playwright
- `npm run test:e2e:ui` — interactive Playwright UI
- `npm run test:e2e:debug` — step-debugger

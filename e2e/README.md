# E2E Tests

## One-time setup

The e2e suite needs a non-prod Neon branch it can wipe and reseed. Reuse your existing dev branch:

```bash
neonctl connection-string <dev-branch-name> --pooled
```

Then in `.env`, add:
```
DATABASE_URL_TEST=<dev branch connection string>
MOCK_WORKER_PORT=8788
E2E_USER_EMAIL=e2e@smartchiro.test
E2E_USER_PASSWORD=e2e-test-password-12345
E2E_BRANCH_ID=e2e-test-branch
CRON_SECRET=local-cron-secret-replace-in-vercel
```

Apply the current schema to the dev branch once:
```bash
DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
```

After that, `npm run test:e2e` handles seeding and reset automatically.

## Safety guards

`seedE2E()` refuses to run unless `DATABASE_URL_TEST` is set. There is **no fallback to `DATABASE_URL`** — that's the most important guard, because the seed runs `prisma.appointmentReminder.deleteMany({})` and `prisma.waSession.deleteMany({})` with no filter.

The real safety is **you manually pasting the dev URL into `.env`** as `DATABASE_URL_TEST` — that's the explicit opt-in. The substring-match heuristic was removed because Neon endpoints are random adjective-noun hashes that don't carry the branch name.

If you want belt-and-suspenders, give the credentials read-write access only on the dev branch via Neon IAM.

## Commands

- `npm run test:e2e` — headless Playwright (auto-seeds via `auth.setup.ts`)
- `npm run test:e2e:ui` — interactive Playwright UI
- `npm run test:e2e:debug` — step-debugger
- `npx tsx e2e/fixtures/seed-cli.ts` — wipe and reseed without running tests
  (use this if you need to inspect a known-good DB state)

## Why two seed files?

`e2e/fixtures/seed.ts` is the library — `seedE2E()` is imported by `auth.setup.ts`. It uses CJS-friendly imports because Playwright's test transformer mis-handles `import.meta.url`, top-level dynamic imports, and several CJS packages' conditional exports.

`e2e/fixtures/seed-cli.ts` is the standalone runner — it loads `.env` via dotenv and invokes `seedE2E()`. Playwright never touches it, so it's free to use ESM features.

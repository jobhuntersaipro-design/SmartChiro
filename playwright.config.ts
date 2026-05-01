import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// .env holds both local-dev secrets AND e2e test config (DATABASE_URL_TEST,
// E2E_*, MOCK_WORKER_PORT). Single-source-of-truth, no .env.test split.

const PORT = 3000;
const MOCK_PORT = Number(process.env.MOCK_WORKER_PORT ?? 8788);

const DB_URL = process.env.DATABASE_URL_TEST;
if (!DB_URL) {
  throw new Error(
    "DATABASE_URL_TEST is required for e2e. " +
      "Create a Neon test branch and set it in .env.test — see e2e/README.md. " +
      "Refusing to fall back to DATABASE_URL because the seed runs destructive deleteMany.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false, // shared DB state — run serially
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    storageState: "e2e/.auth/user.json",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        WORKER_URL: `http://localhost:${MOCK_PORT}`,
        WORKER_SHARED_SECRET: process.env.WORKER_SHARED_SECRET ?? "test-shared",
        WORKER_OUTBOUND_SECRET: process.env.WORKER_OUTBOUND_SECRET ?? "test-outbound",
        CRON_SECRET: process.env.CRON_SECRET ?? "test-cron",
        DATABASE_URL: DB_URL,
      },
    },
    {
      command: `tsx e2e/fixtures/mock-worker.ts`,
      url: `http://localhost:${MOCK_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: {
        MOCK_WORKER_PORT: String(MOCK_PORT),
        APP_URL: `http://localhost:${PORT}`,
        WORKER_SHARED_SECRET: process.env.WORKER_SHARED_SECRET ?? "test-shared",
        WORKER_OUTBOUND_SECRET: process.env.WORKER_OUTBOUND_SECRET ?? "test-outbound",
      },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const PORT = 3000;
const MOCK_PORT = Number(process.env.MOCK_WORKER_PORT ?? 8788);

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
        DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "",
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

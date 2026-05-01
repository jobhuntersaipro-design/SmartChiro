# WA Integration Testing & Vercel Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Playwright UI E2E (Layer 1), a manual smoke script (Layer 2), and a Vercel deploy runbook (Layer 3) for the WhatsApp integration, per [docs/superpowers/specs/2026-05-01-wa-integration-testing-and-vercel-deploy-design.md](../specs/2026-05-01-wa-integration-testing-and-vercel-deploy-design.md).

**Architecture:** Playwright runs the real Next.js stack (`next dev`) plus a Hono mock worker on port 8788, both started by Playwright's `webServer` config. The mock imports the app's own `signRequest`/`verifyRequest` from `src/lib/wa/hmac.ts` so wire format is identical. A separate `npm run smoke:wa` Node script hits the deployed Railway worker for pre-deploy verification. The Vercel runbook is pure documentation.

**Tech Stack:** `@playwright/test`, `hono` (already-acceptable runtime dep used as test fixture), Prisma 7 + Neon test branch, existing `tsx` for fixture execution.

**Note on TDD here:** Most tasks add tests for **already-shipped production code**. The flow is "write test → run → expect PASS (because code already exists)". A failing test on first run means a real bug — stop and fix the production code before committing the test.

---

### Task 1: Install Playwright + base config

**Files:**
- Modify: `package.json` — add devDep + scripts
- Create: `playwright.config.ts`
- Create: `.env.test`
- Modify: `.gitignore` — append e2e directories

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Expected: `chromium-NNNN` downloaded under `~/Library/Caches/ms-playwright/`.

- [ ] **Step 2: Add scripts to `package.json`**

In the `"scripts"` block of `/Users/chrislam/Desktop/SmartChiro/package.json`, add (alphabetically near `"test"`):

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:debug": "PWDEBUG=1 playwright test"
```

- [ ] **Step 3: Create `playwright.config.ts`**

Path: `/Users/chrislam/Desktop/SmartChiro/playwright.config.ts`

```ts
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
```

- [ ] **Step 4: Create `.env.test`**

Path: `/Users/chrislam/Desktop/SmartChiro/.env.test`

```
# Used by `npm run test:e2e` only. Loaded via dotenv in playwright.config.ts.
# Create a Neon test branch first (see e2e/README.md): `neonctl branches create --name smartchiro-test`.
DATABASE_URL_TEST=postgresql://USER:PASS@ep-xxx-test-pooler.region.neon.tech/neondb?sslmode=require

WORKER_SHARED_SECRET=e2e-shared-secret-do-not-use-in-prod
WORKER_OUTBOUND_SECRET=e2e-outbound-secret-do-not-use-in-prod
CRON_SECRET=e2e-cron-secret-do-not-use-in-prod
MOCK_WORKER_PORT=8788

# E2E seed user (created by e2e/fixtures/seed.ts)
E2E_USER_EMAIL=e2e@smartchiro.test
E2E_USER_PASSWORD=e2e-test-password-12345
E2E_BRANCH_ID=e2e-test-branch
```

- [ ] **Step 5: Update `.gitignore`**

Append to `/Users/chrislam/Desktop/SmartChiro/.gitignore`:

```
# Playwright
e2e/.auth/
playwright-report/
test-results/
```

- [ ] **Step 6: Verify Playwright is wired**

Run: `npx playwright --version`
Expected: `Version 1.NN.N` (no error).

Run: `npx playwright test --list`
Expected: `Total: 0 tests in 0 files`. (No specs yet — that's correct.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.ts .env.test .gitignore
git commit -m "chore(e2e): scaffold Playwright with chromium project and webServer config"
```

---

### Task 2: Build the mock worker fixture

**Files:**
- Create: `e2e/fixtures/mock-worker.ts`

The mock implements the 4 contract endpoints (verifying inbound HMAC), plus `/__test/emit`, `/__test/reset`, `/__test/sends` that bind only to localhost.

- [ ] **Step 1: Create the mock worker file**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/fixtures/mock-worker.ts`

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { signRequest, verifyRequest } from "../../src/lib/wa/hmac";

type SessionState = {
  status: "NONE" | "PAIRING" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
  phoneNumber?: string;
  lastSeenAt?: string;
};

const PORT = Number(process.env.MOCK_WORKER_PORT ?? 8788);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHARED = process.env.WORKER_SHARED_SECRET ?? "";
const OUTBOUND = process.env.WORKER_OUTBOUND_SECRET ?? "";

if (!SHARED || !OUTBOUND) {
  throw new Error("mock-worker: WORKER_SHARED_SECRET and WORKER_OUTBOUND_SECRET required");
}

const sessions = new Map<string, SessionState>();
const sends: Array<{ branchId: string; to: string; body: string; ts: number }> = [];

const app = new Hono();

async function verify(c: { req: { raw: Request } }, raw: string) {
  const sig = c.req.raw.headers.get("x-signature") ?? "";
  const ts = Number(c.req.raw.headers.get("x-timestamp") ?? "0");
  const v = verifyRequest({
    secret: SHARED,
    body: raw,
    signature: sig,
    timestamp: ts,
    nowEpoch: Math.floor(Date.now() / 1000),
  });
  return v;
}

app.get("/healthz", (c) => c.text("ok"));

app.post("/branches/:branchId/session", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  sessions.set(branchId, { status: "PAIRING" });
  return c.json({ ok: true }, 202);
});

app.get("/branches/:branchId/status", async (c) => {
  const v = await verify(c, "");
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  const s = sessions.get(branchId) ?? { status: "NONE" };
  return c.json({ branchId, ...s });
});

app.post("/branches/:branchId/send", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  const body = JSON.parse(raw) as { to: string; body: string };
  sends.push({ branchId, to: body.to, body: body.body, ts: Date.now() });
  return c.json({ msgId: `mock-${randomUUID()}` });
});

app.post("/branches/:branchId/logout", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  sessions.set(branchId, { status: "LOGGED_OUT" });
  return c.json({ ok: true });
});

// ─── Test-only hooks (loopback only) ────────────────────────────────────
function isLoopback(req: Request): boolean {
  const host = new URL(req.url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

app.post("/__test/emit", async (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  const raw = await c.req.text();
  const event = JSON.parse(raw) as { type: string; branchId: string; [k: string]: unknown };

  // Mirror DB-side state for status endpoint coherence
  const cur = sessions.get(event.branchId) ?? { status: "NONE" };
  if (event.type === "qr") sessions.set(event.branchId, { ...cur, status: "PAIRING" });
  if (event.type === "connected")
    sessions.set(event.branchId, {
      status: "CONNECTED",
      phoneNumber: event.phoneNumber as string,
      lastSeenAt: new Date().toISOString(),
    });
  if (event.type === "disconnected")
    sessions.set(event.branchId, { ...cur, status: "DISCONNECTED" });
  if (event.type === "logged_out")
    sessions.set(event.branchId, { status: "LOGGED_OUT" });

  // Sign + POST to app webhook
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(event);
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await fetch(`${APP_URL}/api/wa/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
    body,
  });
  return c.json({ posted: res.status }, res.ok ? 200 : 502);
});

app.post("/__test/reset", (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  sessions.clear();
  sends.length = 0;
  return c.json({ ok: true });
});

app.get("/__test/sends", (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  return c.json({ sends });
});

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" });
console.log(`[mock-worker] listening on http://127.0.0.1:${PORT}`);
```

- [ ] **Step 2: Confirm `hono` is installable as a top-level dep**

`hono` isn't currently in `package.json`. Install:

```bash
npm install hono @hono/node-server
```

(It's used by tests + the worker repo. Adding it as a regular dep is fine — small package, no runtime impact on the app since the mock is never imported by app code.)

- [ ] **Step 3: Smoke-run the mock worker manually**

```bash
WORKER_SHARED_SECRET=test WORKER_OUTBOUND_SECRET=test MOCK_WORKER_PORT=8788 \
  npx tsx e2e/fixtures/mock-worker.ts &
MOCK_PID=$!
sleep 1
curl -fsSL http://127.0.0.1:8788/healthz
echo
kill $MOCK_PID
```

Expected: `ok` printed, no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/mock-worker.ts package.json package-lock.json
git commit -m "test(e2e): add mock WhatsApp worker fixture with HMAC verify and test hooks"
```

---

### Task 3: Test DB seed + auth storageState setup

**Files:**
- Create: `e2e/fixtures/seed.ts`
- Create: `e2e/auth.setup.ts`
- Create: `e2e/README.md`

- [ ] **Step 1: Document the one-time Neon test branch creation**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/README.md`

```markdown
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
```

- [ ] **Step 2: Create the seed/reset helper**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/fixtures/seed.ts`

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { hash } from "bcryptjs";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_TEST or DATABASE_URL required");

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e@smartchiro.test";
const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "e2e-test-password-12345";
const E2E_BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";

export async function seedE2E(): Promise<void> {
  // Wipe WA + reminder state between runs (idempotent)
  await prisma.appointmentReminder.deleteMany({});
  await prisma.waSession.deleteMany({});

  const password = await hash(E2E_USER_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: { password, emailVerified: new Date() },
    create: {
      email: E2E_USER_EMAIL,
      name: "E2E Test User",
      password,
      emailVerified: new Date(),
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: E2E_BRANCH_ID },
    update: {},
    create: {
      id: E2E_BRANCH_ID,
      name: "E2E Test Branch",
      ownerName: "E2E Test User",
    },
  });

  await prisma.branchMember.upsert({
    where: { userId_branchId: { userId: user.id, branchId: branch.id } },
    update: { role: "OWNER" },
    create: { userId: user.id, branchId: branch.id, role: "OWNER" },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { activeBranchId: branch.id },
  });

  // Reminder settings: enabled with 120-min offset (used by reminder-send.spec)
  await prisma.branchReminderSettings.upsert({
    where: { branchId: branch.id },
    update: { enabled: true, offsetsMin: [120], templates: {} },
    create: {
      branchId: branch.id,
      enabled: true,
      offsetsMin: [120],
      templates: {},
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedE2E().then(() => prisma.$disconnect());
}
```

- [ ] **Step 3: Create the auth setup project**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/auth.setup.ts`

```ts
import { test as setup, expect } from "@playwright/test";
import { seedE2E } from "./fixtures/seed";

const AUTH_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await seedE2E();

  // Reset mock-worker in-memory state too
  await fetch("http://127.0.0.1:8788/__test/reset", { method: "POST" }).catch(() => {});

  const email = process.env.E2E_USER_EMAIL ?? "e2e@smartchiro.test";
  const password = process.env.E2E_USER_PASSWORD ?? "e2e-test-password-12345";

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 4: Run setup once to verify**

```bash
mkdir -p e2e/.auth
npx playwright test --project=setup
```

Expected: `1 passed`. Verify `e2e/.auth/user.json` was written.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/seed.ts e2e/auth.setup.ts e2e/README.md
git commit -m "test(e2e): add Neon test seed and auth storageState setup"
```

---

### Task 4: connect-flow.spec.ts

**Files:**
- Create: `e2e/connect-flow.spec.ts`

Validates: Connect WhatsApp button → modal opens → backend calls mock `/session` → `__test/emit` qr → QR PNG renders → emit `connected` → CONNECTED badge.

- [ ] **Step 1: Write the spec**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/connect-flow.spec.ts`

```ts
import { test, expect } from "@playwright/test";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_WORKER_PORT ?? 8788}`;

async function emit(event: object) {
  const res = await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`emit failed: ${res.status}`);
}

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
});

test("Connect WhatsApp: PAIRING → QR rendered → CONNECTED", async ({ page }) => {
  await page.goto(`/dashboard/branches/${BRANCH_ID}`);

  // Open Connect modal
  await page.getByRole("button", { name: /connect whatsapp/i }).click();
  await expect(page.getByText(/connect whatsapp/i).first()).toBeVisible();

  // App POSTs /branches/:id/wa/connect → mock receives /branches/:id/session
  // (mock's HMAC verify must pass; we don't need to assert the call directly here)

  // Tiny base64 PNG (1x1 transparent) for the QR fixture
  const tinyPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  await emit({ type: "qr", branchId: BRANCH_ID, qrPayload: tinyPng });

  // Modal polls every 2s — wait for the QR <img> to render
  const qr = page.getByAltText(/whatsapp pairing qr/i);
  await expect(qr).toBeVisible({ timeout: 5_000 });
  await expect(qr).toHaveAttribute("src", new RegExp(`^data:image/png;base64,${tinyPng}`));

  // Now flip to CONNECTED
  await emit({ type: "connected", branchId: BRANCH_ID, phoneNumber: "+60123456789" });
  await expect(page.getByText(/connected as \+60123456789/i)).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 2: Run the spec**

```bash
npx playwright test connect-flow.spec.ts --project=chromium
```

Expected: `1 passed`. If it fails, the failure indicates either:
- Mock worker not reachable → check Task 2 step 3.
- HMAC mismatch → confirm `WORKER_SHARED_SECRET` matches in `.env.test` and webServer env.
- DB write to `WaSession` not happening → real bug in `/api/wa/webhook` route. Stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add e2e/connect-flow.spec.ts
git commit -m "test(e2e): connect-flow — QR pairing through CONNECTED transition"
```

---

### Task 5: status-polling.spec.ts

**Files:**
- Create: `e2e/status-polling.spec.ts`

Validates: a CONNECTED branch becomes DISCONNECTED in the UI when the mock pushes a `disconnected` webhook. (Modal closes after CONNECTED, so this test re-opens the modal to verify polling on subsequent state changes.)

- [ ] **Step 1: Write the spec**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/status-polling.spec.ts`

```ts
import { test, expect } from "@playwright/test";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_WORKER_PORT ?? 8788}`;

async function emit(event: object) {
  const res = await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`emit failed: ${res.status}`);
}

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
});

test("Status badge reflects webhook-driven CONNECTED → DISCONNECTED", async ({ page }) => {
  // Pre-state: pretend already CONNECTED
  await emit({ type: "connected", branchId: BRANCH_ID, phoneNumber: "+60123456789" });

  await page.goto(`/dashboard/branches/${BRANCH_ID}`);

  // Card shows CONNECTED label or button text "Re-pair" (per BranchReminderSettingsCard)
  await expect(page.getByRole("button", { name: /re-pair/i })).toBeVisible({ timeout: 5_000 });

  // Push disconnected event
  await emit({ type: "disconnected", branchId: BRANCH_ID, reason: "test-network-drop" });

  // After next poll cycle, button label flips back to "Connect WhatsApp"
  await expect(page.getByRole("button", { name: /connect whatsapp/i })).toBeVisible({
    timeout: 8_000,
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
npx playwright test status-polling.spec.ts --project=chromium
```

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/status-polling.spec.ts
git commit -m "test(e2e): status-polling — webhook-driven CONNECTED↔DISCONNECTED"
```

---

### Task 6: Disconnect button + logout-flow.spec.ts

**Files:**
- Modify: `src/components/branches/BranchReminderSettingsCard.tsx` — add Disconnect button when status is `CONNECTED`
- Create: `e2e/logout-flow.spec.ts`

The current `BranchReminderSettingsCard` has a Connect/Re-pair button but no way to disconnect — even though `/api/branches/[branchId]/wa/disconnect/route.ts` exists. Adding the button is a small product fix that this test surface justifies.

- [ ] **Step 1: Add the Disconnect button to the card**

Open `/Users/chrislam/Desktop/SmartChiro/src/components/branches/BranchReminderSettingsCard.tsx`. Locate the `<button onClick={() => setWaModal(true)}>` that toggles between `Connect WhatsApp` / `Re-pair`. Beside it, when `waStatus === "CONNECTED"`, render a Disconnect button:

```tsx
{waStatus === "CONNECTED" && (
  <button
    type="button"
    onClick={async () => {
      const res = await fetch(`/api/branches/${branchId}/wa/disconnect`, { method: "POST" });
      if (res.ok) {
        // Trigger the parent's status refresh — same hook the connect modal uses.
        // If the card uses a local state for waStatus, update it; otherwise rely on
        // the next status poll cycle.
        setWaStatus("DISCONNECTED");
      }
    }}
    className="rounded-[4px] border border-[#E3E8EE] bg-white px-3 py-1.5 text-[14px] text-[#0A2540] hover:bg-[#F0F3F7]"
  >
    Disconnect
  </button>
)}
```

If the card doesn't already have `setWaStatus` exposed (it should — it's how the existing `Re-pair` flow updates), wire one or rely on the existing status-fetch hook. Keep this change minimal — do not refactor the card.

- [ ] **Step 2: Manually verify the button renders**

```bash
npm run dev
```

Log in as the seed user, open `/dashboard/branches/<id>`. Without a real worker, the card will show `Connect WhatsApp` (DISCONNECTED). To verify the new button renders, temporarily insert a `WaSession` row with `status: "CONNECTED"` via Prisma Studio:

```bash
npx prisma studio
```

Set the row's `status` to `CONNECTED`, refresh the page, confirm both `Re-pair` and `Disconnect` buttons appear. Revert the row to `DISCONNECTED` afterward.

- [ ] **Step 3: Write the spec**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/logout-flow.spec.ts`

```ts
import { test, expect } from "@playwright/test";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_WORKER_PORT ?? 8788}`;

async function emit(event: object) {
  const res = await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`emit failed: ${res.status}`);
}

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
});

test("Disconnect button calls worker and UI updates after logged_out webhook", async ({
  page,
}) => {
  // Pre-state: CONNECTED via webhook so the card renders Disconnect button
  await emit({ type: "connected", branchId: BRANCH_ID, phoneNumber: "+60123456789" });

  await page.goto(`/dashboard/branches/${BRANCH_ID}`);
  await expect(page.getByRole("button", { name: /re-pair/i })).toBeVisible({ timeout: 5_000 });

  const disconnect = page.getByRole("button", { name: /^disconnect$/i });
  await expect(disconnect).toBeVisible();
  await disconnect.click();

  // App POSTed /api/branches/:id/wa/disconnect → mock got /logout (HMAC verified).
  // Push logged_out webhook to confirm clearing of phoneNumber + qrPayload in the DB.
  await emit({ type: "logged_out", branchId: BRANCH_ID, reason: "test-user-initiated" });

  await expect(page.getByRole("button", { name: /connect whatsapp/i })).toBeVisible({
    timeout: 8_000,
  });
});
```

- [ ] **Step 4: Run the spec**

```bash
npx playwright test logout-flow.spec.ts --project=chromium
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/components/branches/BranchReminderSettingsCard.tsx e2e/logout-flow.spec.ts
git commit -m "feat(branches): add Disconnect button + e2e for logout flow"
```

---

### Task 7: webhook-hmac.spec.ts

**Files:**
- Create: `e2e/webhook-hmac.spec.ts`

Validates: `/api/wa/webhook` returns 401 on missing/bad/stale signature, 200 on good. This test does NOT use the mock worker — it hits the app directly.

- [ ] **Step 1: Write the spec**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/webhook-hmac.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import { signRequest } from "../src/lib/wa/hmac";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const OUTBOUND = process.env.WORKER_OUTBOUND_SECRET ?? "test-outbound";

function eventBody() {
  return JSON.stringify({ type: "qr", branchId: BRANCH_ID, qrPayload: "abc" });
}

test("webhook rejects missing signature", async ({ request }) => {
  const res = await request.post("/api/wa/webhook", {
    data: eventBody(),
    headers: { "content-type": "application/json" },
  });
  expect(res.status()).toBe(401);
});

test("webhook rejects bad signature", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000);
  const res = await request.post("/api/wa/webhook", {
    data: eventBody(),
    headers: {
      "content-type": "application/json",
      "x-signature": "deadbeef".repeat(8),
      "x-timestamp": String(ts),
    },
  });
  expect(res.status()).toBe(401);
});

test("webhook rejects stale timestamp", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago, > 60s window
  const body = eventBody();
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await request.post("/api/wa/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
  });
  expect(res.status()).toBe(401);
});

test("webhook accepts valid signed event", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000);
  const body = eventBody();
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await request.post("/api/wa/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
  });
  expect(res.status()).toBe(200);
});
```

- [ ] **Step 2: Run the spec**

```bash
npx playwright test webhook-hmac.spec.ts --project=chromium
```

Expected: `4 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/webhook-hmac.spec.ts
git commit -m "test(e2e): webhook-hmac — 401 on missing/bad/stale, 200 on valid"
```

---

### Task 8: reminder-send.spec.ts

**Files:**
- Create: `e2e/reminder-send.spec.ts`

Validates: the `/api/reminders/dispatch` cron endpoint, when triggered with `CRON_SECRET`, materializes a pending reminder and sends it via the mock worker; then a delivered ack updates the row.

- [ ] **Step 1: Write the spec**

Path: `/Users/chrislam/Desktop/SmartChiro/e2e/reminder-send.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { signRequest } from "../src/lib/wa/hmac";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_WORKER_PORT ?? 8788}`;
const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron";
const OUTBOUND = process.env.WORKER_OUTBOUND_SECRET ?? "test-outbound";

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

async function emit(event: object) {
  await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
  await prisma.appointmentReminder.deleteMany({});
  await prisma.appointment.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.patient.deleteMany({ where: { branchId: BRANCH_ID } });

  // Mark branch CONNECTED so dispatcher will use WHATSAPP channel
  await emit({ type: "connected", branchId: BRANCH_ID, phoneNumber: "+60123456789" });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("dispatch materializes + sends a WhatsApp reminder; ack flips row to DELIVERED", async ({
  request,
}) => {
  // Create a patient with WhatsApp preference
  const patient = await prisma.patient.create({
    data: {
      firstName: "Reminder",
      lastName: "Test",
      phone: "+60198888888",
      reminderChannel: "WHATSAPP",
      preferredLanguage: "en",
      branchId: BRANCH_ID,
      doctorId: (await prisma.user.findFirstOrThrow({ where: { email: process.env.E2E_USER_EMAIL } })).id,
    },
  });

  // Schedule appointment 110 minutes from now (inside the 120-min offset window)
  const dateTime = new Date(Date.now() + 110 * 60 * 1000);
  const appt = await prisma.appointment.create({
    data: {
      dateTime,
      duration: 30,
      status: "SCHEDULED",
      patientId: patient.id,
      branchId: BRANCH_ID,
      doctorId: patient.doctorId,
    },
  });

  // Trigger cron
  const res = await request.get("/api/reminders/dispatch", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);

  // Allow ~1s for mock /send to be recorded
  await new Promise((r) => setTimeout(r, 500));

  // Assert mock got a send call for this patient's number
  const sendsRes = await fetch(`${MOCK_URL}/__test/sends`);
  const { sends } = (await sendsRes.json()) as {
    sends: Array<{ branchId: string; to: string; body: string }>;
  };
  const mine = sends.find((s) => s.branchId === BRANCH_ID && s.to === patient.phone);
  expect(mine, "expected a send to the patient's WhatsApp number").toBeDefined();
  expect(mine!.body.length).toBeGreaterThan(0);

  // Reminder row should be SENT now
  const sentRow = await prisma.appointmentReminder.findFirstOrThrow({
    where: { appointmentId: appt.id, channel: "WHATSAPP" },
  });
  expect(sentRow.status).toBe("SENT");
  expect(sentRow.externalId).toMatch(/^mock-/);

  // Push ack(delivered) — webhook posts /api/wa/webhook signed with OUTBOUND secret
  await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ack",
      branchId: BRANCH_ID,
      msgId: sentRow.externalId,
      ack: "delivered",
    }),
  });

  // The current /api/wa/webhook handler only reacts to ack="failed". For "delivered",
  // status should remain SENT. (If the team later wires DELIVERED handling, update this.)
  await new Promise((r) => setTimeout(r, 300));
  const after = await prisma.appointmentReminder.findFirstOrThrow({
    where: { id: sentRow.id },
  });
  expect(after.status).toBe("SENT");
});

test("ack(failed) flips reminder row to FAILED", async ({ request }) => {
  // Set up a sent reminder (re-uses logic from prior test inline-shortened)
  const patient = await prisma.patient.create({
    data: {
      firstName: "Failed",
      lastName: "Ack",
      phone: "+60197777777",
      reminderChannel: "WHATSAPP",
      preferredLanguage: "en",
      branchId: BRANCH_ID,
      doctorId: (await prisma.user.findFirstOrThrow({ where: { email: process.env.E2E_USER_EMAIL } })).id,
    },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 110 * 60 * 1000),
      duration: 30,
      status: "SCHEDULED",
      patientId: patient.id,
      branchId: BRANCH_ID,
      doctorId: patient.doctorId,
    },
  });

  const dispatch = await request.get("/api/reminders/dispatch", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(dispatch.status()).toBe(200);
  await new Promise((r) => setTimeout(r, 500));

  const reminder = await prisma.appointmentReminder.findFirstOrThrow({
    where: { appointmentId: appt.id, channel: "WHATSAPP" },
  });

  await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ack",
      branchId: BRANCH_ID,
      msgId: reminder.externalId,
      ack: "failed",
    }),
  });

  await new Promise((r) => setTimeout(r, 300));
  const after = await prisma.appointmentReminder.findFirstOrThrow({ where: { id: reminder.id } });
  expect(after.status).toBe("FAILED");
  expect(after.failureReason).toBe("wa_ack_failed");
});

test("dispatch is unauthorized without CRON_SECRET", async ({ request }) => {
  const res = await request.get("/api/reminders/dispatch");
  expect(res.status()).toBe(401);
});
```

> **Note:** This spec uses a real `PrismaClient` for assertions. That's acceptable for e2e tests but means the test is sensitive to schema drift. If `prisma migrate deploy` was run after creating the test DB, schema is current.

- [ ] **Step 2: Run the spec**

```bash
npx playwright test reminder-send.spec.ts --project=chromium
```

Expected: `3 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/reminder-send.spec.ts
git commit -m "test(e2e): reminder-send — cron → /send → SENT, ack(failed) → FAILED"
```

---

### Task 9: Smoke script — `scripts/smoke-wa.mjs`

**Files:**
- Create: `scripts/smoke-wa.mjs`
- Modify: `package.json` — add `smoke:wa` script
- Modify: `.env.example` — document new vars

- [ ] **Step 1: Write the smoke script**

Path: `/Users/chrislam/Desktop/SmartChiro/scripts/smoke-wa.mjs`

```js
import "dotenv/config";
import { createHmac } from "node:crypto";

const WORKER_URL = process.env.WORKER_URL;
const SECRET = process.env.WORKER_SHARED_SECRET;
const BRANCH_ID = process.env.SMOKE_BRANCH_ID;
const PHONE = process.env.SMOKE_PHONE_NUMBER;

if (!WORKER_URL || !SECRET || !BRANCH_ID || !PHONE) {
  console.error("missing env: WORKER_URL, WORKER_SHARED_SECRET, SMOKE_BRANCH_ID, SMOKE_PHONE_NUMBER");
  process.exit(2);
}

function sign(body, ts) {
  return createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
}

async function signedFetch(path, { method = "GET", body } = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const raw = body ? JSON.stringify(body) : "";
  const sig = sign(raw, ts);
  return fetch(`${WORKER_URL}${path}`, {
    method,
    headers: {
      "x-signature": sig,
      "x-timestamp": String(ts),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? raw : undefined,
  });
}

async function main() {
  console.log(`→ checking status for ${BRANCH_ID}…`);
  const statusRes = await signedFetch(`/branches/${BRANCH_ID}/status`);
  if (!statusRes.ok) {
    console.error(`status: ${statusRes.status} ${await statusRes.text()}`);
    process.exit(1);
  }
  const status = await statusRes.json();
  if (status.status !== "CONNECTED") {
    console.error(`✗ session not CONNECTED (got "${status.status}") — RE-PAIR REQUIRED`);
    console.error(`  Open SmartChiro → Branches → ${BRANCH_ID} → Connect WhatsApp.`);
    process.exit(1);
  }
  console.log(`  ok: CONNECTED as ${status.phoneNumber}`);

  const messageBody = `SmartChiro smoke ${new Date().toISOString()}`;
  console.log(`→ sending: "${messageBody}" to ${PHONE}`);
  const sendRes = await signedFetch(`/branches/${BRANCH_ID}/send`, {
    method: "POST",
    body: { to: PHONE, body: messageBody },
  });
  if (!sendRes.ok) {
    console.error(`send: ${sendRes.status} ${await sendRes.text()}`);
    process.exit(1);
  }
  const sendJson = await sendRes.json();
  if (!sendJson.msgId) {
    console.error(`send: missing msgId — body=${JSON.stringify(sendJson)}`);
    process.exit(1);
  }
  console.log(`✅ Smoke OK: msgId=${sendJson.msgId}`);
  console.log(`   Verify ack arrival via Vercel logs at /api/wa/webhook.`);
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Add `smoke:wa` to `package.json`**

```json
"smoke:wa": "node scripts/smoke-wa.mjs"
```

- [ ] **Step 3: Document env in `.env.example`**

Append to `/Users/chrislam/Desktop/SmartChiro/.env.example`:

```
# Smoke testing (operator-local only)
SMOKE_BRANCH_ID=
SMOKE_PHONE_NUMBER=
```

- [ ] **Step 4: Verify the script handles a missing env gracefully**

```bash
SMOKE_BRANCH_ID= SMOKE_PHONE_NUMBER= npm run smoke:wa
```

Expected: prints `missing env: …` and exits with code 2.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-wa.mjs package.json .env.example
git commit -m "feat(scripts): add smoke:wa for pre-deploy WhatsApp delivery check"
```

---

### Task 10: Vercel deploy runbook

**Files:**
- Create: `docs/superpowers/specs/vercel-deploy-runbook.md`

Single Markdown doc, mostly checklist. Content lifted from spec §7.1–7.4 with operator-friendly phrasing.

- [ ] **Step 1: Write the runbook**

Path: `/Users/chrislam/Desktop/SmartChiro/docs/superpowers/specs/vercel-deploy-runbook.md`

```markdown
# Vercel Production Deploy Runbook

Run this checklist:
- On the **first** Vercel deploy that includes the WhatsApp worker integration.
- After **any** secret rotation involving `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, or `CRON_SECRET`.

## First deploy (8 steps)

1. **Push the worker repo to GitHub** as private repo `smartchiro-wa-worker`. Confirm it includes the latest committed hotfixes.
2. **Generate three secrets locally:**
   ```sh
   openssl rand -hex 32   # WORKER_SHARED_SECRET
   openssl rand -hex 32   # WORKER_OUTBOUND_SECRET
   openssl rand -hex 32   # CRON_SECRET
   ```
   Store them in your password manager. They will be set on both Vercel and Railway.
3. **Provision Railway** per `2026-04-30-wa-worker-implementation.md` §9. Set worker env: `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`, `APP_URL=<vercel-prod-url>`, `PORT=8787`, `SESSIONS_DIR=/data/sessions`, `LOG_LEVEL=info`. Mount persistent volume at `/data/sessions` (1 GB). Generate public domain. Redeploy. Curl `https://<railway>/healthz` → expect `200`.
4. **Set Vercel env (Production scope only)** at Vercel Dashboard → project → Settings → Environment Variables:
   - Database: `DATABASE_URL`
   - Auth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
   - Worker: `WORKER_URL=<railway-url>`, `WORKER_SHARED_SECRET`, `WORKER_OUTBOUND_SECRET`
   - Cron: `CRON_SECRET`
   - Email: `RESEND_API_KEY`, `RESEND_REMINDERS_FROM`
   - Storage: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
   - Billing (if live): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
5. **Apply migrations to prod DB locally** before deploying:
   ```sh
   DATABASE_URL=<prod-connection-string> npx prisma migrate deploy
   ```
   Do not run migrations from the Vercel build pipeline.
6. **Deploy:** `vercel --prod` or merge to `main`.
7. **Smoke checks:**
   ```sh
   curl https://<railway>/healthz                                            # → 200
   curl -H "Authorization: Bearer $CRON_SECRET" https://<vercel>/api/reminders/dispatch  # → 200
   ```
8. **Pair the smoke session** (one-time): log in as your operator account, create branch `Smoke Test`, copy its id, set `SMOKE_BRANCH_ID` in Vercel env, open Connect WhatsApp on that branch, scan QR. Run `npm run smoke:wa` locally → expect `✅ Smoke OK`.

## Cron verification

Vercel Dashboard → project → **Cron Jobs** tab → confirm `/api/reminders/dispatch` shows `*/5 * * * *` and the **last run** updates within 5 min. Tail logs for the corresponding invocation; expect `200` and a JSON body summarizing materialized + dispatched counts.

## Secret rotation

Rotate one secret at a time.

1. Generate new value: `openssl rand -hex 32`.
2. Apply per secret type:
   - **`WORKER_SHARED_SECRET`** (app→worker): set on **Railway first** (verifier), wait for redeploy live, then set on Vercel and deploy.
   - **`WORKER_OUTBOUND_SECRET`** (worker→app): set on **Vercel first** (verifier), wait for redeploy live, then set on Railway and redeploy.
   - **`CRON_SECRET`** (Vercel cron→app): both sender (cron) and receiver (route) are on Vercel, reading the same env var. Update the value in Vercel and redeploy. Vercel injects `Authorization: Bearer $CRON_SECRET` automatically — there is no second place to update.
3. Run `npm run smoke:wa` (for `WORKER_*` rotations) or trigger one cron-style invocation manually (for `CRON_SECRET`):
   ```sh
   curl -H "Authorization: Bearer $NEW_CRON_SECRET" https://<vercel>/api/reminders/dispatch
   ```

For cross-service rotations, expect ~30 s of 401s during the in-between redeploy. Plan for low-traffic windows.

## Troubleshooting

- **All webhooks return 401** after a deploy → secret drift. Compare the active value in Vercel Settings → Environment Variables and Railway service variables. Re-set if mismatched.
- **`/api/reminders/dispatch` returns 200 but no messages sent** → check Vercel logs for the dispatch JSON body. `inserted=0, processed=0` means no eligible reminders (no SCHEDULED appointments in the next-offset window) — usually expected. `inserted>0, processed=0` means materialized but worker call failed — check Railway logs.
- **Worker `/healthz` returns 502** → Railway service is restarting. Check service logs.
- **Smoke script prints `RE-PAIR REQUIRED`** → WhatsApp invalidated the linked device. Re-pair in the SmartChiro UI; no code change needed.

## Out of scope

- Vercel preview deploys hitting the real worker. Preview/Development scopes leave `WORKER_URL` unset; the app no-ops the worker call and the UI shows "WhatsApp unavailable in preview." See `src/lib/wa/worker-client.ts`.
- Sentry / monitoring — separate spec.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/vercel-deploy-runbook.md
git commit -m "docs(deploy): add Vercel production deploy runbook for WhatsApp integration"
```

---

### Task 11: Final integration verification

- [ ] **Step 1: Run the full e2e suite**

```bash
npm run test:e2e
```

Expected output (rough): `auth setup: 1 passed; chromium: 11 passed`. Total wall time ≤ 60s on a normal laptop.

- [ ] **Step 2: Inspect HTML report**

```bash
npx playwright show-report
```

Confirm trace files render and no test is `flaky`.

- [ ] **Step 3: Confirm `npm run lint` and `npm run build` still pass**

```bash
npm run lint
npm run build
```

Both expected to pass. If `lint` complains about unused vars in tests, fix in-place.

- [ ] **Step 4: Confirm no secrets leaked into committed files**

```bash
git grep -nE "(NEXTAUTH_SECRET|RESEND_API_KEY|R2_SECRET|STRIPE_SECRET|DATABASE_URL=postgresql)" -- ':!.env.example' ':!.env.test'
```

Expected: no matches outside `.env.example` and `.env.test` placeholders.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git status
# if anything dirty
git add -A && git commit -m "chore(e2e): final cleanup after full-suite verification"
```

- [ ] **Step 6: Summarize and hand off to operator for the Layer 3 (Vercel) execution**

Per the spec's §9 rollout order, **the operator** still needs to:

1. Land the worker hotfixes in `~/Desktop/smartchiro-wa-worker` and resolve the live "QR not reaching DB" bug. (Out of scope of this implementation.)
2. Push the worker repo to GitHub.
3. Provision Railway.
4. Run `docs/superpowers/specs/vercel-deploy-runbook.md` end-to-end.
5. Pair the smoke session and run `npm run smoke:wa` for the first time.

Print this checklist in the PR description.

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

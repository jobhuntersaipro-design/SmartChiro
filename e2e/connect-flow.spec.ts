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

  // App POSTs /api/branches/:id/wa/connect → mock receives /branches/:id/session
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

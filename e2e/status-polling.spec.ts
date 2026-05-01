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

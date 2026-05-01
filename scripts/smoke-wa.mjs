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

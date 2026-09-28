# WhatsApp Reminders via Meta Cloud API (Coexistence + Embedded Signup)

**Status:** In progress (2026-09-28)
**Replaces:** the Baileys worker plan (`docs/superpowers/specs/2026-04-29-smartchiro-wa-worker-contract.md`,
`2026-04-30-wa-worker-implementation.md`). The worker was never built; this spec
sends WhatsApp reminders through Meta's official WhatsApp Cloud API instead.

---

## 1. Problem

Appointment reminders (`src/lib/reminders/*`) already schedule, retry and fall
back to email, but WhatsApp delivery depended on an unofficial Baileys worker:
a linked-device session that breaks WhatsApp's terms (number bans), needs an
always-on server with a persistent volume, and drops when the phone is idle.

Clinics want to keep using WhatsApp on their own iPhone **and** have SmartChiro
send reminders from that same number.

## 2. Solution

Meta's **Cloud API** with **Embedded Signup**. Two onboarding paths from the
same button:

| Path | Who | What happens |
|---|---|---|
| **Coexistence** (default) | Clinic already uses the **WhatsApp Business app** on their phone | Embedded Signup with `featureType: "whatsapp_business_app_onboarding"`. Owner confirms in the Business app on the phone. The number keeps working in the app; SmartChiro sends through the API; sent reminders appear in the app's chat history. |
| **New number** | Clinic wants a dedicated number not on any WhatsApp app | Standard Embedded Signup. Number is verified by SMS/voice in the popup, then registered to Cloud API. |
| **Manual** (testing / BSP) | Developer or a clinic whose WABA was set up elsewhere | Paste WABA ID, phone number ID and a system-user access token. Lets us test with Meta's free test number before Embedded Signup is approved. |

No worker, no QR code rendered by us, no persistent volume. Everything runs on
Vercel as ordinary HTTPS calls to `graph.facebook.com`.

## 3. Constraints from Meta (drive the design)

- Business-initiated messages **must be approved templates**. Free-text
  reminder bodies are no longer possible for WhatsApp; the branch's custom
  WhatsApp text in `BranchReminderSettings.templates.whatsapp` is unused while
  Cloud API is the transport. Email templates stay editable.
- Templates are created per WABA and reviewed by Meta (usually minutes, up to
  24h). Reminders only send once the template for the patient's language is
  `APPROVED`; otherwise the reminder fails with `template_not_approved`, which
  is terminal and triggers the existing email fallback.
- The Embedded Signup `code` expires after **30 seconds** — the client posts it
  to our server immediately and the server exchanges it at once.
- Coexistence numbers are already registered — **do not call `/register`**.
- Coexistence throughput is 20 msg/s (irrelevant at clinic volume).
- Meta bills per template message (utility category) to the WABA's payment
  method. Clinics add a payment method in Meta Business Suite.
- Webhooks are configured **once per Meta app** (not per clinic); events are
  routed to a branch by `phone_number_id` / WABA id.

## 4. Data model

New table, one row per branch. Legacy `WaSession` is left untouched.

```prisma
enum WhatsAppConnectionType { COEXISTENCE  EMBEDDED_SIGNUP  MANUAL }
enum WhatsAppAccountStatus  { CONNECTED  ERROR }

model WhatsAppAccount {
  id                 String                 @id @default(cuid())
  branchId           String                 @unique
  branch             Branch                 @relation(... onDelete: Cascade)
  wabaId             String
  phoneNumberId      String                 @unique
  displayPhoneNumber String?
  verifiedName       String?
  connectionType     WhatsAppConnectionType
  status             WhatsAppAccountStatus  @default(CONNECTED)
  lastError          String?
  accessTokenEnc     String                 // AES-256-GCM, never returned to clients
  registrationPinEnc String?                // only for EMBEDDED_SIGNUP numbers we registered
  templateName       String                 // "smartchiro_appt_reminder_v1"
  templateStatus     Json                   // { en: "APPROVED", ms: "PENDING" }
  templatesCheckedAt DateTime?
  connectedById      String?
  createdAt / updatedAt
  @@index([wabaId])
}
```

Disconnect deletes the row (the token is revoked from our side by forgetting it
and unsubscribing the app from the WABA).

## 5. Reminder template

Name `smartchiro_appt_reminder_v1`, category `UTILITY`, languages `en` + `ms`,
five positional body parameters:

| # | Value |
|---|---|
| 1 | Patient first name |
| 2 | Branch name |
| 3 | Date incl. weekday (clinic time zone) |
| 4 | Time (clinic time zone, 24h) |
| 5 | Doctor name |

- **en:** "Hi {{1}}, this is a reminder of your appointment at {{2}} on {{3}} at {{4}} with {{5}}. If you need to reschedule, please reply to this message or call the clinic."
- **ms:** "Hai {{1}}, ini peringatan untuk temujanji anda di {{2}} pada {{3}} jam {{4}} bersama {{5}}. Jika anda perlu menukar temujanji, sila balas mesej ini atau hubungi klinik."

Created automatically on connect; "Refresh templates" re-creates missing ones
and re-reads status. Meta's `message_template_status_update` webhook keeps the
status current. Language choice: patient's preferred language if approved,
else the other approved language.

## 6. Server

### 6.1 Libraries (`src/lib/whatsapp/`)
- `crypto.ts` — `encryptSecret` / `decryptSecret` (AES-256-GCM, key from
  `WHATSAPP_TOKEN_KEY`, falling back to a SHA-256 of `AUTH_SECRET`).
- `graph.ts` — thin Graph API client (`graphRequest`), `GraphError` with Meta
  error code, `mapGraphError` → reminder error codes.
- `templates.ts` — template definitions, `ensureReminderTemplates`,
  `reminderTemplateParams`, `pickTemplateLanguage`.
- `onboarding.ts` — `exchangeCode`, `subscribeApp`, `registerNumber`,
  `fetchPhoneNumber`.
- `send.ts` — `sendReminderTemplate({ branchId, to, lang, params })` used by
  the dispatcher; marks the account `ERROR` on auth failures.
- `webhook.ts` — `verifyMetaSignature` (`X-Hub-Signature-256`, app secret) and
  `handleWebhookPayload` (statuses, template status, account updates).
- `config.ts` — reads env; `signupConfig()` returns `null` when Embedded Signup
  is not configured so the UI can hide the button.

### 6.2 Routes

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/branches/[id]/whatsapp` | any branch member | Account (no token) + Embedded Signup config (app id, config id, Graph version) |
| DELETE | `/api/branches/[id]/whatsapp` | OWNER/ADMIN | Disconnect (unsubscribe app, delete row) |
| POST | `/api/branches/[id]/whatsapp/connect` | OWNER/ADMIN | `{ code, wabaId, phoneNumberId, flow }` → exchange code, subscribe app, register (new-number flow only), fetch number details, save, create templates |
| POST | `/api/branches/[id]/whatsapp/manual` | OWNER/ADMIN | `{ wabaId, phoneNumberId, accessToken }` → validate token by reading the number, subscribe app, save, create templates |
| POST | `/api/branches/[id]/whatsapp/templates` | OWNER/ADMIN | Create missing templates + refresh status |
| POST | `/api/branches/[id]/whatsapp/test` | OWNER/ADMIN | `{ to, lang }` → send the reminder template with sample values |
| GET | `/api/whatsapp/webhook` | public | Meta verification handshake (`hub.verify_token`) |
| POST | `/api/whatsapp/webhook` | public, signed | Delivery statuses, template status, account updates |

A phone number can be connected to only one branch (`phoneNumberId` unique →
409 `number_in_use`).

### 6.3 Dispatcher
`processOne` sends WhatsApp reminders through `sendReminderTemplate` instead of
the worker. Error mapping:

| Meta error | Reminder code | Terminal (email fallback)? |
|---|---|---|
| no account / account `ERROR` | `session_disconnected` | yes |
| template not approved / 132xxx | `template_not_approved` | yes |
| 131026 undeliverable | `not_on_whatsapp` | yes |
| 131030 recipient not in allowed list (test number) | `recipient_not_allowed` | yes |
| 190, 10, 200 (token / permission) | `session_logged_out` (+ account → `ERROR`) | yes |
| 4, 80007, 130429, 131048, 131056 | `rate_limited` | no (backoff retry) |
| anything else | `unknown` | no (backoff retry) |

Webhook `failed` status → reminder `FAILED` with Meta's error title.
Also fixes reminder date/time rendering to use the clinic time zone (Vercel runs
in UTC, so reminders said 02:30 for a 10:30 appointment).

## 7. UI

`BranchReminderSettingsCard` → WhatsApp section becomes `WhatsAppConnectionPanel`:

- **Not connected:** "Connect WhatsApp Business app" (coexistence, primary),
  "Use a new number" (secondary), collapsible "Connect manually" form. If
  Embedded Signup env vars are missing, only the manual form shows, with a note.
- **Connected:** verified name + number, connection type badge, template status
  pills per language (Approved / Pending / Rejected), "Refresh templates",
  "Send test message" (phone input), "Disconnect" (confirm).
- **Error:** red banner with `lastError` and a "Reconnect" call to action.
- WhatsApp free-text editor replaced by a read-only preview of the approved
  template; email editor unchanged.

The Facebook JS SDK is loaded on demand only when the user clicks connect.

## 8. Configuration

| Env var | Where | Purpose |
|---|---|---|
| `META_APP_ID` | server | Meta app id (also sent to the client via GET route) |
| `META_APP_SECRET` | server | Code exchange + webhook signature |
| `META_WA_CONFIG_ID` | server | Embedded Signup configuration id (Facebook Login for Business) |
| `META_GRAPH_VERSION` | server, optional | Default `v23.0` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | Webhook verification handshake |
| `WHATSAPP_TOKEN_KEY` | server, optional | 64 hex chars; defaults to a key derived from `AUTH_SECRET` |

Meta-side setup (owner action): create a Business app with the WhatsApp
product, add Facebook Login for Business with an Embedded Signup configuration
(WhatsApp Embedded Signup variation), allow the production domain in
"Allowed domains", set the webhook URL
`https://<app>/api/whatsapp/webhook` with the verify token, subscribe the
`messages`, `message_template_status_update` and `account_update` fields.
Tech Provider verification / app review is required before clinics outside the
app's own business can complete Embedded Signup; the manual path works first.

## 9. Non-goals

- Inbound message inbox, 2-way chat, contact/history sync (`smb_app_data`).
- Per-branch custom template text (one approved template per language).
- Deleting the legacy Baileys routes/components (`src/app/api/branches/[id]/wa/*`,
  `src/app/api/wa/webhook`, `src/lib/wa/*`, `WaConnectModal`, `WaSession`) —
  they become unused; remove in a follow-up after owner approval.
- Billing/credit-line sharing (Solution Partner features).

## 10. Test plan

- Unit: crypto round-trip + tamper detection, Graph error mapping, template
  params + language pick, webhook signature verification, webhook payload
  handling (statuses / template updates / account updates).
- Manual (owner): §11.

## 11. Manual test (quick path, no app review needed)

1. developers.facebook.com → create app (Business) → add WhatsApp → API Setup.
   Copy the **test phone number ID**, **WABA ID** and generate a token
   (temporary 24h, or a System User token with `whatsapp_business_messaging`
   + `whatsapp_business_management` for longer tests). Add your own phone as a
   recipient.
2. Set `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Vercel; configure
   the webhook URL in the app.
3. SmartChiro → Branches → a branch → Settings → Appointment Reminders →
   "Connect manually" → paste the three values.
4. Wait for the template pills to show **Approved** (Refresh templates).
5. "Send test message" to your phone.
6. Create an appointment ~2h ahead for a patient with your phone number,
   enable reminders with the 2-hour offset, and wait for the cron tick.
7. Embedded Signup / coexistence: set `META_APP_ID` + `META_WA_CONFIG_ID`, then
   "Connect WhatsApp Business app" with a number on the Business app of an
   admin of the Meta app.

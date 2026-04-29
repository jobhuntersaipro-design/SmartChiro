# Appointment Reminders — Manual E2E Checklist

Run this before merging to main. Requires:

- A test phone with WhatsApp installed
- A test email address you can read
- The sibling repo `smartchiro-wa-worker` running and reachable at `WORKER_URL`

## Pairing

- [ ] Open `/dashboard/branches/<id>` Settings tab → "Connect WhatsApp"
- [ ] Modal shows "Waiting for QR…" then displays a QR within 5 seconds
- [ ] Scan the QR from the test phone → modal flips to "Connected as +60..."
- [ ] Status persists on page reload

## Send WhatsApp

- [ ] Create an appointment 5 minutes in the future for a patient with `phone` set and `reminderChannel = WHATSAPP`
- [ ] Override branch offsets to include `30` (30 minutes) — appointment is < 30 min away → row is created with current `scheduledFor`
- [ ] Wait one cron tick (≤ 5 min) or POST to `/api/reminders/dispatch` with `x-cron-secret` header
- [ ] Test phone receives the WhatsApp message
- [ ] Reminder row in DB transitions PENDING → SENT with `externalId` set

## Send Email

- [ ] Set patient's `reminderChannel = EMAIL`
- [ ] Repeat the appointment-creation flow
- [ ] Test email receives the reminder, both plain-text and HTML render correctly
- [ ] Reminder row transitions PENDING → SENT

## Cross-channel fallback

- [ ] Set patient's `reminderChannel = WHATSAPP` but use a phone number not registered on WhatsApp
- [ ] Wait two cron ticks
- [ ] Original WHATSAPP row is FAILED with reason `not_on_whatsapp`
- [ ] A sibling EMAIL row exists with `isFallback = true` and is sent

## Reschedule

- [ ] Create an appointment with offsets [1440, 120], wait for materialize
- [ ] PATCH the appointment's `dateTime` to a different time via `/api/appointments/[id]`
- [ ] All PENDING reminders for that appointment are deleted
- [ ] Next tick re-materializes new rows at the new offsets

## Cancel

- [ ] Create an appointment, wait for materialize
- [ ] PATCH `status` to `CANCELLED` before any reminder fires
- [ ] At dispatch time, all matching rows transition to SKIPPED, no message sent
- [ ] Next tick does NOT re-materialize (status is no longer SCHEDULED)

## Worker resilience

- [ ] Restart the worker process
- [ ] Confirm the existing session resumes (no re-pair needed)
- [ ] Send a reminder — it still delivers

## Logout

- [ ] On the test phone, remove the SmartChiro device from WhatsApp Linked Devices
- [ ] Worker emits `logged_out` webhook within ~30s
- [ ] WaSession status flips to LOGGED_OUT
- [ ] Settings card shows "Reconnect WhatsApp" CTA
- [ ] Any PENDING WhatsApp rows in flight fail with `session_logged_out` and fall back to email if applicable

## Patient channel preferences

- [ ] Create a patient with `reminderChannel = NONE` → no reminder rows materialize
- [ ] Create a patient with `reminderChannel = BOTH` → both WHATSAPP and EMAIL rows materialize per offset
- [ ] Edit a patient's `preferredLanguage` to `ms` → next reminder uses Bahasa Malaysia template

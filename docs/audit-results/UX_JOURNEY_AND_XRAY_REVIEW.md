# SmartChiro — User Journey, UX, Speed & X-ray Annotation Review

**Date:** 2026-09-28 · **Build:** `main` @ `eb09171` · **Scope:** whole dashboard, with a deep pass on X-ray annotation

## How this was tested

- **Live, like real users.** A production build (`next build && next start`) ran against a local PostgreSQL 16 with the project's own seed data (4 branches, 48 patients, 69 appointments). Headless Chromium (Playwright) logged in as three real roles in the same clinic:
  - **OWNER**: `demo@smartchiro.org`
  - **ADMIN / front desk**: `dr.lim@smartchiro.org`
  - **DOCTOR**: `dr.aisha@smartchiro.org`
  - Also an owner of *other* clinics (`owner.personal@…`) and a second doctor (`dr.kumar@…`) for access checks.
- **Every dashboard page was visited per role** (18 pages × 3 roles). For each page we recorded time to HTML, time until all data had loaded, API calls, database queries (Postgres statement log), JS size, console errors and a screenshot.
- **X-ray annotation was driven by hand.** Three realistic radiographs (2400×3000 AP spine, lateral cervical, AP pelvis) were rendered from the BodyParts3D skeleton and attached to a patient. We then:
  - opened the viewer,
  - drew rulers and a Cobb angle,
  - flipped the image,
  - pressed the documented shortcuts,
  - closed tabs mid-edit,
  - timed rendering with 40 annotations.
- **Three parallel code reviews** covered the X-ray feature, performance, and role journeys. Each finding cites `file:line`.

**Legend:** ✅ **Verified live** (we reproduced it in the running app) · 🔍 **Code review** (read in source, not exercised end-to-end).

**Limits:** Uploads to Cloudflare R2 and the real Neon database couldn't be reached from the test environment. Upload and network-latency findings are therefore from code, and local timings are a best case: on Neon every database query adds a network round trip.

---

## 1. What to fix first (ranked)

Ranked by *harm × how many users hit it*, then by effort. Effort: **S** = hours, **M** = 1–3 days, **L** = a week or more.

| # | Fix | Why it's ranked here | Area | Effort | Evidence |
|---|-----|---------------------|------|--------|----------|
| **1** | **Lock down X-ray and annotation APIs, and add access checks to the viewer pages** | Anyone on the internet can read and **wipe** a patient's measurements with no login; other clinics can open your patients' X-rays | Security / data | S | ✅ |
| **2** | **Fix the Cobb angle maths and severity grades** | A 5.6° curve is shown and saved as **"174.4° — Severe"** | X-ray correctness | S | ✅ |
| **3** | **Fix the doctor picker (`/api/doctors` response shape)** | Front desk **cannot book** from the New Appointment dialog ("No doctors found") | Booking | S | ✅ |
| **4** | **Move X-ray upload to direct-to-R2 (presigned PUT)** | Uploads go through a serverless function. On Vercel (4.5 MB body limit) most real X-rays (5–30 MB) will fail | X-ray journey | M | 🔍 |
| **5** | **Stop shortcuts from jumping to another X-ray (K, ↑/↓)** | Pressing **K = Calibrate** reloads a *different* X-ray; the last edit and undo history are lost | X-ray data loss | S | ✅ |
| **6** | **Make flip / rotate move the annotations too, or disable them while annotations exist** | After a flip every measurement sits on the wrong anatomy | X-ray correctness | M | ✅ |
| **7** | **Make saving reliable: leave-page guard, fixed beacon, no dropped or crossed saves** | No "unsaved changes" prompt. The save beacon hits a 405. Edits made during a save are dropped. Multi-view can overwrite another X-ray's annotations with an empty set | X-ray data loss | M | ✅ / 🔍 |
| **8** | **Stop forms losing typed data on an outside click** (Visit/SOAP, Add Patient) | A stray click throws away a doctor's SOAP note | Clinical notes | S | ✅ |
| **9** | **One-click Check in / No-show / Start** (panel, calendar, dashboard) | Front desk can't check in a late patient or mark a no-show from Appointments | Front desk | S–M | ✅ |
| **10** | **Keep measurement values consistent** (panel vs canvas, Reset keeps calibration) | The canvas says 41 mm while the Measurements tab still says 36 mm | X-ray correctness | M | 🔍 |
| **11** | **Remove dead ends**: Invoices link (404), sidebar New Appointment (does nothing), top search (read-only), calendar-slot time prefill | First impressions; the three most visible controls don't work | Navigation | S | ✅ / 🔍 |
| **12** | **Viewer exits and outputs**: Close goes back to the patient; add Export/Print; link Compare; fix the help overlay and shortcut sheet | No way to produce a report, and Close leaves the app | X-ray journey | M | ✅ |
| **13** | **Look up role per branch; refresh the session after creating a branch; give Google sign-in users a role** | A new owner can't add doctors until re-login; Google owners never can | Onboarding / RBAC | M | 🔍 |
| **14** | **Speed pass 1**: pin the Vercel region to Neon, parallelise queries, slim `/api/patients`, add `loading.tsx`, stop `router.replace` refetches | 18–31 DB queries per page, 2 sequential API hops, blank clicks | Speed | M | ✅ / 🔍 |
| **15** | **Branch switcher for multi-branch owners** (Patients, booking, search) | Owners can't list, add or book patients in their other branches | Multi-branch | M | 🔍 |
| **16** | **Annotation canvas render performance** | Script cost per mouse move grows 2.6× with 40 shapes, which will stutter on tablets | X-ray speed | M | ✅ |
| **17** | **Tablet / stylus support in the viewer** | The spec says tablet-optimised; there is no pinch-zoom, `touch-action` or pointer-cancel handling | X-ray | M–L | 🔍 |
| **18** | **Mobile layout** (drawer sidebar under `md`) | On a phone the content area is **170 px** wide | Mobile | M | ✅ |
| **19** | **Invoice lifecycle** (list page, mark sent/paid, receipt) | Invoices stop at DRAFT; "Revenue paid" is always RM 0 | Billing | M | 🔍 |
| **20** | **Polish**: timezones (MYT), one toast system, accessible dialogs, consistent dates/MYR/status colours | Lots of small friction | Consistency | M | 🔍 |

> **Suggested sprint plan.**
> - **This week:** #1–3, #5, #8, #11. Each is small and removes a security hole, a wrong clinical number, or a broken core journey.
> - **Next:** #4, #6, #7, #9, #10, #12, to make the hero feature trustworthy.
> - **Then:** speed (#14, #16), multi-branch (#13, #15), tablet and mobile (#17, #18), and billing (#19).

---

## 2. X-ray annotation (hero feature) — detailed findings

### 2.1 How a clinician experiences it today

From "patient in front of me" to "measured X-ray saved" takes about **12–14 interactions**:

1. **Patients** → patient → **X-Rays** tab → **Upload X-Ray**.
2. Drop the file. There's no title, body region or view, so every card reads "Untitled" and the region/view filters and AI gating don't work for new uploads.
3. There's no "Open in viewer" after upload. You click the thumbnail and the viewer opens in a **new tab**.
4. A first-run overlay teaches gestures that are **out of date**: it says "Switch X-ray: scroll the wheel", but the wheel now pans (✅ seen in the screenshot).
5. The X-ray opens at 26%, off-centre, using under half the canvas height (✅).
6. Calibrate with **K**, which also means "previous X-ray" (✅ it navigated away). Calibration is per annotation, so it has to be redone for every film.
7. Ruler with **M**, two clicks. Autosave shows "Saved" (✅ works).
8. **There is no way to export, print or compare from here** (✅ no such controls exist in the viewer).

### 2.2 Verified live

| Finding | What we did | What happened |
|---|---|---|
| **Unauthenticated annotation read and overwrite** | `curl GET/PUT /api/annotations/{id}` with **no cookies** | GET returned the clinical `canvasState`. PUT `{"shapes":[]}` returned `{"success":true,"version":2}`, and the DB confirmed the measurements were wiped |
| **Unauthenticated X-ray listing** | `curl /api/xrays?patientId=…` and `/api/xrays/compare?ids=…` with no cookies | Full X-ray rows returned, including image URLs |
| **Cross-clinic viewing** | Logged in as the owner of *other* branches and opened the demo patient's annotate URL | The viewer showed **"Priya Nair · AP full spine"** and all 3 of her X-rays. The same user gets **403** from `/api/patients/{id}`, so the viewer page is the gap |
| **Doctor sees a colleague's patients' X-rays** | `dr.kumar` opened `dr.aisha`'s patient X-ray | Viewer opened with full edit rights; the patient API gives 403 |
| **Cobb angle wrong** | Drew a Cobb angle, clicking the second line in the opposite direction (true angle ≈ 5.6°) | Label shows **"174.4° — Severe"** |
| **Flip misaligns annotations** | Drew a ruler and a Cobb angle, then Adjust → Flip horizontally | The image mirrored (the "R" marker moved to the other side); the annotations **didn't move** |
| **K jumps to another X-ray** | Pressed **K** (documented as Calibrate) | Navigated to `…/xr-test-pelvis/annotate` with a full page load |
| **↓ jumps to another X-ray** | Pressed ↓ with nothing selected | Navigated to another X-ray. The same key nudges a selected shape, so it's easy to trigger by accident |
| **No leave-page protection** | Drew a ruler, then closed the tab immediately | No "unsaved changes" prompt |
| **Close (X) leaves the app** | Opened the viewer in a fresh tab (as the X-ray card does), clicked X | Went to `about:blank` (`router.back()` with no history) |
| **No export / print / compare in the UI** | Searched every button, link, title and aria-label in the viewer | None found |
| **Outdated first-run help** | First visit | "Switch X-ray: Scroll the wheel — no modifier" (the wheel pans now) |
| **Render cost grows with shapes** | 120 pointer moves, measured with CDP | 0 shapes: **1.6 ms** script per move. 40 rulers: **4.1 ms** per move (2.6×). On a tablet CPU (4–6× slower) that is about 16–25 ms, below 60 fps |
| **Opening speed is fine locally** | Timed the viewer | DOM at 391 ms; 1.75 MB X-ray visible at **477 ms** (localhost). No placeholder is used while a large image downloads |

### 2.3 From code review (not exercised live)

**Critical and high**

- **Multi-view silently erases other X-rays' annotations.**
  - `AnnotationCanvas.tsx:646-650` reads `fullData.canvasState`, but the API returns `{ annotation }` (`api/xrays/[xrayId]/annotations/[annotationId]/route.ts:328`).
  - So a second slot loads as empty, and the next autosave PUTs `[new line]` over the existing annotation.
  - Fix: read `fullData.annotation.canvasState` and add a round-trip test.
- **Autosave edge cases.**
  - The beacon uses POST but the route only has PUT, so it gets a 405 (`useAutoSave.ts:242`).
  - `setIsDirty(false)` after a save drops edits made while that save was in flight (`useAutoSave.ts:124-128`).
  - Switching slots cancels a pending save (`:178-186`).
  - Fix: an edit counter, one save at a time, `fetch(…, {keepalive:true, method:"PUT"})`.
- **Upload path.**
  - `api/xrays/upload/route.ts:23,89` buffers the whole file in a serverless function. The UI promises "up to 300 MB".
  - A failure leaves an `UPLOADING` row with `fileUrl: ''` that shows "Uploading…" forever.
  - The presigned `upload-url` + `confirm` routes already exist.
- **Stale measurements.**
  - `recomputeShapeDerived` updates angle and Cobb but not the ruler (`measurements.ts:105-140`).
  - The panel and export read the stored `measurement.label` while the canvas recomputes live (`PropertiesPanel.tsx:1067,1375`, `export-renderer.ts:47-50`).
- **Calibration lost.**
  - Adjust → **Reset** drops `pixelsPerMm` (`useImageAdjustments.ts` reset → `DEFAULT_IMAGE_ADJUSTMENTS`).
  - Brightness, contrast and calibration changes never call `markDirty`, so they're lost on reload.
  - In multi-view, one slot's calibration is saved onto another X-ray (`AnnotationCanvas.tsx:926-938`).
- **Two tabs on the same X-ray overwrite each other.** PUT increments `version` but never checks it. Fix: send the expected version and return 409 on a mismatch.
- **AI landmarks.**
  - Re-running adds a second full set of landmarks.
  - Landmarks can't be placed by hand.
  - No pelvis-only gating.
  - Images over 8 MB are rejected with no downscaling.
  - No `maxDuration` and no rate limit on Opus calls.
  - Bias-correction data is shared across **all clinics** and corrects against already-corrected points (`detect-landmarks/route.ts:229-248`).
- **Pelvic parameters are unsigned** (`Math.abs` in `pelvic-analysis.ts:125,149,216`). The chiropractor needs "R femoral head 4.2 mm low", not "4.2".
- **Tablet and stylus:**
  - No `touch-action`, `pointercancel`, pinch or pen/palm handling.
  - Tooltips are hover-only.
  - The X-ray card menu is `group-hover` only.
  - Vertex hit radius is 12 px.

**Medium and low**

- Right-drag brightness stops after the first movement: listeners re-subscribe on every render (`useViewerInputs.ts:112`).
- Any resize (opening the properties panel, sidebar toggle, tablet rotation) re-fits and **loses your zoom** (`useCanvasViewport.ts:193-201`).
- Duplicate (⌘D) doesn't offset `points`, so the copy sits exactly on top, with a duplicate measurement ID.
- Undo commands are pushed inside state updaters, so they can be doubled.
- Slider drags flood the 100-step undo history.
- The shortcut sheet lists P Freehand, X Eraser and ⇧M Angle, which don't exist. The real keys (A, ⇧A, D, R, K, ⇧L) are missing.
- Selection overlay draws resize/rotate handles that do nothing.
- No image loading or error state.
- Tools are enabled before the image loads.
- Missing dimensions fall back to 1024×768.
- The upload flow captures no region, view or visit, and accepts a single file only.
- Annotation versions (pre/post treatment) have an API but no UI.
- Broken Tailwind classes: `StatusBar.tsx:123` `rounded-mdver:…`, `EmptyCanvasHint.tsx:73` `rounded-mdansition-colors`.

### 2.4 Recommended X-ray roadmap

1. **Safety and correctness (1–2 days):**
   - Auth on `/api/annotations/*`, `/api/xrays`, `/api/xrays/compare`, `/confirm`, plus `canViewXray` on the annotate and compare pages, with doctor scoping.
   - Cobb `min(θ, 180−θ)` and correct grades.
   - Remove the K and ↑/↓ X-ray cycling (use `[` / `]`, only when the sidebar is focused).
   - Disable flip and rotate while annotations exist, until transforms are unified.
2. **Never lose work (2–3 days):** a leave-page guard, keepalive PUT, a save queue with an edit counter, the multi-view `fullData.annotation` fix, and version conflict detection.
3. **Complete the journey (1 week):**
   - Presigned direct upload with metadata (region, view, visit, several files) and "Annotate now".
   - An Export menu (PNG/PDF with calibrated labels and every shape type).
   - "Compare" from the X-Rays tab.
   - Close returns to the patient.
   - A clinic-default calibration.
4. **Feel (1 week):** memoise `ShapeRenderer` and `PropertiesPanel`, keep the cursor position out of React state, keep zoom on resize, a thumbnail placeholder, tablet gestures and larger touch targets.

---

## 3. User journeys by role

### 3.1 Scorecard

| Role | Journey | Rating | Notes |
|---|---|---|---|
| **Owner** | Register → verify → login | 🟡 Friction | The page you were going to is lost after login (no `callbackUrl`). Copy issues: "Invalid password or username", success shown in red |
| Owner | Create branch | 🟢 Smooth | |
| Owner | Add doctors | 🔴 Broken until re-login | Role is read once at login, so the Doctors page is read-only; Google owners never get a role (🔍 `auth.ts:57-92`) |
| Owner | Add first patient | 🟡 Friction | Quick Action `?add=true` is ignored; doctor picker hidden (same `/api/doctors` bug) |
| Owner | Multi-branch work | 🔴 Broken | No way to switch `activeBranchId`; Patients and booking only show one branch (🔍) |
| Owner | Issue invoice | 🔴 Broken | Draft only; no list, no mark paid; the Invoices link is a 404 (✅) |
| **Front desk** | Find patient fast | 🟡 Friction | Top-bar search is read-only (✅). The patients-page search works |
| Front desk | Book appointment | 🔴 Broken | "No doctors found" (✅); a calendar-slot click opens tomorrow at 10:00 instead of the clicked slot (🔍 `CreateAppointmentDialog.tsx:103`) |
| Front desk | Reschedule / cancel | 🟢 Smooth | Drag and drop plus dialogs |
| Front desk | Check in / no-show | 🔴 Broken | The panel only has Edit / Mark complete / Cancel / Delete (✅). Edit is disabled once the start time passes (🔍) |
| Front desk | Today at a glance | 🟡 Friction | Dashboard schedule rows look clickable but do nothing; capped at 10 with no "view all"; no Quick Actions for ADMIN |
| **Doctor** | See my day | 🟡 Friction | The calendar shows all colleagues by default; "today" is computed in UTC, not MYT |
| Doctor | Open patient | 🟡 Friction | Recent-patient rows link to the patient *list*, not the patient |
| Doctor | Record visit / SOAP | 🔴 Risky | An outside click discards the note (✅). Questionnaire scores default to 5/10 and are saved even if not asked, which skews the Recovery Trend |
| Doctor | X-ray review | 🟡 See §2 | |
| Doctor | Availability / time-off | 🟡 Friction | Buried under Doctors → own profile; booking ignores time-off (🔍) |
| **All** | Navigation | 🔴 | Invoices 404, sidebar New Appointment does nothing, top search read-only (all ✅) |
| All | Phone | 🔴 | Sidebar always visible; the main column is **170 px** of 390 (✅) |
| All | Anatomy | 🟢 Smooth | The 20 MB muscle model is heavy on tablets and mobile data |

### 3.2 Dead links and buttons that do nothing

| Control | Result | |
|---|---|---|
| Sidebar **Invoices** | 404 page with no app navigation; it is also prefetched (and 404s) on **every page load** | ✅ |
| Sidebar **New Appointment** | No handler | ✅ |
| Top-bar **Search** | `readonly` | ✅ |
| Quick Actions: Add Patient (`?add=true`), New Appointment (old `/dashboard/calendar`), Upload X-Ray, Add Doctor (goes to Branches) | Wrong or ignored targets | 🔍 |
| Dashboard **Today's schedule** rows | `cursor-pointer` with no action | 🔍 |
| Recent Patients / Branch → Patients rows | Go to the patient list, not the patient | 🔍 |
| Appointment **View visit** (`?visit=`) | The parameter is never read | 🔍 |
| **Connect WhatsApp** | The worker isn't deployed, so it shows a generic failure | 🔍 |
| `/dashboard/xrays/compare` | Nothing links to it | ✅ |

### 3.3 Other notable UX issues (🔍 code review)

- **Toasts.** `sonner` `<Toaster>` is only mounted on Appointments and the viewer, so `toast.error` on the patient X-Rays tab is invisible. There are three different toast systems.
- **Dialogs.** 12 of 14 custom dialogs have no `role="dialog"`, no Esc handling and no focus trap, and their labels have no `htmlFor`. Migrate them to shadcn `Dialog`.
- **Deleting patients.** Doctors can hard-delete a patient (with visits, X-rays and invoices) with one confirm. Limit this to OWNER/ADMIN and use type-to-confirm.
- **Timezones.** Visit dates default to the UTC day and display "8:00 AM". The dashboard's "today" uses the server's timezone. Use `Asia/Kuala_Lumpur`.
- **Staff lists.** Front-desk ADMINs appear as calendar doctor columns and in "Add Doctor". Rename it to "Add staff member" and filter lists by role.
- **Patients table.** It uses a fixed minimum width of about 1,020 px with `overflow-hidden`, so columns are cut off on laptops and the row menu is clipped.
- **Consistency.** Dates are formatted 5 different ways, MYR 4 ways, and status colours differ between screens. Centralise them in `src/lib/format.ts` and `STATUS_TOKENS`.
- **Keyboard access.** Clickable cards and rows aren't reachable by keyboard. Collapsed-sidebar icons have no names. Password show/hide buttons use `tabIndex=-1` and have no label.

---

## 4. Speed

### 4.1 Measured (production build, local Postgres, OWNER)

| Page | HTML ready | All data loaded | API calls (sequential waves) | DB queries |
|---|---|---|---|---|
| Dashboard | 60 ms | 632 ms | 4 (2) | **31** |
| Patients | 66 ms | 418 ms | 4 (1) | **28** |
| Patient detail | 40 ms | 376 ms | 3 (2) | 23 |
| Appointments | 66 ms | 484 ms | 2 (1) | 18 |
| Branch detail | 58 ms | 494 ms | 2 (2) | 15 |
| Doctor detail | 46 ms | 318 ms | 3 (2) | 20 |
| X-ray viewer | 58 ms | 384 ms | 2 (1) | 10 |

**Other measurements:**
- JS per page is 240–410 KB, and 530 KB on Anatomy.
- Every page also fires a failing `/dashboard/invoices` prefetch.

These are **best-case** numbers because the database is on the same machine. On Neon, each query is a network round trip, and many run **one after another**:
- Patient detail GET: 6 sequential.
- Autosave PUT: up to 17 sequential.
- In the same region that adds roughly 5–10 ms per query, about **+0.2–0.5 s per page**.
- **If the Vercel functions are in a different region from Neon** (`vercel.json` pins no region, and the default is `iad1`/US), that becomes about 200 ms per query, **roughly 3–6 s per page**.

### 4.2 Top speed wins (🔍 code review, backed by the counts above)

1. **Pin the Vercel region to Neon's region** (`vercel.json` → `"regions": ["sin1"]` or whichever matches Neon). One line, and possibly the biggest win.
2. **Slim `/api/patients`.**
   - It is unbounded and returns every patient's X-rays with annotation counts, which the list never uses (`api/patients/route.ts:181-212`).
   - The appointment patient-picker calls it **on every keystroke** and then keeps only the first 20.
   - Fix: add `select` + pagination, and a `?picker=1` mode with `take: 20`.
3. **Stop the waterfalls.** Fetch initial data in server `page.tsx` with `Promise.all` instead of `useEffect` after hydration, and `Promise.all` the independent queries inside routes.
4. **Add `loading.tsx`** (none exist), so a sidebar click gives instant feedback.
5. **Replace the `router.replace` URL sync with `window.history.replaceState`.** Every tab, date or filter change currently re-runs the page's server component and its DB queries.
6. **Activity feed** over-fetches full `Annotation.canvasState` JSON (can be MB) just to show a name and a time (`api/dashboard/activity/route.ts:40-54`).
7. **Autosave PUT** returns the whole row and runs up to 16 serial landmark upserts on *every* save. Use `select {id, version}`, one batched write, and capture landmarks only on change.
8. **Viewer:** use a display-size derivative (e.g. 4096 px WebP) with the thumbnail as a placeholder instead of the original file (up to 300 MB). Lazy-load `react-big-calendar` (only Week/Month use it).
9. **Indexes** for hot filters: `Xray(patientId,status,createdAt)`, `Visit(patientId,visitDate)`, `Appointment(doctorId,dateTime)`, `Appointment(patientId,dateTime)`, `Annotation(xrayId,updatedAt)`.
10. **Cache headers:** `immutable` on R2 objects and on `/models/*` (the 23 MB of anatomy models are currently `max-age=0`).

---

## 5. Appendix

- Test roles and data came from the project's own `prisma/seed.ts` and `prisma/seed-personal.ts` (password `12345678`).
- The test X-rays were synthetic renders from the BodyParts3D skeleton; they weren't committed.
- The temporary local-database changes (`PrismaPg` adapter swap, `.env`) were reverted, and nothing from the test setup is in the repo.
- Code-review agent reports (full detail with every `file:line`) were merged into this document. Items marked 🔍 should be reproduced before fixing.

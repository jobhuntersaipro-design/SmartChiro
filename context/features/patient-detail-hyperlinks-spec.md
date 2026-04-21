# Patient Detail — Deep-Linked Info & DOB Format

## Overview

Turn every actionable data point on the Patient Detail page into a hyperlink that opens in a **new tab**, so staff can jump from the patient record into the doctor profile, branch page, WhatsApp chat, email client, or maps without losing their place. Also normalize Date of Birth to `DD-MM-YYYY (Age)` everywhere it appears on this page.

Applies to: `/dashboard/patients/[patientId]/details` and all of its tabs (Overview, Visits, X-Rays, Profile).

---

## Goals

1. Every linkable field renders as a `<Link>` / `<a>` that opens in a **new tab** (`target="_blank" rel="noopener noreferrer"`).
2. Phone numbers (patient, emergency contact, doctor contact if shown) open a WhatsApp chat (`https://wa.me/<digits>`).
3. Email addresses open the user's mail client (`mailto:`).
4. Doctor names link to `/dashboard/doctors/[userId]`.
5. Branch names link to `/dashboard/branches/[branchId]`.
6. Addresses link to Google Maps search.
7. X-rays continue to open the annotator in a new tab (already implemented) — confirm and make consistent.
8. Date of Birth is shown in **DD-MM-YYYY (Age)** format everywhere on the page (header, Overview Quick Info, Profile tab).

---

## Link Map — Every Field on the Page

### Header card — `PatientDetailPage.tsx`

| Field | Current | New behavior |
|---|---|---|
| Patient full name | plain `<h1>` | **no link** (we're already on the patient page) |
| Status badge | static | **no link** |
| IC Number | plain text | **no link** (sensitive; no useful target) |
| Gender | plain text | **no link** |
| Age chip | `25y` | **no link** (DOB handled in Quick Info/Profile) |
| Phone | plain text | **WhatsApp link** `https://wa.me/<digits>` |
| Email | plain text | **mailto:** link |
| Doctor name | plain text | Link → `/dashboard/doctors/{doctorId}` (new tab) |
| Branch name | plain text | Link → `/dashboard/branches/{branchId}` (new tab) |

### Stat cards — `PatientDetailPage.tsx`

| Card | New behavior |
|---|---|
| Total Visits | **no link** (stat — tab click serves this) |
| X-Rays | **no link** (tab click serves this) |
| Next Appointment | **no link** for MVP (we don't have a single appointment detail page yet) |
| Recovery Trend | **no link** |

### Overview tab — `PatientOverviewTab.tsx`

**Quick Info sidebar:**

| Field | New behavior |
|---|---|
| IC Number | no link |
| Date of Birth | display as `DD-MM-YYYY (Age)` — **no link** |
| Gender, Blood Type, Occupation, Race, Marital Status, Referral Source, Member Since | no link |

**Emergency Contact sidebar:**

| Field | New behavior |
|---|---|
| Name | no link |
| Phone | **WhatsApp link** (replaces current `tel:` link) |
| Relationship | no link |

**Recent Visits list:**

| Field | New behavior |
|---|---|
| Date | no link |
| Visit type badge | no link |
| Chief complaint text | no link |
| Recovery score pill | no link |
| (If a doctor name becomes visible in future collapse) | doctor link |

**Upcoming Appointments list:**

| Field | New behavior |
|---|---|
| Date/time | no link (no appointment-detail page yet) |
| Doctor name | Link → `/dashboard/doctors/{doctorId}` (new tab) |
| Duration, status | no link |

### Visits tab — `PatientVisitsTab.tsx`

| Field | New behavior |
|---|---|
| Date | no link |
| Visit type badge | no link |
| `Dr. {name}` in card header | Link → `/dashboard/doctors/{doctorId}` (new tab) |
| Chief complaint, area tags, technique, SOAP, vitals, questionnaire | no link |

### X-Rays tab — `PatientXraysTab.tsx`

| Field | New behavior |
|---|---|
| X-ray card | Link → `/dashboard/xrays/{xrayId}/annotate?patientId={patientId}` in **new tab** (already present — confirm `target="_blank"` and `rel="noopener noreferrer"`) |

### Profile tab — `PatientProfileTab.tsx`

| Section | Field | New behavior |
|---|---|---|
| Personal | Full Name | no link |
| Personal | IC Number | no link |
| Personal | **Date of Birth** | **display as `DD-MM-YYYY (Age)`** |
| Personal | Gender, Occupation, Race, Marital Status, Blood Type | no link |
| Contact | Email | `mailto:` link |
| Contact | Phone | WhatsApp link |
| Contact | Address | Link → Google Maps `https://www.google.com/maps/search/?api=1&query={encoded}` (only when at least one address part present) |
| Emergency | Name | no link |
| Emergency | Phone | WhatsApp link |
| Emergency | Relationship | no link |
| Clinical | Allergies, Referral Source, Medical History, Notes | no link |
| Pricing | amounts | no link |
| Administrative | Patient ID | no link |
| Administrative | **Doctor** | Link → `/dashboard/doctors/{doctorId}` (new tab) |
| Administrative | **Branch** | Link → `/dashboard/branches/{branchId}` (new tab) |
| Administrative | Status, Created, Updated | no link |

---

## Data Contract Changes

Some links need an `id` that the current props don't always expose. Verify & widen the prop types:

- `PatientOverviewTab` → `visits[].doctor` already has `{ id, name }` ✅; `appointments[].doctor` already has `{ id, name }` ✅.
- `PatientVisitsTab` (via `Visit` type) → confirm `visit.doctor.id` exists. If not, thread it through `GET /api/patients/[id]/visits`.
- `PatientProfileTab` → already receives `doctorId` and `branchId` ✅.
- `PatientDetailPage` header → `patient.doctorId` and `patient.branchId` already on `Patient` type ✅.

No API or schema changes required.

---

## New Utility: `src/lib/format.ts`

Single source of truth for the formatting/link helpers. Pure functions, no React.

```ts
// DD-MM-YYYY (Age)
export function formatDobWithAge(iso: string | null | undefined): string | null

// Strip, normalize Malaysia-friendly, return wa.me URL. Returns null when phone can't be normalized.
export function buildWhatsAppUrl(phone: string | null | undefined): string | null

// mailto:<email> (returns null when empty/invalid)
export function buildMailtoUrl(email: string | null | undefined): string | null

// https://www.google.com/maps/search/?api=1&query=<encoded>
export function buildMapsUrl(address: string | null | undefined): string | null

// /dashboard/doctors/<id>
export function buildDoctorHref(userId: string): string

// /dashboard/branches/<id>
export function buildBranchHref(branchId: string): string
```

### Normalization rules

- **Phone → WhatsApp**: strip all non-digits. If result starts with `0` → replace leading `0` with `60`. If starts with `60` → keep. If starts with another country code digit and is > 10 chars → keep. If < 7 digits → return `null`.
- **Email**: simple `x@y.z` regex check. `null` if fails.
- **DOB**: parse ISO → extract UTC day/month/year to avoid timezone drift on birthdays. Compute age from *local today*. Format as `DD-MM-YYYY (<age>)` with 2-digit zero-pad.
- **Address**: join non-empty parts with `, `; return `null` if all empty.

---

## Shared Link Component

Create `src/components/patients/ExternalLink.tsx` to avoid repeating `target="_blank" rel="noopener noreferrer"` everywhere:

```tsx
export function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-[#533afd] hover:underline"}
    >
      {children}
    </a>
  );
}
```

Use this for every hyperlink added in this spec (including internal routes like `/dashboard/doctors/[id]` — the requirement is **always new tab**).

---

## UI Behavior

- Hover state: underline, `#533afd` (primary). Matches existing link style used in emergency phone and back-to-list links.
- Inactive value (`-`): render as plain text, **never** as a link.
- Ensure rows with icons still show the icon + link inline without losing layout (use `inline-flex items-center gap-1.5` patterns already used in the header).
- Doctor / Branch links must visually distinguish themselves from surrounding muted text. Currently the header uses `text-[#273951]` for name — upgrade to `#533afd` with hover underline.

---

## Files to Touch

**New:**
1. `src/lib/format.ts` — utility functions
2. `src/lib/__tests__/format.test.ts` — RED tests first
3. `src/components/patients/ExternalLink.tsx` — tiny wrapper

**Modified:**
4. `src/components/patients/PatientDetailPage.tsx` — header card links (phone, email, doctor, branch); DOB formatting in header chip
5. `src/components/patients/PatientOverviewTab.tsx` — Quick Info DOB formatting, emergency phone → WhatsApp, appointment doctor link
6. `src/components/patients/PatientVisitsTab.tsx` — doctor link in visit card header
7. `src/components/patients/PatientProfileTab.tsx` — DOB formatting, phone/email/address/doctor/branch links
8. `src/components/patients/PatientXraysTab.tsx` — verify `target="_blank"` on X-ray cards (add if missing)

No API, no Prisma migration.

---

## TDD Plan

Follow `/tdd-workflow`: 🔴 → 🟢 → 🔵.

### Phase 1 — `src/lib/format.ts` (pure functions, highest TDD value)

**RED** — write failing tests first in `src/lib/__tests__/format.test.ts`:

| # | Test name | Asserts |
|---|---|---|
| 1 | `formatDobWithAge returns DD-MM-YYYY with age` | `formatDobWithAge("1990-05-15T00:00:00.000Z")` → matches `/^15-05-1990 \(\d{1,3}\)$/` |
| 2 | `formatDobWithAge pads single-digit day/month` | `"2000-01-05"` → starts with `"05-01-2000"` |
| 3 | `formatDobWithAge returns null for null/undefined/empty` | each returns `null` |
| 4 | `formatDobWithAge handles pre-birthday (age not yet +1 this year)` | freeze-time test: DOB next month last year → age = years-1 |
| 5 | `buildWhatsAppUrl strips formatting characters` | `"+60 12-345 6789"` → `"https://wa.me/60123456789"` |
| 6 | `buildWhatsAppUrl converts local MY number (leading 0)` | `"012-345 6789"` → `"https://wa.me/60123456789"` |
| 7 | `buildWhatsAppUrl preserves existing 60 prefix` | `"60123456789"` → `"https://wa.me/60123456789"` |
| 8 | `buildWhatsAppUrl returns null for too-short` | `"123"` → `null` |
| 9 | `buildWhatsAppUrl returns null for null/empty` | each → `null` |
| 10 | `buildMailtoUrl returns mailto for valid email` | `"a@b.com"` → `"mailto:a@b.com"` |
| 11 | `buildMailtoUrl returns null for invalid` | `"not-an-email"` → `null` |
| 12 | `buildMapsUrl encodes address` | `"123 Jalan Ampang, KL"` → contains `query=123%20Jalan%20Ampang%2C%20KL` |
| 13 | `buildMapsUrl returns null for empty` | `""` → `null` |
| 14 | `buildDoctorHref builds internal path` | `"u123"` → `"/dashboard/doctors/u123"` |
| 15 | `buildBranchHref builds internal path` | `"b123"` → `"/dashboard/branches/b123"` |

Run `npm run test -- format.test` — all 15 fail.

**GREEN** — implement `src/lib/format.ts` to make each test pass; do **not** add features beyond what tests require.

**REFACTOR** — extract the non-digit strip + MY-normalize into a private helper if duplication appears.

### Phase 2 — `ExternalLink` component

**RED** — `src/components/patients/__tests__/ExternalLink.test.tsx`:

| # | Test |
|---|---|
| 16 | Renders anchor with given href |
| 17 | Always sets `target="_blank"` |
| 18 | Always sets `rel="noopener noreferrer"` |
| 19 | Applies default className when none provided |
| 20 | Accepts custom className override |

**GREEN** — implement the 8-line wrapper.

### Phase 3 — Page wiring (manual verification, minimal rendering tests)

Since page composition is mostly layout, we don't TDD every pixel — we do:

1. Snapshot test each touched component file: assert that when a non-null doctorId/doctor.id is present, an anchor with `href` starting with `/dashboard/doctors/` **and** `target="_blank"` is rendered. Same for branch, phone (wa.me), email (mailto), address (google.com/maps).
2. Manual verification in the browser per `ai-interaction.md` workflow step 4 (Test).

**RED** (component-level, using `@testing-library/react`):

| # | Test file | Test |
|---|---|---|
| 21 | `PatientDetailPage.test.tsx` | header doctor name renders as `/dashboard/doctors/<id>` anchor with `target="_blank"` |
| 22 | `PatientDetailPage.test.tsx` | header phone renders as `wa.me/...` anchor, `target="_blank"` |
| 23 | `PatientDetailPage.test.tsx` | header email renders as `mailto:` anchor |
| 24 | `PatientDetailPage.test.tsx` | header DOB chip shows `DD-MM-YYYY (<age>)` format |
| 25 | `PatientProfileTab.test.tsx` | DOB row shows `DD-MM-YYYY (<age>)` |
| 26 | `PatientProfileTab.test.tsx` | Address row renders Google Maps anchor |
| 27 | `PatientProfileTab.test.tsx` | Phone row renders WhatsApp anchor |
| 28 | `PatientProfileTab.test.tsx` | Doctor row renders `/dashboard/doctors/<id>` anchor with `target="_blank"` |
| 29 | `PatientProfileTab.test.tsx` | Branch row renders `/dashboard/branches/<id>` anchor with `target="_blank"` |
| 30 | `PatientOverviewTab.test.tsx` | Emergency phone renders as WhatsApp (not `tel:`) |
| 31 | `PatientOverviewTab.test.tsx` | Appointment doctor name renders as `/dashboard/doctors/<id>` anchor |
| 32 | `PatientVisitsTab.test.tsx` | `Dr. <name>` in card header renders as `/dashboard/doctors/<id>` anchor |

If `@testing-library/react` is not yet set up in the project, fall back to unit-testing the util layer (Phases 1–2) and do the component wiring under **manual browser verification** — document this choice in the PR description.

**GREEN** — wire each component. Keep changes minimal; reuse `ExternalLink`.

**REFACTOR** — dedupe inline icon + anchor patterns if they recur ≥ 3 times.

---

## Edge Cases & Guardrails

- **Missing id**: if `doctorId` or `branchId` is falsy, render the name as plain text (do not produce a broken link).
- **Missing phone**: if `buildWhatsAppUrl` returns `null`, render phone as plain text.
- **Missing email**: ditto `mailto:`.
- **Missing address**: if all 6 address parts are empty, render `-` (current behavior).
- **DOB timezone**: parse as UTC to prevent the date shifting by one day when the DB value is midnight UTC.
- **Sensitive data (IC number, Patient ID, Status)**: never link — confirmed above.
- **Security**: every external anchor must include `rel="noopener noreferrer"`. Internal new-tab anchors benefit from the same `rel` to prevent reverse-tabnabbing.
- **SSR / hydration**: all link building is deterministic from props → no hydration drift risk.

---

## Acceptance Criteria

- [ ] `formatDobWithAge("1995-03-07")` returns `"07-03-1995 (<current age>)"`.
- [ ] On the header card, clicking the phone opens `https://wa.me/60…` in a new tab.
- [ ] On the header card, clicking the doctor name opens the doctor detail page in a new tab.
- [ ] On the header card, clicking the branch name opens the branch detail page in a new tab.
- [ ] Date of Birth is shown in `DD-MM-YYYY (Age)` format on the header (age chip), Overview Quick Info, and Profile tab.
- [ ] Profile tab Address row links out to Google Maps with the full joined address in the query.
- [ ] Emergency contact phone opens WhatsApp (not `tel:`).
- [ ] Every visit card's `Dr. <name>` deep-links to the doctor page in a new tab.
- [ ] Appointment doctor names deep-link to the doctor page in a new tab.
- [ ] X-ray cards continue to open the annotator in a new tab (verified).
- [ ] All 30 new Vitest tests pass (`npm run test`).
- [ ] `npm run build` passes with no new TypeScript or ESLint errors.
- [ ] Manual verification: no broken links, no `tel:` prompts on desktop, DOB never renders as Invalid Date.

---

## Out of Scope (not in this PR)

- Appointment-detail deep link (no such page yet).
- WhatsApp Business prefilled template text / merge fields.
- Clinic phone from branch record on patient header (only doctor + branch names are linked; branch phone is on the branch page).
- Click-to-copy on IC number / Patient ID.
- Adding these links to any page **other than** Patient Detail (e.g., Doctor Detail or Branches). Those can be separate specs that reuse `src/lib/format.ts` + `ExternalLink`.

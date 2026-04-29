# Visit Payments & Packages

## Goal

Add payment tracking to visits, package-based session pricing, and an owner-level revenue & top-doctor overview.

## Decisions (locked)

1. **Payment lives on `Invoice`** — every billable visit auto-creates an `Invoice`; UI updates the Invoice's `status`.
2. **Packages**: branch-scoped templates. Patients purchase `PatientPackage` instances; visits can redeem 1 session.
3. **Visit purpose**: keep `Visit.visitType` field, migrate from free string → `VisitType` enum.
4. **Revenue**: 30-day window only (last 30 days), grouped by day.
5. **Top performers**: ranked by **visit count** (descending), 30-day window, scoped by branch.
6. **Currency**: `MYR` (matches existing `Invoice.currency` default).
7. **RBAC**:
   - `OWNER` / `ADMIN`: full CRUD on packages, sell packages, update payments.
   - `DOCTOR`: update payment status; cannot edit package templates.
   - `VIEWER` (none yet): read-only.

## Data Model

### New enum: `VisitType`

```
INITIAL_CONSULTATION
FIRST_TREATMENT
FOLLOW_UP
RE_EVALUATION
EMERGENCY
DISCHARGE
OTHER
```

Migration: convert existing `Visit.visitType` strings (`"initial"` → `INITIAL_CONSULTATION`, `"follow_up"` → `FOLLOW_UP`, `"emergency"` → `EMERGENCY`, `"reassessment"` → `RE_EVALUATION`, `"discharge"` → `DISCHARGE`, anything else → `OTHER`).

### New: `Package` (branch-scoped template)

```prisma
model Package {
  id            String        @id @default(cuid())
  branchId      String
  branch        Branch        @relation(fields: [branchId], references: [id], onDelete: Cascade)
  name          String        // e.g. "10-Visit Adjustment Plan"
  description   String?
  sessionCount  Int           // total sessions included
  price         Decimal       // total package price (MYR)
  currency      String        @default("MYR")
  validityDays  Int?          // null = no expiry
  status        PackageStatus @default(ACTIVE)
  patientPackages PatientPackage[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  @@index([branchId])
  @@index([status])
}

enum PackageStatus {
  ACTIVE
  ARCHIVED
}
```

### New: `PatientPackage` (purchased instance)

```prisma
model PatientPackage {
  id            String                 @id @default(cuid())
  patientId     String
  patient       Patient                @relation(fields: [patientId], references: [id], onDelete: Cascade)
  packageId     String
  package       Package                @relation(fields: [packageId], references: [id])
  branchId      String
  branch        Branch                 @relation(fields: [branchId], references: [id], onDelete: Cascade)
  purchasedAt   DateTime               @default(now())
  expiresAt     DateTime?              // null = no expiry
  sessionsTotal Int                    // snapshot at purchase
  sessionsUsed  Int                    @default(0)
  totalPrice    Decimal                // snapshot
  status        PatientPackageStatus   @default(ACTIVE)
  invoiceId     String?                @unique // optional invoice for the package purchase itself
  invoice       Invoice?               @relation("PackageInvoice", fields: [invoiceId], references: [id])
  visits        Visit[]
  createdAt     DateTime               @default(now())
  updatedAt     DateTime               @updatedAt
  @@index([patientId])
  @@index([branchId])
  @@index([status])
}

enum PatientPackageStatus {
  ACTIVE
  COMPLETED   // sessionsUsed >= sessionsTotal
  EXPIRED     // past expiresAt
  CANCELLED
}
```

### Updated: `Visit`

- `visitType` → `VisitType?` (was String)
- `invoiceId String? @unique` (optional one-to-one with Invoice for the visit)
- `patientPackageId String?` (when visit is redeemed from a package)
- New relations: `invoice`, `patientPackage`

### Updated: `Invoice`

- Add `visitId String? @unique` back-ref via Visit (kept on Visit side since Visit is the owning side; one-to-one via @unique)
- Add inverse relation for `PatientPackage` (`packageInvoiceFor` named relation)
- Existing `status` (`DRAFT/SENT/PAID/OVERDUE/CANCELLED`) is what UI mutates.

## API Routes

### Packages (template)

- `GET /api/branches/[branchId]/packages` — list (active by default, `?status=archived` to filter). Branch member only.
- `POST /api/branches/[branchId]/packages` — create. **OWNER/ADMIN only.**
- `PATCH /api/packages/[packageId]` — update fields. **OWNER/ADMIN only.**
- `DELETE /api/packages/[packageId]` — soft archive (set `status = ARCHIVED`). **OWNER/ADMIN only.**

### Patient packages (purchases)

- `GET /api/patients/[patientId]/packages` — list patient's packages. Branch member only.
- `POST /api/patients/[patientId]/packages` — sell/assign a package. **OWNER/ADMIN only.** Creates `PatientPackage` and optional purchase invoice (status `PAID` if `paidNow=true`, else `DRAFT`).
- `PATCH /api/patient-packages/[id]` — update (cancel, mark paid). **OWNER/ADMIN only.**

### Visit payment

- `PATCH /api/visits/[visitId]/payment` — body `{ status: InvoiceStatus, amount?, method?, paidAt?, notes? }`. Creates Invoice if missing. Branch member.

### Dashboard

- `GET /api/dashboard/revenue?branchId=&days=30` — returns `{ series: [{ date, amount }], total }` for the window.
- `GET /api/dashboard/top-doctors?branchId=&days=30&limit=5` — returns `[{ doctorId, name, visitCount, revenue }]` sorted by visitCount desc.

## UI Changes

### `CreateVisitDialog`

- Replace string `visitType` select options with `VisitType` enum (labels: "Initial Consultation", "First Treatment", "Follow-Up", "Re-Evaluation", "Emergency", "Discharge", "Other").
- New "Billing" collapsible section:
  - Radio: **Pay per visit** (input `fee` MYR, optional) | **Use package** (select active `PatientPackage` with `X/Y sessions left` label, disabled if none).
  - When **Pay per visit** + fee > 0: server creates an Invoice with `status=DRAFT`.
  - When **Use package**: server links visit to the chosen `PatientPackage` and increments `sessionsUsed`; if `sessionsUsed >= sessionsTotal`, set status `COMPLETED`. No invoice.

### `PatientVisitsTab`

- Each visit card shows a **payment status badge** (PAID/DRAFT/SENT/OVERDUE/PACKAGE/UNBILLED).
- Kebab → "Update Payment" → `UpdatePaymentDialog` (status, amount, method, notes).
- "PACKAGE" badge clicks open the patient package detail.

### Patient header / Overview tab

- New "Active Packages" tile in Quick Info: e.g. `10-Visit Plan — 3/10 left · expires 2026-08-01`.
- "Sell Package" button (OWNER/ADMIN only) → `SellPackageDialog`.

### Branch Settings tab

- New "Packages" sub-section (OWNER/ADMIN only): list, create, edit, archive package templates.

### Owner Dashboard

- New row of cards above schedule:
  - **Revenue (Last 30 Days)** — area chart (Recharts via shadcn/chart) with branch dropdown filter.
  - **Top Doctors (Last 30 Days)** — ranked list with avatar, name, visit count, revenue, branch dropdown filter.

## Seed

- 2-3 package templates per branch:
  - "10-Visit Adjustment Plan" — 10 sessions, RM 1500
  - "5-Visit Trial Package" — 5 sessions, RM 800
  - "Monthly Unlimited" — 30 sessions, RM 2500, 30-day validity
- Sell 1-2 packages to ~30% of patients (mix of ACTIVE/COMPLETED).
- For existing visits:
  - 50% billed via per-visit invoice with `status=PAID`, fee RM 80-200
  - 20% billed `status=DRAFT` (unpaid)
  - 20% redeemed from a `PatientPackage`
  - 10% no billing (legacy/free)
- Spread visits across the last 30 days for a meaningful revenue chart.

## Tests

- Schema migration backfill (visitType strings → enum)
- Package CRUD RBAC (DOCTOR cannot create/edit/archive)
- PatientPackage assignment + invoice creation
- Visit payment PATCH (invoice auto-create + update)
- Revenue endpoint shape & date bucketing
- Top-doctors endpoint ordering

## Out of Scope (this branch)

- Stripe integration for online payments
- Refunds / partial payments
- LHDN MyInvois compliance
- Bulk package transfers across patients
- VIEWER role enforcement (deferred)

## Files Affected (estimate)

- Schema + migration: 2
- API routes: ~8 new files
- Components: ~6 new + ~5 edited
- Seed: 1 (`prisma/seed.ts`)
- Types: 2 (`src/types/package.ts`, `src/types/payment.ts`)
- Tests: ~6 files

import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";

/**
 * Prepaid package rules (Phase 3). Pure — no database access; the DB side
 * lives in src/lib/package-service.ts.
 */

export type PackageStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";

/** The fields these rules read — a Prisma PatientPackage row satisfies it. */
export interface PackageLike {
  id: string;
  status: PackageStatus;
  sessionsTotal: number;
  sessionsUsed: number;
  expiresAt: Date | null;
  /** Empty = any treatment type redeems it. */
  treatmentTypes: string[];
  /** Decimal from Prisma, or a plain number. */
  price: number | { toString(): string };
}

export function sessionsLeft(pkg: Pick<PackageLike, "sessionsTotal" | "sessionsUsed">): number {
  return Math.max(0, pkg.sessionsTotal - pkg.sessionsUsed);
}

/**
 * Status as the user should see it: a stored ACTIVE package is EXPIRED once
 * `expiresAt` has passed and COMPLETED once every session is used. The cron
 * sweep (src/app/api/reminders/dispatch) catches up the stored value.
 */
export function effectiveStatus(
  pkg: Pick<PackageLike, "status" | "sessionsTotal" | "sessionsUsed" | "expiresAt">,
  now: Date = new Date(),
): PackageStatus {
  if (pkg.status !== "ACTIVE") return pkg.status;
  if (sessionsLeft(pkg) === 0) return "COMPLETED";
  if (pkg.expiresAt && pkg.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

export function treatmentMatches(pkg: Pick<PackageLike, "treatmentTypes">, treatmentType: string | null | undefined): boolean {
  if (pkg.treatmentTypes.length === 0) return true;
  return !!treatmentType && pkg.treatmentTypes.includes(treatmentType);
}

/** Why a package can't pay for an appointment at `at`, or null when it can. */
export function ineligibilityReason(
  pkg: PackageLike,
  treatmentType: string | null | undefined,
  at: Date,
): "not_active" | "expired" | "used_up" | "treatment_mismatch" | null {
  if (pkg.status !== "ACTIVE") return "not_active";
  if (sessionsLeft(pkg) === 0) return "used_up";
  if (pkg.expiresAt && pkg.expiresAt.getTime() <= at.getTime()) return "expired";
  if (!treatmentMatches(pkg, treatmentType)) return "treatment_mismatch";
  return null;
}

/**
 * The package that should pay for an appointment of `treatmentType` at `at`:
 * the earliest-expiring eligible one (packages without an expiry come last,
 * ties broken by input order). `preferredId` (e.g. the series' package) wins
 * when it is eligible.
 */
export function pickPackageForAppointment<T extends PackageLike>(
  packages: T[],
  treatmentType: string | null | undefined,
  at: Date,
  preferredId?: string | null,
): T | null {
  const eligible = packages.filter((p) => ineligibilityReason(p, treatmentType, at) === null);
  if (eligible.length === 0) return null;
  const preferred = preferredId ? eligible.find((p) => p.id === preferredId) : undefined;
  if (preferred) return preferred;
  const expiry = (p: T) => p.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return eligible.reduce((best, p) => (expiry(p) < expiry(best) ? p : best));
}

/** Value of one session in MYR, rounded to sen (for liability reports). */
export function unitValue(pkg: Pick<PackageLike, "price" | "sessionsTotal">): number {
  if (pkg.sessionsTotal <= 0) return 0;
  return Math.round((Number(pkg.price.toString()) / pkg.sessionsTotal) * 100) / 100;
}

/**
 * Expiry for a package sold at `purchasedAt` valid for `validityDays`: the end
 * of the clinic day `validityDays` days later (null = never expires).
 */
export function expiryFor(purchasedAt: Date, validityDays: number | null | undefined): Date | null {
  if (!validityDays || validityDays <= 0) return null;
  const lastDay = clinicDateKey(new Date(purchasedAt.getTime() + validityDays * 86_400_000));
  return clinicDayBounds(lastDay).end;
}

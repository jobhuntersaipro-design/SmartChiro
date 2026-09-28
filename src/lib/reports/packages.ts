import type { PackageLiabilityRow } from "@/types/reports";
import { effectiveStatus, sessionsLeft, unitValue, type PackageStatus } from "@/lib/packages";

/**
 * Package liability (pure): sessions already paid for but not yet delivered.
 * Only packages that are still usable count — a used-up, expired or cancelled
 * package owes nothing. Each session is worth the package price ÷ sessions.
 */

export const EXPIRING_WITHIN_DAYS = 30;

export interface LiabilityPackage {
  name: string;
  status: PackageStatus;
  sessionsTotal: number;
  sessionsUsed: number;
  price: number | { toString(): string };
  expiresAt: Date | null;
}

export interface LiabilitySummary {
  active: number;
  sessionsOutstanding: number;
  liability: number;
  expiringSoon: { count: number; sessions: number; liability: number };
  byPackage: PackageLiabilityRow[];
}

interface Acc {
  active: number;
  sessionsLeft: number;
  liabilitySen: number;
  expiringSoon: number;
}

export function packageLiability(packages: LiabilityPackage[], now: Date = new Date()): LiabilitySummary {
  const soonCutoff = now.getTime() + EXPIRING_WITHIN_DAYS * 86_400_000;
  const byName = new Map<string, Acc>();
  let active = 0;
  let sessions = 0;
  let liabilitySen = 0;
  const soon = { count: 0, sessions: 0, liabilitySen: 0 };

  for (const pkg of packages) {
    if (effectiveStatus(pkg, now) !== "ACTIVE") continue;
    const left = sessionsLeft(pkg);
    const valueSen = Math.round(unitValue(pkg) * 100) * left;
    const expiring = !!pkg.expiresAt && pkg.expiresAt.getTime() <= soonCutoff;
    active += 1;
    sessions += left;
    liabilitySen += valueSen;
    if (expiring) {
      soon.count += 1;
      soon.sessions += left;
      soon.liabilitySen += valueSen;
    }
    const acc = byName.get(pkg.name) ?? { active: 0, sessionsLeft: 0, liabilitySen: 0, expiringSoon: 0 };
    acc.active += 1;
    acc.sessionsLeft += left;
    acc.liabilitySen += valueSen;
    if (expiring) acc.expiringSoon += 1;
    byName.set(pkg.name, acc);
  }

  return {
    active,
    sessionsOutstanding: sessions,
    liability: liabilitySen / 100,
    expiringSoon: { count: soon.count, sessions: soon.sessions, liability: soon.liabilitySen / 100 },
    byPackage: [...byName]
      .map(([name, a]) => ({
        name,
        active: a.active,
        sessionsLeft: a.sessionsLeft,
        liability: a.liabilitySen / 100,
        expiringSoon: a.expiringSoon,
      }))
      .sort((a, b) => b.liability - a.liability || a.name.localeCompare(b.name)),
  };
}

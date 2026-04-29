export type PackageStatus = "ACTIVE" | "ARCHIVED";
export type PatientPackageStatus = "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELLED";

export interface Package {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  sessionCount: number;
  price: number;
  currency: string;
  validityDays: number | null;
  status: PackageStatus;
  createdAt: string;
  updatedAt: string;
  patientCount?: number;
}

export interface PatientPackage {
  id: string;
  patientId: string;
  packageId: string;
  branchId: string;
  packageName: string;
  packageDescription: string | null;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsRemaining: number;
  totalPrice: number;
  currency: string;
  purchasedAt: string;
  expiresAt: string | null;
  status: PatientPackageStatus;
  invoiceId: string | null;
  invoiceStatus: string | null;
  invoiceAmount: number | null;
  createdAt: string;
}

export interface CreatePackageData {
  name: string;
  description?: string;
  sessionCount: number;
  price: number;
  validityDays?: number | null;
}

export interface SellPackageData {
  packageId: string;
  paymentMethod?: "CASH" | "CARD" | "BANK_TRANSFER" | "EWALLET" | "INSURANCE" | "OTHER";
  markPaid?: boolean;
}

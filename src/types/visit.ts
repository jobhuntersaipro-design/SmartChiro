export type VisitType =
  | "INITIAL_CONSULTATION"
  | "FIRST_TREATMENT"
  | "FOLLOW_UP"
  | "RE_EVALUATION"
  | "EMERGENCY"
  | "DISCHARGE"
  | "OTHER";

export const VISIT_TYPES: VisitType[] = [
  "INITIAL_CONSULTATION",
  "FIRST_TREATMENT",
  "FOLLOW_UP",
  "RE_EVALUATION",
  "EMERGENCY",
  "DISCHARGE",
  "OTHER",
];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  INITIAL_CONSULTATION: "Initial Consultation",
  FIRST_TREATMENT: "First Treatment",
  FOLLOW_UP: "Follow-Up",
  RE_EVALUATION: "Re-Evaluation",
  EMERGENCY: "Emergency",
  DISCHARGE: "Discharge",
  OTHER: "Other",
};

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "EWALLET" | "INSURANCE" | "OTHER";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  EWALLET: "E-wallet",
  INSURANCE: "Insurance",
  OTHER: "Other",
};

export interface VisitInvoiceSummary {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  notes: string | null;
}

export interface VisitPackageSummary {
  id: string;
  packageName: string;
  sessionsUsed: number;
  sessionsTotal: number;
}

export interface VisitQuestionnaire {
  id: string;
  painLevel: number;
  mobilityScore: number;
  sleepQuality: number;
  dailyFunction: number;
  overallImprovement: number;
  patientComments: string | null;
}

export interface Visit {
  id: string;
  visitDate: string;
  visitType: VisitType | null;
  chiefComplaint: string | null;
  // SOAP
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatmentNotes: string | null;
  // Treatment
  areasAdjusted: string | null;
  techniqueUsed: string | null;
  subluxationFindings: string | null;
  // Vitals
  bloodPressureSys: number | null;
  bloodPressureDia: number | null;
  heartRate: number | null;
  weight: number | null;
  temperature: number | null;
  // Recommendations
  recommendations: string | null;
  referrals: string | null;
  nextVisitDays: number | null;
  // Billing
  invoice: VisitInvoiceSummary | null;
  patientPackage: VisitPackageSummary | null;
  // Relations
  questionnaire: VisitQuestionnaire | null;
  doctor: { id: string; name: string | null };
  xrays: {
    id: string;
    title: string | null;
    thumbnailUrl: string | null;
    bodyRegion: string | null;
  }[];
  createdAt: string;
}

export type VisitBillingPayload =
  | { mode: "none" }
  | { mode: "per_visit"; fee: number; paymentMethod?: PaymentMethod; markPaid?: boolean }
  | { mode: "package"; patientPackageId: string };

export interface CreateVisitData {
  visitDate?: string;
  visitType?: VisitType;
  chiefComplaint?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  treatmentNotes?: string;
  areasAdjusted?: string;
  techniqueUsed?: string;
  subluxationFindings?: string;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  heartRate?: number;
  weight?: number;
  temperature?: number;
  recommendations?: string;
  referrals?: string;
  nextVisitDays?: number;
  questionnaire?: {
    painLevel: number;
    mobilityScore: number;
    sleepQuality: number;
    dailyFunction: number;
    overallImprovement: number;
    patientComments?: string;
  };
  billing?: VisitBillingPayload;
}

import type { CertificateStage } from "@/lib/certificates";

/** One clinician whose Annual Practising Certificate needs attention. */
export interface CertificateAlertRow {
  userId: string;
  name: string | null;
  tcmRegistrationNo: string | null;
  apcNumber: string | null;
  /** "YYYY-MM-DD" */
  expiresOn: string;
  /** Negative once expired. */
  daysLeft: number;
  stage: Exclude<CertificateStage, "ok">;
  branches: string[];
}

export interface CertificateAlertsResponse {
  certificates: CertificateAlertRow[];
}

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
  visitType: string | null;
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

export interface CreateVisitData {
  visitDate?: string;
  visitType?: string;
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
}

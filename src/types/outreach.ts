export type OutreachTypeName = "RECALL" | "REVIEW";
export type OutreachStatusName = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

/** Branch outreach settings (columns on BranchReminderSettings). */
export interface OutreachSettingsData {
  recallEnabled: boolean;
  recallAfterDays: number;
  recallCooldownDays: number;
  recallDailyLimit: number;
  reviewEnabled: boolean;
  reviewDelayHours: number;
  reviewCooldownDays: number;
  googleReviewUrl: string | null;
}

/** One recall / review request, as shown in histories and the branch log. */
export interface OutreachLogItem {
  id: string;
  type: OutreachTypeName;
  channel: "WHATSAPP" | "EMAIL";
  status: OutreachStatusName;
  scheduledFor: string;
  sentAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  createdAt: string;
  /** Null when the cron created it. */
  createdByName: string | null;
  patient?: { id: string; name: string };
}

export interface PatientOutreachHistory {
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  items: OutreachLogItem[];
  /** Whether the viewer may send a recall / override the cooldown. */
  canSend: boolean;
  canForce: boolean;
}

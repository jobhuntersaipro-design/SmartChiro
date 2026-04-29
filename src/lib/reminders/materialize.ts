import type { ReminderChannel } from "@/types/reminder";

/** WHATSAPP or EMAIL only — never BOTH or NONE. */
export type ConcreteChannel = "WHATSAPP" | "EMAIL";

export function resolveChannels(args: {
  pref: ReminderChannel;
  hasPhone: boolean;
  hasEmail: boolean;
}): ConcreteChannel[] {
  const { pref, hasPhone, hasEmail } = args;
  if (pref === "NONE") return [];
  if (pref === "WHATSAPP") {
    if (hasPhone) return ["WHATSAPP"];
    if (hasEmail) return ["EMAIL"];
    return [];
  }
  if (pref === "EMAIL") {
    if (hasEmail) return ["EMAIL"];
    if (hasPhone) return ["WHATSAPP"];
    return [];
  }
  // BOTH
  const out: ConcreteChannel[] = [];
  if (hasPhone) out.push("WHATSAPP");
  if (hasEmail) out.push("EMAIL");
  return out;
}

export type PlannedReminder = {
  channel: ConcreteChannel;
  offsetMin: number;
  scheduledFor: Date;
};

const PAST_GRACE_MS = 5 * 60_000;

export function plannedReminders(args: {
  appointmentDateTime: Date;
  now: Date;
  offsetsMin: number[];
  channels: ConcreteChannel[];
}): PlannedReminder[] {
  const { appointmentDateTime, now, offsetsMin, channels } = args;
  if (channels.length === 0) return [];
  const cutoff = now.getTime() - PAST_GRACE_MS;

  const out: PlannedReminder[] = [];
  for (const off of offsetsMin) {
    const t = appointmentDateTime.getTime() - off * 60_000;
    if (t <= cutoff) continue;
    for (const ch of channels) {
      out.push({ channel: ch, offsetMin: off, scheduledFor: new Date(t) });
    }
  }
  return out;
}

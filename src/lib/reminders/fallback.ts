import type { ReminderChannel } from "@/types/reminder";
import type { ConcreteChannel } from "./materialize";

const TERMINAL_WA = new Set([
  "not_on_whatsapp",
  "session_disconnected",
  "session_logged_out",
  "invalid_e164",
]);
const TERMINAL_EMAIL = new Set(["invalid_email", "bounce_hard"]);

export function shouldFallback(args: {
  channel: ConcreteChannel;
  reason: string;
  attemptCount: number;
  isFallback: boolean;
  hasOtherChannelContact: boolean;
  pref: ReminderChannel;
}): boolean {
  if (args.isFallback) return false;
  if (args.pref === "NONE") return false;
  if (args.attemptCount !== 1) return false;
  if (!args.hasOtherChannelContact) return false;
  const set = args.channel === "WHATSAPP" ? TERMINAL_WA : TERMINAL_EMAIL;
  return set.has(args.reason);
}

export function oppositeChannel(c: ConcreteChannel): ConcreteChannel {
  return c === "WHATSAPP" ? "EMAIL" : "WHATSAPP";
}

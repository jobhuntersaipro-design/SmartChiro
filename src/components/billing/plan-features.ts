import { Building2, CalendarDays, Receipt, ScanLine, Sparkles, Users, type LucideIcon } from "lucide-react";

/** What SmartChiro Pro includes — shown on the plan page and the landing page's pricing. */
export const PLAN_FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Users, title: "Patients & records", body: "Unlimited patients, visits, SOAP notes and documents." },
  { icon: ScanLine, title: "X-ray annotation", body: "Draw, measure and compare on every film." },
  { icon: Sparkles, title: "AI pelvis analysis", body: "10 X-rays per account per day." },
  { icon: CalendarDays, title: "Appointments", body: "Calendar, online booking, WhatsApp and email reminders." },
  { icon: Receipt, title: "Billing", body: "Invoices, receipts, packages and LHDN e-invoicing." },
  { icon: Building2, title: "Your whole clinic", body: "Reports, multiple branches and unlimited staff accounts." },
];

/** "RM 6,000": whole ringgit, Malaysian style. */
export function formatRM(amount: number): string {
  return `RM ${Math.round(amount).toLocaleString("en-MY")}`;
}

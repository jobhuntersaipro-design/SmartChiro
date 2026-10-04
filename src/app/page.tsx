import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Box,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Crosshair,
  GitCompareArrows,
  Lock,
  MessageCircle,
  MousePointer2,
  Receipt,
  Ruler,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PLAN_FEATURES, formatRM } from "@/components/billing/plan-features";
import { BookingDemo } from "@/components/landing/BookingDemo";
import { XrayAiDemo } from "@/components/landing/XrayAiDemo";
import { PLANS, TRIAL_DAYS, YEARLY_SAVING_PERCENT } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "SmartChiro — AI X-ray analysis & clinic software for chiropractors",
  description:
    "AI pelvis X-ray analysis, Adobe-grade annotation, online booking with WhatsApp reminders, patient records and billing in one platform for chiropractic clinics. 30-day free trial, no credit card.",
};

const NAV = [
  ["AI X-ray", "#ai-xray"],
  ["Booking", "#booking"],
  ["Features", "#features"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
];

const STATS = [
  ["16", "anatomical landmarks placed by AI"],
  ["10", "pelvic parameters measured"],
  ["~30 s", "from upload to findings"],
  ["24/7", "online booking for your patients"],
];

type Item = { icon: LucideIcon; title: string; body: string };

const AI_STEPS: Item[] = [
  {
    icon: ShieldCheck,
    title: "Checks the film first",
    body: "Lateral view, hip implant or a poor-quality film? It tells you why it can't analyse it instead of guessing.",
  },
  {
    icon: Crosshair,
    title: "Places 16 landmarks",
    body: "Femoral heads, iliac crests, ischia, sacrum and symphysis, refined with zoomed passes. Uncertain points get a dashed ring.",
  },
  {
    icon: Ruler,
    title: "Measures 10 parameters",
    body: "FHHD, ICHD, DOCS, IM, SAM, ISM and more, in mm once calibrated, against published normal ranges.",
  },
];

const TOOLKIT = [
  "Freehand pen",
  "Lines & polylines",
  "Arrows & text",
  "Ruler",
  "Cobb angle",
  "Calibrate to mm",
  "Brightness & contrast",
  "Invert",
  "Multi-view layouts",
  "Side-by-side compare",
  "Keyboard shortcuts",
];

const BOOKING_POINTS: Item[] = [
  { icon: CalendarDays, title: "Live availability", body: "Patients only see real free slots for each doctor, treatment and branch." },
  {
    icon: MessageCircle,
    title: "WhatsApp & email reminders",
    body: "Sent automatically before every visit, in English, Bahasa Melayu or 中文.",
  },
  { icon: Smartphone, title: "Patient portal", body: "Patients see upcoming visits, invoices and packages, and can cancel online." },
];

const FEATURES: Item[] = [
  { icon: Users, title: "Patient records", body: "Profiles, visit history, SOAP notes and documents, searchable in seconds." },
  { icon: ScanLine, title: "Clinical X-ray viewer", body: "Pan, zoom, window/level and multi-view layouts built for radiographs." },
  { icon: GitCompareArrows, title: "Before & after", body: "Put films side by side to show patients the progress they've made." },
  { icon: CalendarDays, title: "Scheduling", body: "Day, week and month calendars with a colour per doctor and conflict checks." },
  { icon: Receipt, title: "Invoices & e-invoicing", body: "Invoices, receipts, treatment packages and LHDN MyInvois." },
  { icon: Building2, title: "Multi-branch clinics", body: "Branches, doctors, front desk roles and commissions in one account." },
  { icon: BarChart3, title: "Reports", body: "Revenue, receivables, utilisation and no-show rates per doctor." },
  { icon: Box, title: "3D anatomy explorer", body: "Rotate the skeleton and 47 muscle groups to explain treatment." },
];

const STEPS = [
  ["Create your clinic", `Sign up with email or Google. Your ${TRIAL_DAYS}-day trial starts with every feature unlocked.`],
  ["Add your team", "Invite doctors and front desk staff, set opening hours and share your booking link."],
  ["Upload your first X-ray", "Run the AI analysis, annotate, and show your patient exactly what you see."],
];

const FAQ = [
  [
    "Do I need a credit card to start?",
    `No. You get every feature free for ${TRIAL_DAYS} days. Subscribe from the Plan & billing page whenever you're ready — if your trial ends first, your data is kept until you do.`,
  ],
  [
    "Which X-rays can the AI analyse?",
    "Upright AP or PA pelvis films, and full-spine films that show the iliac crests down to the femoral heads. Every film is checked first, and you're told in plain words when one isn't suitable.",
  ],
  [
    "Does the AI replace my clinical judgement?",
    "No. It does the tedious placing and measuring; you review the result. Points the AI is less sure about are drawn with dashed rings, and every point can be dragged — the measurements follow.",
  ],
  [
    "What happens to patient data?",
    "Only the image pixels are sent for AI analysis — never names, IC numbers or clinic details. Records are scoped to your clinic, with separate roles for owners, admins, doctors and front desk.",
  ],
  [
    "Can patients book online?",
    "Yes. Each branch gets a booking page you can share anywhere. Patients pick a treatment, doctor and free time, and once you connect your clinic's WhatsApp they get reminders automatically.",
  ],
  [
    "Does it work on a tablet?",
    "Yes. SmartChiro runs in the browser on desktop, tablet and phone, with touch and pinch-to-zoom in the X-ray viewer. Nothing to install.",
  ],
  [
    "How much is it after the trial?",
    `One plan with everything: ${formatRM(PLANS.month.amount)} a month, or ${formatRM(PLANS.year.amount)} a year (save ${YEARLY_SAVING_PERCENT}%).`,
  ],
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-control font-heading text-[17px] font-semibold tracking-[-0.02em] text-foreground">
      <Image src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
      SmartChiro
    </Link>
  );
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 font-heading text-[32px] font-medium leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[44px]">{title}</h2>
      {children && <p className="mt-4 text-[17px] leading-[1.6] text-fg-secondary">{children}</p>}
    </div>
  );
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function TrialButton({ className }: { className?: string }) {
  return (
    <Link href="/register" className={buttonVariants({ size: "lg", className })}>
      Start {TRIAL_DAYS}-day free trial
      <ArrowRight data-icon="inline-end" />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="landing flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <ul className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <a href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ size: "sm" })}>
              <span className="sm:hidden">Try free</span>
              <span className="hidden sm:inline">Start free trial</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero with the AI demo: the headline feature goes first. */}
        <section className="bg-[linear-gradient(180deg,oklch(97.5%_.016_300),oklch(98.5%_.01_65)_55%,var(--background))]">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <a
                href="#ai-xray"
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-[13px] text-fg-secondary shadow-(--shadow-resting) transition-colors hover:text-foreground"
              >
                <span className="shrink-0 rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand">New</span>
                <span className="truncate">AI finds 16 pelvic landmarks in about 30 seconds</span>
                <ArrowRight className="size-3.5 shrink-0" aria-hidden />
              </a>
              <h1 className="mt-6 font-heading text-[44px] font-medium leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[68px]">
                See More. Treat Better.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-[1.55] text-fg-secondary">
                The chiropractic platform with AI X-ray analysis, Adobe-grade annotation, online booking with WhatsApp reminders,
                patient records and billing — all in one place.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <TrialButton />
                <a href="#booking" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  See online booking
                </a>
              </div>
              <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-fg-secondary">
                {["No credit card required", "Every feature included", "Cancel anytime"].map((point) => (
                  <li key={point} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" strokeWidth={2.5} aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-auto mt-14 max-w-5xl">
              <XrayAiDemo />
            </div>
          </div>
        </section>

        <section aria-label="SmartChiro in numbers" className="border-y border-border-subtle bg-surface-subtle">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {STATS.map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse px-2 text-center">
                <dt className="mt-1 text-[14px] text-fg-secondary">{label}</dt>
                <dd className="font-heading text-[36px] font-medium tracking-[-0.03em] text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="ai-xray" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="AI X-ray analysis" title="From film to findings in about 30 seconds.">
              Upload a pelvis or full-spine X-ray and click Detect landmarks. SmartChiro does the tedious part — then hands you the
              controls.
            </SectionHeading>
            <ol className="mt-14 grid gap-4 md:grid-cols-3">
              {AI_STEPS.map((step, i) => (
                <li key={step.title} className="rounded-panel border border-border bg-surface p-6 shadow-(--shadow-card)">
                  <div className="flex items-center justify-between">
                    <IconBadge icon={step.icon} />
                    <span className="font-heading text-[14px] text-fg-muted">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-heading text-[19px] font-medium text-foreground">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-fg-secondary">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <p className="flex items-start gap-3 rounded-panel bg-surface-muted p-5 text-[15px] leading-[1.55] text-fg-secondary">
                <Lock className="mt-0.5 size-5 shrink-0 text-foreground" strokeWidth={1.75} aria-hidden />
                <span>
                  <strong className="font-medium text-foreground">Private by design.</strong> Only the image pixels are sent for
                  analysis — never names, IC numbers or clinic details.
                </span>
              </p>
              <p className="flex items-start gap-3 rounded-panel bg-surface-muted p-5 text-[15px] leading-[1.55] text-fg-secondary">
                <MousePointer2 className="mt-0.5 size-5 shrink-0 text-foreground" strokeWidth={1.75} aria-hidden />
                <span>
                  <strong className="font-medium text-foreground">You stay in control.</strong> Drag any landmark and every
                  measurement and construction line updates live.
                </span>
              </p>
            </div>
            <div className="mt-12 text-center">
              <p className="text-[15px] font-medium text-foreground">Plus an Adobe-grade annotation toolkit on every film</p>
              <ul className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
                {TOOLKIT.map((tool) => (
                  <li key={tool} className="rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-fg-secondary">
                    {tool}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="booking" className="scroll-mt-16 overflow-hidden bg-surface-subtle px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-brand">Online booking & reminders</p>
              <h2 className="mt-3 font-heading text-[32px] font-medium leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[44px]">
                Let patients book themselves — even at midnight.
              </h2>
              <p className="mt-4 text-[17px] leading-[1.6] text-fg-secondary">
                Every branch gets its own booking page. Share the link on Instagram, Google or WhatsApp — bookings land straight in
                your calendar, tagged so the front desk knows they came in online.
              </p>
              <ul className="mt-8 space-y-5">
                {BOOKING_POINTS.map((point) => (
                  <li key={point.title} className="flex gap-4">
                    <IconBadge icon={point.icon} />
                    <div>
                      <h3 className="font-medium text-foreground">{point.title}</h3>
                      <p className="mt-0.5 text-[15px] leading-[1.55] text-fg-secondary">{point.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <BookingDemo />
          </div>
        </section>

        <section id="features" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="All in one place" title="Everything your clinic runs on.">
              Replace the paper files, the DICOM viewer, the calendar app and the invoicing spreadsheet with one login.
            </SectionHeading>
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="rounded-panel border border-border bg-surface p-5 shadow-(--shadow-card)">
                  <IconBadge icon={feature.icon} />
                  <h3 className="mt-4 font-medium text-foreground">{feature.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-fg-secondary">{feature.body}</p>
                </li>
              ))}
            </ul>

            <ol className="mt-20 grid gap-8 md:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-[15px] text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium text-foreground">{title}</h3>
                    <p className="mt-1 text-[15px] leading-[1.55] text-fg-secondary">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 bg-surface-subtle px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-4xl">
            <SectionHeading eyebrow="Pricing" title="One plan. Everything included.">
              {`Start with ${TRIAL_DAYS} days free — no credit card, nothing locked. Staff accounts are covered by the clinic owner's plan.`}
            </SectionHeading>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {(["month", "year"] as const).map((interval) => {
                const plan = PLANS[interval];
                const yearly = interval === "year";
                return (
                  <div
                    key={interval}
                    className={cn(
                      "flex flex-col rounded-surface border bg-surface p-7 shadow-(--shadow-card)",
                      yearly ? "border-brand ring-4 ring-brand-subtle" : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">SmartChiro Pro · {plan.label}</p>
                      {yearly && (
                        <span className="shrink-0 rounded-full bg-brand-subtle px-2.5 py-0.5 text-[12px] font-medium text-brand">
                          Save {YEARLY_SAVING_PERCENT}%
                        </span>
                      )}
                    </div>
                    <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
                      <span className="font-heading text-[40px] font-medium tracking-[-0.03em] text-foreground">{formatRM(plan.amount)}</span>
                      <span className="text-[15px] text-fg-muted">/ {plan.per}</span>
                      {yearly && <s className="text-[15px] text-fg-muted">{formatRM(PLANS.month.amount * 12)}</s>}
                    </p>
                    <p className="mt-1 text-[14px] text-fg-secondary">
                      {yearly ? `Works out at ${formatRM(plan.amount / 12)} a month.` : "Billed monthly. Cancel anytime."}
                    </p>
                    <Link
                      href="/register"
                      className={buttonVariants({ variant: yearly ? "default" : "secondary", size: "lg", className: "mt-7 w-full" })}
                    >
                      Start free trial
                    </Link>
                  </div>
                );
              })}
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PLAN_FEATURES.map(({ title, body }) => (
                <li key={title} className="flex gap-2.5 text-[14px]">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  <span>
                    <span className="font-medium text-foreground">{title}.</span> <span className="text-fg-secondary">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <SectionHeading eyebrow="FAQ" title="Questions, answered." />
            <div className="mt-12 divide-y divide-border border-y border-border">
              {FAQ.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-control font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {question}
                    <ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-3 text-[15px] leading-[1.6] text-fg-secondary">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-surface bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
            <h2 className="font-heading text-[32px] font-medium leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
              Give every patient something to see.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] leading-[1.6] text-primary-foreground/70">
              Start your free {TRIAL_DAYS}-day trial today. Every feature, no credit card, set up in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrialButton className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 [a]:hover:bg-primary-foreground/90" />
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className:
                    "border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
                })}
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-[13px] text-fg-muted">© {new Date().getFullYear()} SmartChiro · See More. Treat Better.</p>
          <div className="flex gap-1">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

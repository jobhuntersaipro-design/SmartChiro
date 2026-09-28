import type { ReactNode } from "react";
import { ChevronLeft, MapPin, Phone } from "lucide-react";
import { buildTelUrl } from "@/lib/format";
import type { PublicBookingConfig } from "@/types/booking";

/** Presentational pieces of the public booking page. */

export function BookingHeader({ branch }: { branch: PublicBookingConfig["branch"] }) {
  const initials = branch.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const tel = buildTelUrl(branch.phone);
  return (
    <header className="flex items-start gap-3">
      {branch.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- clinic logo from R2, any host
        <img src={branch.logo} alt="" className="h-12 w-12 shrink-0 rounded-[6px] border border-[#E3E8EE] bg-white object-contain" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] bg-[#F0EEFF] text-[17px] font-semibold text-[#635BFF]"
        >
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[14px] text-[#697386]">Book an appointment</p>
        <h1 className="text-[23px] leading-tight font-semibold text-[#0A2540]">{branch.name}</h1>
        {branch.address && (
          <p className="mt-1 flex items-start gap-1.5 text-[14px] text-[#425466]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {branch.address}
          </p>
        )}
        {branch.phone && tel && (
          <a href={tel} className="mt-0.5 inline-flex items-center gap-1.5 text-[14px] text-[#425466] hover:text-[#635BFF]">
            <Phone className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            {branch.phone}
          </a>
        )}
      </div>
    </header>
  );
}

export function StepCard({
  step,
  total,
  title,
  onBack,
  children,
  headingRef,
}: {
  step: number;
  total: number;
  title: string;
  onBack?: () => void;
  children: ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section className="rounded-[8px] border border-[#E3E8EE] bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)] sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex h-8 items-center gap-0.5 rounded-[4px] px-1 text-[14px] font-medium text-[#635BFF] hover:bg-[#F0EEFF] focus-visible:outline-2 focus-visible:outline-[#635BFF]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        ) : (
          <span />
        )}
        <span className="text-[13px] text-[#697386]">
          Step {step} of {total}
        </span>
      </div>
      <div
        className="mb-4 flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label="Booking progress"
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-[#635BFF]" : "bg-[#E3E8EE]"}`} />
        ))}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="mb-3 text-[18px] font-semibold text-[#0A2540] outline-none">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function OptionButton({
  selected,
  onClick,
  title,
  subtitle,
  leading,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-14 w-full items-center gap-3 rounded-[6px] border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#635BFF] ${
        selected ? "border-[#635BFF] bg-[#F0EEFF]" : "border-[#E3E8EE] bg-white hover:border-[#C1C9D2] hover:bg-[#F6F9FC]"
      }`}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-[#0A2540]">{title}</span>
        {subtitle && <span className="block text-[14px] text-[#697386]">{subtitle}</span>}
      </span>
    </button>
  );
}

export function Initials({ name }: { name: string }) {
  const bare = name.replace(/^dr\.?\s+/i, "");
  const initials = bare
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-[14px] font-semibold text-[#635BFF]"
    >
      {initials}
    </span>
  );
}

/** Summary of choices so far, each with a Change link. */
export function ChoiceSummary({ rows }: { rows: { label: string; value: string; onChange: () => void }[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="mb-3 divide-y divide-[#E3E8EE] rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] text-[14px]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <dt className="text-[13px] text-[#697386]">{r.label}</dt>
            <dd className="truncate font-medium text-[#0A2540]">{r.value}</dd>
          </div>
          <button
            type="button"
            onClick={r.onChange}
            className="shrink-0 rounded-[4px] px-1.5 py-1 text-[14px] font-medium text-[#635BFF] hover:bg-[#F0EEFF] focus-visible:outline-2 focus-visible:outline-[#635BFF]"
            aria-label={`Change ${r.label.toLowerCase()}`}
          >
            Change
          </button>
        </div>
      ))}
    </dl>
  );
}

export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-3 rounded-[6px] border border-[#DF1B41]/25 bg-[#FEF2F4] px-3 py-2 text-[14px] text-[#A4122F]">
      {children}
    </p>
  );
}

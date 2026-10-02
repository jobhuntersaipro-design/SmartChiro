import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

interface NotFoundPanelProps {
  /** Where the primary button goes. */
  homeHref?: string;
  homeLabel?: string;
}

/** Branded "page not found" card, shared by the root and dashboard 404s. */
export function NotFoundPanel({
  homeHref = "/dashboard",
  homeLabel = "Back to dashboard",
}: NotFoundPanelProps) {
  return (
    <div className="w-full max-w-md rounded-panel border border-border bg-white px-6 py-10 text-center shadow-(--shadow-card)">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle">
        <Compass className="h-6 w-6 text-brand" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-medium text-brand tabular-nums">404</p>
      <h1 className="mt-1 text-[23px] font-light tracking-[-0.23px] text-foreground">
        This page doesn&apos;t exist yet
      </h1>
      <p className="mt-2 text-[15px] text-fg-secondary">
        The link may be out of date, or the page hasn&apos;t been built yet.
      </p>
      <Link
        href={homeHref}
        className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-control bg-primary px-4 text-[14px] font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {homeLabel}
      </Link>
    </div>
  );
}

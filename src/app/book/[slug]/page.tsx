import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { findBookableBranch } from "@/lib/booking/availability";
import { publicConfig } from "@/lib/booking/public";
import { BookingFlow } from "@/components/booking/BookingFlow";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

/** One lookup per request, shared by the metadata and the page. */
const getBranch = cache((slug: string) => findBookableBranch(slug));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranch(slug);
  if (!branch) return { title: "Booking page not found" };
  return {
    title: `Book at ${branch.name}`,
    description: `Book an appointment at ${branch.name} online.`,
  };
}

/** Public online booking page — no login, no dashboard chrome. */
export default async function BookingPage({ params }: PageProps) {
  const { slug } = await params;
  const branch = await getBranch(slug);
  if (!branch) notFound();
  const config = await publicConfig(branch);

  return (
    <main className="min-h-dvh bg-surface-muted px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <BookingFlow config={config} />
        <p className="mt-6 text-center text-[13px] text-fg-muted">Online booking by SmartChiro</p>
      </div>
    </main>
  );
}

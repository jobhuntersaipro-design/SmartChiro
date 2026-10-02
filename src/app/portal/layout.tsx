import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient portal — SmartChiro",
  description: "Your appointments, packages and receipts.",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-1 flex-col bg-surface-muted text-foreground">{children}</main>;
}

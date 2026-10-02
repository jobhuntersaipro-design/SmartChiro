"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, LogOut, Package, Receipt, UserRound } from "lucide-react";
import type { PortalAppointment, PortalInvoice, PortalMe, PortalPackage } from "@/types/portal";
import { PortalAppointments } from "@/components/portal/PortalAppointments";
import { PortalPackages } from "@/components/portal/PortalPackages";
import { PortalInvoices } from "@/components/portal/PortalInvoices";
import { PortalDetails } from "@/components/portal/PortalDetails";
import { ALERT_ERROR, BTN_SECONDARY } from "@/components/portal/styles";
import { cn } from "@/lib/utils";

interface PortalData {
  me: PortalMe;
  appointments: { upcoming: PortalAppointment[]; past: PortalAppointment[] };
  packages: PortalPackage[];
  invoices: PortalInvoice[];
}

type TabId = "appointments" | "packages" | "invoices" | "details";

const TABS: { id: TabId; label: string; icon: typeof CalendarDays }[] = [
  { id: "appointments", label: "Appointments", icon: CalendarDays },
  { id: "packages", label: "Packages", icon: Package },
  { id: "invoices", label: "Invoices", icon: Receipt },
  { id: "details", label: "My details", icon: UserRound },
];

class Unauthorized extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

async function loadAll(): Promise<PortalData> {
  const [me, appointments, packages, invoices] = await Promise.all([
    getJson<PortalMe>("/api/portal/me"),
    getJson<PortalData["appointments"]>("/api/portal/appointments"),
    getJson<{ packages: PortalPackage[] }>("/api/portal/packages"),
    getJson<{ invoices: PortalInvoice[] }>("/api/portal/invoices"),
  ]);
  return { me, appointments, packages: packages.packages, invoices: invoices.invoices };
}

/** Signed-in portal: appointments, packages, invoices & receipts, contact details. */
export function PortalHome({ email }: { email: string }) {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("appointments");
  const [signingOut, setSigningOut] = useState(false);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof Unauthorized) {
        router.replace("/portal");
        return;
      }
      setError("Couldn't load your details. Please refresh the page.");
    },
    [router],
  );

  useEffect(() => {
    let active = true;
    loadAll().then(
      (d) => active && setData(d),
      (e) => active && handleError(e),
    );
    return () => {
      active = false;
    };
  }, [handleError]);

  const refresh = useCallback(async () => {
    try {
      setData(await loadAll());
      setError(null);
    } catch (e) {
      handleError(e);
    }
  }, [handleError]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/portal/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/portal");
    router.refresh();
  }

  const firstNames = data ? [...new Set(data.me.patients.map((p) => p.firstName))] : [];
  const multiplePatients = firstNames.length > 1;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-control bg-primary px-2 py-1 text-[14px] font-bold text-white">
              Smart Chiro
            </span>
            <span className="truncate text-[15px] text-fg-secondary">{email}</span>
          </div>
          <button type="button" onClick={() => void signOut()} disabled={signingOut} className={BTN_SECONDARY}>
            {signingOut ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" strokeWidth={1.5} aria-hidden />}
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-[23px] font-medium text-foreground">
          {data ? `Hi ${firstNames.join(" & ")}` : "Your portal"}
        </h1>
        <p className="mt-1 text-[15px] text-fg-secondary">All times are Malaysia time.</p>

        <div role="tablist" aria-label="Portal sections" className="mt-5 grid grid-cols-4 gap-1 rounded-panel border border-border bg-white p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`portal-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`portal-panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-control px-1 py-2 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex-row sm:justify-center sm:gap-2 sm:text-[15px]",
                tab === id ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={tab === id ? 2 : 1.5} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <section
          id={`portal-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`portal-tab-${tab}`}
          className="mt-5"
        >
          {error && <p role="alert" className={ALERT_ERROR}>{error}</p>}
          {!data && !error && (
            <div className="flex items-center gap-2 py-10 text-[15px] text-fg-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </div>
          )}
          {data && tab === "appointments" && (
            <PortalAppointments
              upcoming={data.appointments.upcoming}
              past={data.appointments.past}
              patients={data.me.patients}
              showPatientName={multiplePatients}
              onChanged={refresh}
            />
          )}
          {data && tab === "packages" && <PortalPackages packages={data.packages} showPatientName={multiplePatients} />}
          {data && tab === "invoices" && <PortalInvoices invoices={data.invoices} showPatientName={multiplePatients} />}
          {data && tab === "details" && <PortalDetails me={data.me} />}
        </section>
      </div>
    </div>
  );
}

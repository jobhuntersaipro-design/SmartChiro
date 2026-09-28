"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MarketingConsentCheckbox } from "@/components/patients/MarketingConsentCheckbox";
import { OutreachLogList } from "@/components/outreach/OutreachLogList";
import { SendRecallButton } from "@/components/outreach/SendRecallButton";
import { formatAppointmentDateOnly } from "@/lib/format";
import type { PatientOutreachHistory } from "@/types/outreach";

interface PatientOutreachSectionProps {
  patientId: string;
  patientName?: string;
  /** The page's copy of consent; a change (e.g. saved in Edit patient) reloads this section. */
  marketingConsent?: boolean;
  onConsentChange?: () => void;
}

/** Profile tab: marketing consent, "Send recall" and the recall / review history. */
export function PatientOutreachSection({
  patientId,
  patientName = "this patient",
  marketingConsent,
  onConsentChange,
}: PatientOutreachSectionProps) {
  const [data, setData] = useState<PatientOutreachHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/outreach`);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setData(await res.json());
    setFailed(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load, marketingConsent]);

  async function setConsent(next: boolean) {
    setSaving(true);
    setData((d) => (d ? { ...d, marketingConsent: next } : d));
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketingConsent: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setData((d) => (d ? { ...d, marketingConsent: !next } : d));
        toast.error(body.error ?? "Couldn't update consent");
        return;
      }
      toast.success(next ? "Marketing consent recorded" : "Marketing consent withdrawn");
      await load();
      onConsentChange?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[15px] font-medium text-[#061b31]">Recall &amp; review messages</h4>
        {data?.canSend && (
          <SendRecallButton
            patientId={patientId}
            patientName={patientName}
            disabled={!data.marketingConsent}
            disabledReason="Needs marketing consent"
            onSent={() => load()}
          />
        )}
      </div>
      {failed ? (
        <p className="text-[14px] text-[#64748d]">Couldn&apos;t load outreach history.</p>
      ) : !data ? (
        <div className="h-16 animate-pulse rounded bg-[#f6f9fc]" />
      ) : (
        <div className="space-y-3">
          <MarketingConsentCheckbox checked={data.marketingConsent} disabled={saving} onChange={setConsent} />
          {data.marketingConsent && data.marketingConsentAt && (
            <p className="text-[13px] text-[#64748d]">Consent given {formatAppointmentDateOnly(data.marketingConsentAt)}</p>
          )}
          <OutreachLogList items={data.items} emptyText="No recall or review messages yet." />
        </div>
      )}
    </div>
  );
}

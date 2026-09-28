"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PublicWhatsAppAccount } from "@/types/whatsapp";

interface Props {
  branchId: string;
  onConnected: (account: PublicWhatsAppAccount) => void;
  onError: (message: string) => void;
}

const inputClass =
  "h-8 w-full rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-2.5 text-[14px] text-[#0A2540] placeholder:text-[#A3ACB9] focus:outline-none focus:ring-1 focus:ring-[#635BFF]";

/** Connect with IDs + token copied from Meta's dashboard (test number, BSPs). */
export function WhatsAppManualConnectForm({ branchId, onConnected, onError }: Props) {
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(`/api/branches/${branchId}/whatsapp/manual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wabaId, phoneNumberId, accessToken }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return onError(j.message ?? "Could not connect WhatsApp.");
      setAccessToken("");
      onConnected(j.account);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-[6px] border border-[#E3E8EE] bg-white p-4">
      <p className="text-[14px] text-[#697386]">
        From Meta for Developers → your app → WhatsApp → API Setup. Use a System User token with{" "}
        <code className="text-[13px]">whatsapp_business_messaging</code> and{" "}
        <code className="text-[13px]">whatsapp_business_management</code> for anything longer than a 24-hour test.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-[14px] text-[#425466]">
          WhatsApp Business Account ID
          <input className={`${inputClass} mt-1`} inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value)} required />
        </label>
        <label className="block text-[14px] text-[#425466]">
          Phone number ID
          <input className={`${inputClass} mt-1`} inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} required />
        </label>
      </div>
      <label className="block text-[14px] text-[#425466]">
        Access token
        <input
          className={`${inputClass} mt-1`}
          type="password"
          autoComplete="off"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#635BFF] px-3 py-1.5 text-[14px] text-white hover:bg-[#5851EB] disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
          Connect
        </button>
      </div>
    </form>
  );
}

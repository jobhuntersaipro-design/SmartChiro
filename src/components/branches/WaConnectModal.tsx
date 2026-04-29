"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  branchId: string;
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
};

type Status = "DISCONNECTED" | "PAIRING" | "CONNECTED" | "LOGGED_OUT";

export function WaConnectModal({ branchId, open, onClose, onConnected }: Props) {
  const [status, setStatus] = useState<Status>("DISCONNECTED");
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);

    async function startAndPoll() {
      const r = await fetch(`/api/branches/${branchId}/wa/connect`, { method: "POST" });
      if (!r.ok) {
        setErr("Failed to start WhatsApp session");
        return;
      }
      pollRef.current = setInterval(async () => {
        if (cancelled) return;
        const s = await fetch(`/api/branches/${branchId}/wa/status`);
        if (!s.ok) return;
        const j = await s.json();
        setStatus(j.status as Status);
        setQr(j.qrPayload ?? null);
        setPhone(j.phoneNumber ?? null);
        if (j.status === "CONNECTED") {
          if (pollRef.current) clearInterval(pollRef.current);
          onConnected();
        }
      }, 2000);
    }
    startAndPoll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, branchId, onConnected]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-[8px] border border-[#E3E8EE] bg-white p-6 shadow-lg">
        <div className="mb-3 text-[18px] font-medium text-[#0A2540]">Connect WhatsApp</div>
        <p className="mb-4 text-[15px] text-[#425466]">
          Scan this QR with the WhatsApp app on the owner&apos;s phone (Settings → Linked
          Devices → Link a Device).
        </p>
        {err && (
          <div className="mb-3 rounded-[4px] bg-[#FDE7EC] p-2 text-[14px] text-[#DF1B41]">
            {err}
          </div>
        )}
        {status === "PAIRING" && qr ? (
          <img
            alt="WhatsApp pairing QR"
            src={`data:image/png;base64,${qr}`}
            className="mx-auto h-[260px] w-[260px] rounded-[6px] border border-[#E3E8EE]"
          />
        ) : status === "CONNECTED" ? (
          <div className="rounded-[6px] bg-[#E5F8E5] p-4 text-center text-[#30B130]">
            Connected as {phone}
          </div>
        ) : (
          <div className="rounded-[6px] bg-[#F0F3F7] p-4 text-center text-[#697386]">
            Waiting for QR…
          </div>
        )}
        <p className="mt-4 text-[13px] text-[#697386]">
          WhatsApp may disconnect this session at their discretion. Use at your own risk.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-[4px] border border-[#E3E8EE] bg-white px-3 py-1.5 text-[14px] text-[#0A2540] hover:bg-[#F0F3F7]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

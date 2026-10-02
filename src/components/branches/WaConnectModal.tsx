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

    async function startAndPoll() {
      // Reset stale error from a previous open — moved out of the effect body
      // since synchronous setState in an effect cascades renders.
      setErr(null);
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect WhatsApp"
        className="w-105 rounded-2xl border border-border bg-white p-6 shadow-lg"
      >
        <div className="mb-3 text-[18px] font-medium text-foreground">Connect WhatsApp</div>
        <p className="mb-4 text-[15px] text-fg-secondary">
          Scan this QR with the WhatsApp app on the owner&apos;s phone (Settings → Linked
          Devices → Link a Device).
        </p>
        {err && (
          <div className="mb-3 rounded-md bg-danger-subtle p-2 text-[14px] text-danger">
            {err}
          </div>
        )}
        {status === "PAIRING" && qr ? (
          // Base64 data URL — Next/Image doesn't optimize data URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="WhatsApp pairing QR"
            src={`data:image/png;base64,${qr}`}
            className="mx-auto h-65 w-65 rounded-panel border border-border"
          />
        ) : status === "CONNECTED" ? (
          <div className="rounded-panel bg-success-subtle p-4 text-center text-success">
            Connected as {phone}
          </div>
        ) : (
          <div className="rounded-panel bg-surface-hover p-4 text-center text-fg-muted">
            Waiting for QR…
          </div>
        )}
        <p className="mt-4 text-[13px] text-fg-muted">
          WhatsApp may disconnect this session at their discretion. Use at your own risk.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-[14px] text-foreground hover:bg-surface-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

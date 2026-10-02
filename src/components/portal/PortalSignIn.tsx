"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ALERT_ERROR, ALERT_INFO, BTN_PRIMARY, CARD, INPUT, LABEL, LINK } from "@/components/portal/styles";

type Step = "email" | "code";

const RESEND_COOLDOWN_S = 30;

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: { message?: string } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Email → one-time code → portal home. */
export function PortalSignIn() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson("/api/portal/request-code", { email });
      if (!ok) {
        setError(data.message ?? "Something went wrong. Please try again.");
        return;
      }
      setInfo(data.message ?? "Check your email for a 6-digit code.");
      setCode("");
      setStep("code");
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError("Couldn't reach the clinic's system. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson("/api/portal/verify", { email, code });
      if (!ok) {
        setError(data.message ?? "That code didn't work. Please try again.");
        return;
      }
      router.replace("/portal/home");
      router.refresh();
    } catch {
      setError("Couldn't reach the clinic's system. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-105">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 rounded-panel bg-brand px-3 py-2">
          <span className="text-[14px] font-bold text-white">Smart Chiro</span>
        </div>
        <h1 className="text-[23px] font-medium text-foreground">Patient portal</h1>
        <p className="mt-1 text-[15px] text-fg-secondary">
          See your appointments, packages and receipts.
        </p>
      </div>

      <div className={`${CARD} p-6`}>
        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void requestCode();
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="portal-email" className={LABEL}>
                Email address
              </label>
              <input
                id="portal-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT}
                aria-describedby="portal-email-hint"
              />
              <p id="portal-email-hint" className="mt-1.5 text-[14px] text-fg-muted">
                Use the email the clinic has on file. We&apos;ll send you a 6-digit code.
              </p>
            </div>
            {error && (
              <p role="alert" className={ALERT_ERROR}>
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || !email.trim()} className={BTN_PRIMARY}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Send code
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void verify();
            }}
            className="space-y-4"
          >
            {info && (
              <p role="status" className={ALERT_INFO}>
                {info}
              </p>
            )}
            <div>
              <label htmlFor="portal-code" className={LABEL}>
                6-digit code
              </label>
              <input
                ref={codeRef}
                id="portal-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${INPUT} text-center font-mono text-[23px] tracking-[0.4em]`}
                aria-describedby="portal-code-hint"
              />
              <p id="portal-code-hint" className="mt-1.5 text-[14px] text-fg-muted">
                Sent to <span className="font-medium text-foreground">{email}</span>. It expires in 10 minutes.
              </p>
            </div>
            {error && (
              <p role="alert" className={ALERT_ERROR}>
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || code.length !== 6} className={BTN_PRIMARY}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Sign in
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setInfo(null);
                }}
              >
                Use a different email
              </button>
              <button
                type="button"
                className={`${LINK} disabled:cursor-not-allowed disabled:text-fg-disabled disabled:no-underline`}
                disabled={busy || cooldown > 0}
                onClick={() => void requestCode()}
              >
                {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-[14px] text-fg-muted">
        Clinic staff? <Link href="/login" className={LINK}>Sign in here</Link>
      </p>
    </div>
  );
}

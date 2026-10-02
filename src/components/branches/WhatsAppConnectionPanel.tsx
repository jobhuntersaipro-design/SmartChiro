"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { runEmbeddedSignup, type SignupFlow } from "@/lib/whatsapp/embedded-signup";
import { LANG_LABEL, REMINDER_TEMPLATE_NAME, TEMPLATE_LANGS, WA_TEMPLATE_LIST } from "@/lib/whatsapp/template-text";
import type { PublicWhatsAppAccount, WhatsAppConnectionState } from "@/types/whatsapp";
import { WhatsAppManualConnectForm } from "./WhatsAppManualConnectForm";

interface Props {
  branchId: string;
}

const TYPE_LABEL: Record<PublicWhatsAppAccount["connectionType"], string> = {
  COEXISTENCE: "WhatsApp Business app",
  EMBEDDED_SIGNUP: "Cloud API number",
  MANUAL: "Manual connection",
};

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-[14px] text-white hover:bg-primary/90 disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center gap-1.5 rounded-control border border-border bg-white px-3 py-1.5 text-[14px] text-foreground hover:bg-surface-hover disabled:opacity-50";

function templatePill(status: string | undefined): { label: string; className: string } {
  switch (status) {
    case "APPROVED":
      return { label: "Approved", className: "bg-success-subtle text-success" };
    case "PENDING":
    case "IN_APPEAL":
    case "PAUSED":
      return { label: status === "PAUSED" ? "Paused" : "Pending review", className: "bg-warning-subtle text-warning" };
    case undefined:
      return { label: "Not created", className: "bg-surface-hover text-fg-muted" };
    default:
      return { label: status === "CREATE_FAILED" ? "Create failed" : status.toLowerCase(), className: "bg-danger-subtle text-danger" };
  }
}

/** Connect / manage the branch's WhatsApp number used for reminders. */
export function WhatsAppConnectionPanel({ branchId }: Props) {
  const [state, setState] = useState<WhatsAppConnectionState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/branches/${branchId}/whatsapp`);
    if (r.ok) setState(await r.json());
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const setAccount = (account: PublicWhatsAppAccount | null) =>
    setState((cur) => (cur ? { ...cur, account } : cur));

  async function signup(flow: SignupFlow) {
    if (!state?.signup) return;
    setBusy(flow);
    try {
      const session = await runEmbeddedSignup(state.signup, flow);
      const r = await fetch(`/api/branches/${branchId}/whatsapp/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...session, flow }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Could not connect WhatsApp.");
      setAccount(j.account);
      toast.success("WhatsApp connected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect WhatsApp.");
    } finally {
      setBusy(null);
    }
  }

  async function post(path: string, key: string, body?: unknown) {
    setBusy(key);
    try {
      const r = await fetch(`/api/branches/${branchId}/whatsapp${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? "Request failed");
        return null;
      }
      return j;
    } finally {
      setBusy(null);
    }
  }

  async function refreshTemplates() {
    const j = await post("/templates", "templates");
    if (!j) return;
    setAccount(j.account);
    if (j.errors?.length) toast.error(j.errors.join("\n"));
    else toast.success("Template status refreshed");
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    const j = await post("/test", "test", { to: testTo, lang: "en" });
    if (j) toast.success(`Test message sent (${LANG_LABEL[j.lang as keyof typeof LANG_LABEL] ?? "English"} template)`);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect WhatsApp? Reminders will go by email until you reconnect.")) return;
    setBusy("disconnect");
    try {
      const r = await fetch(`/api/branches/${branchId}/whatsapp`, { method: "DELETE" });
      if (r.ok) {
        setAccount(null);
        toast.success("WhatsApp disconnected");
      } else toast.error("Failed to disconnect WhatsApp");
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return <div className="rounded-panel border border-border bg-surface-muted px-4 py-3 text-[14px] text-fg-muted">Loading WhatsApp connection…</div>;
  }

  const { account, signup: signupCfg, canManage } = state;

  if (!account) {
    return (
      <div className="rounded-panel border border-border bg-surface-muted px-4 py-3">
        <p className="text-[14px] text-fg-secondary">
          Not connected. Reminders go by email until a WhatsApp number is connected.
        </p>
        {canManage && (
          <>
            {signupCfg ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => signup("coexistence")} disabled={busy !== null} className={primaryBtn}>
                  {busy === "coexistence" ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <MessageCircle className="h-4 w-4" strokeWidth={1.5} />}
                  Connect WhatsApp Business app
                </button>
                <button type="button" onClick={() => signup("new")} disabled={busy !== null} className={secondaryBtn}>
                  {busy === "new" && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
                  Use a new number
                </button>
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-fg-muted">
                One-click signup isn&apos;t configured on this server yet (META_APP_ID / META_WA_CONFIG_ID). You can connect manually below.
              </p>
            )}
            {signupCfg && (
              <p className="mt-2 text-[14px] text-fg-muted">
                Keep using WhatsApp Business on your phone — you&apos;ll confirm the link inside the app. Personal WhatsApp numbers must switch to the free WhatsApp Business app first.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="mt-3 text-[14px] text-brand hover:underline"
            >
              {showManual ? "Hide manual connection" : "Connect manually (IDs + access token)"}
            </button>
            {showManual && (
              <WhatsAppManualConnectForm
                branchId={branchId}
                onConnected={(a) => {
                  setAccount(a);
                  setShowManual(false);
                  toast.success("WhatsApp connected");
                }}
                onError={(m) => toast.error(m)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  const approved = TEMPLATE_LANGS.some((l) => account.templateStatus[l] === "APPROVED");

  return (
    <div className="space-y-3 rounded-panel border border-border bg-surface-muted px-4 py-3">
      {account.status === "ERROR" && (
        <div className="flex items-start gap-2 rounded-control bg-danger-subtle p-2.5 text-[14px] text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>{account.lastError ?? "WhatsApp connection needs attention."} Disconnect and connect again to resume WhatsApp reminders.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[14px] text-fg-secondary">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            {account.status === "CONNECTED" && <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.5} />}
            {account.verifiedName ?? "WhatsApp"} {account.displayPhoneNumber && `· ${account.displayPhoneNumber}`}
          </div>
          <div className="text-fg-muted">{TYPE_LABEL[account.connectionType]}</div>
        </div>
        {canManage && (
          <button type="button" onClick={disconnect} disabled={busy !== null} className={secondaryBtn}>
            {busy === "disconnect" && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />}
            Disconnect
          </button>
        )}
      </div>

      <div className="space-y-1.5 text-[14px] text-fg-secondary">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">Message templates</span>
          {canManage && (
            <button type="button" onClick={refreshTemplates} disabled={busy !== null} className="inline-flex items-center gap-1 text-brand hover:underline disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${busy === "templates" ? "animate-spin" : ""}`} strokeWidth={1.5} />
              Refresh templates
            </button>
          )}
        </div>
        {WA_TEMPLATE_LIST.map((t) => {
          const statuses =
            account.templateStatuses?.[t.name] ?? (t.name === REMINDER_TEMPLATE_NAME ? account.templateStatus : {});
          return (
            <div key={t.name} className="flex flex-wrap items-center gap-1.5">
              <span className="w-32 shrink-0">{t.label}</span>
              {TEMPLATE_LANGS.map((l) => {
                const pill = templatePill(statuses[l]);
                return (
                  <span key={l} className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${pill.className}`}>
                    {LANG_LABEL[l]}: {pill.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {account.status === "CONNECTED" && account.lastError && (
        <p className="text-[14px] text-warning">{account.lastError}</p>
      )}
      {!approved && (
        <p className="text-[14px] text-fg-muted">
          Meta reviews the template before WhatsApp reminders can send (usually minutes, up to 24 hours). Until then reminders go by email.
        </p>
      )}

      {canManage && account.status === "CONNECTED" && (
        <form onSubmit={sendTest} className="flex flex-wrap items-center gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Phone for a test message, e.g. 012-345 6789"
            className="h-8 w-72 max-w-full rounded-control border border-border bg-white px-2.5 text-[14px] text-foreground placeholder:text-fg-disabled focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button type="submit" disabled={busy !== null || !testTo.trim() || !approved} className={secondaryBtn}>
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
            Send test
          </button>
        </form>
      )}
    </div>
  );
}

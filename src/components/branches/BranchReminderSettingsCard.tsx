"use client";

import { useEffect, useState } from "react";
import { ReminderTemplateEditor } from "./ReminderTemplateEditor";
import { WaConnectModal } from "./WaConnectModal";
import { ALLOWED_OFFSETS_MIN, type Templates } from "@/types/reminder";

type Props = {
  branchId: string;
  canEdit: boolean;
};

const OFFSET_LABELS: Record<number, string> = {
  10080: "7 days",
  2880: "48 hours",
  1440: "24 hours",
  240: "4 hours",
  120: "2 hours",
  30: "30 minutes",
};

type ServerState = {
  settings: { enabled: boolean; offsetsMin: number[]; templates: Templates };
  waSession: { status: string; phoneNumber: string | null } | null;
};

export function BranchReminderSettingsCard({ branchId, canEdit }: Props) {
  const [state, setState] = useState<ServerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [waModal, setWaModal] = useState(false);

  useEffect(() => {
    fetch(`/api/branches/${branchId}/reminder-settings`)
      .then((r) => r.json())
      .then(setState);
  }, [branchId]);

  if (!state) return <div className="p-6 text-[#697386]">Loading reminder settings…</div>;
  const s = state.settings;

  function set<K extends keyof typeof s>(key: K, val: (typeof s)[K]) {
    setState((cur) =>
      cur ? { ...cur, settings: { ...cur.settings, [key]: val } } : cur
    );
  }
  function setTemplateField(scope: "whatsapp" | "email", key: string, val: string) {
    setState((cur) => {
      if (!cur) return cur;
      const t = { ...cur.settings.templates };
      const inner = { ...(t[scope] as Record<string, string>) };
      inner[key] = val;
      (t[scope] as Record<string, string>) = inner;
      return { ...cur, settings: { ...cur.settings, templates: t } };
    });
  }

  async function save() {
    if (!state) return;
    setSaving(true);
    const r = await fetch(`/api/branches/${branchId}/reminder-settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.settings),
    });
    setSaving(false);
    if (!r.ok) alert("Failed to save reminder settings");
  }

  const wa = state.waSession;
  const waStatus = wa?.status ?? "DISCONNECTED";

  return (
    <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[18px] font-medium text-[#0A2540]">
            Appointment Reminders
          </div>
          <div className="text-[14px] text-[#697386]">
            Send WhatsApp + email reminders before each appointment.
          </div>
        </div>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={s.enabled}
            disabled={!canEdit}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          {s.enabled ? "Enabled" : "Disabled"}
        </label>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[15px] font-medium text-[#0A2540]">When to send</div>
        <div className="flex flex-wrap gap-3">
          {ALLOWED_OFFSETS_MIN.map((off) => (
            <label
              key={off}
              className="flex items-center gap-1.5 text-[14px] text-[#425466]"
            >
              <input
                type="checkbox"
                checked={s.offsetsMin.includes(off)}
                disabled={!canEdit}
                onChange={(e) => {
                  set(
                    "offsetsMin",
                    e.target.checked
                      ? [...s.offsetsMin, off].sort((a, b) => b - a)
                      : s.offsetsMin.filter((x) => x !== off)
                  );
                }}
              />
              {OFFSET_LABELS[off]}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <ReminderTemplateEditor
          label="WhatsApp message (English)"
          value={s.templates.whatsapp?.en ?? ""}
          onChange={canEdit ? (v) => setTemplateField("whatsapp", "en", v) : () => {}}
          charLimit={400}
        />
        <ReminderTemplateEditor
          label="Email plain-text (English)"
          value={s.templates.email?.en ?? ""}
          onChange={canEdit ? (v) => setTemplateField("email", "en", v) : () => {}}
        />
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[15px] font-medium text-[#0A2540]">
          WhatsApp connection
        </div>
        <div className="flex items-center justify-between rounded-[6px] border border-[#E3E8EE] bg-[#F6F9FC] px-4 py-3">
          <div className="text-[14px] text-[#425466]">
            Status:{" "}
            <span className="font-medium text-[#0A2540]">{waStatus}</span>
            {wa?.phoneNumber && ` (${wa.phoneNumber})`}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWaModal(true)}
                className="rounded-[4px] bg-[#635BFF] px-3 py-1.5 text-[14px] text-white hover:bg-[#5851EB]"
              >
                {waStatus === "CONNECTED" ? "Re-pair" : "Connect WhatsApp"}
              </button>
              {waStatus === "CONNECTED" && (
                <button
                  onClick={async () => {
                    const r = await fetch(`/api/branches/${branchId}/wa/disconnect`, {
                      method: "POST",
                    });
                    if (r.ok) {
                      setState((cur) =>
                        cur
                          ? { ...cur, waSession: { status: "DISCONNECTED", phoneNumber: null } }
                          : cur,
                      );
                    } else {
                      alert("Failed to disconnect WhatsApp");
                    }
                  }}
                  className="rounded-[4px] border border-[#E3E8EE] bg-white px-3 py-1.5 text-[14px] text-[#0A2540] hover:bg-[#F0F3F7]"
                >
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[4px] bg-[#635BFF] px-4 py-2 text-[14px] text-white hover:bg-[#5851EB] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <WaConnectModal
        branchId={branchId}
        open={waModal}
        onClose={() => setWaModal(false)}
        onConnected={() => {
          setWaModal(false);
          fetch(`/api/branches/${branchId}/reminder-settings`)
            .then((r) => r.json())
            .then(setState);
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ReminderTemplateEditor } from "./ReminderTemplateEditor";
import { WhatsAppConnectionPanel } from "./WhatsAppConnectionPanel";
import { OutreachSettingsCard } from "./OutreachSettingsCard";
import { ALLOWED_OFFSETS_MIN, type Templates } from "@/types/reminder";
import { renderTemplatePreview, sampleTemplateParams } from "@/lib/whatsapp/template-text";

type Props = {
  branchId: string;
  canEdit: boolean;
  /** Real branch details so previews read as the patient will see them. */
  branch?: { name: string; address?: string | null; phone?: string | null };
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
};

export function BranchReminderSettingsCard({ branchId, canEdit, branch }: Props) {
  const [state, setState] = useState<ServerState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/branches/${branchId}/reminder-settings`)
      .then((r) => r.json())
      .then(setState);
  }, [branchId]);

  if (!state) return <div className="p-6 text-fg-muted">Loading reminder settings…</div>;
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

  return (
    <>
    <div className="rounded-panel border border-border bg-white p-6 shadow-(--shadow-card)">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[18px] font-medium text-foreground">
            Appointment Reminders
          </div>
          <div className="text-[14px] text-fg-muted">
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
        <div className="mb-2 text-[15px] font-medium text-foreground">When to send</div>
        <div className="flex flex-wrap gap-3">
          {ALLOWED_OFFSETS_MIN.map((off) => (
            <label
              key={off}
              className="flex items-center gap-1.5 text-[14px] text-fg-secondary"
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
        <div>
          <div className="mb-1.5 text-[15px] font-medium text-foreground">
            WhatsApp message (Meta-approved template)
          </div>
          <div className="rounded-panel border border-border bg-surface-muted p-3 text-[14px] leading-relaxed text-fg-secondary">
            {renderTemplatePreview("en", sampleTemplateParams(branch?.name))}
          </div>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            WhatsApp only allows approved templates for reminders, so this text is fixed. Patients get it in their language (English, Bahasa Melayu or 中文).
          </p>
        </div>
        <ReminderTemplateEditor
          label="Email plain-text (English)"
          value={s.templates.email?.en ?? ""}
          onChange={canEdit ? (v) => setTemplateField("email", "en", v) : () => {}}
          branch={branch}
        />
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[15px] font-medium text-foreground">
          WhatsApp connection
        </div>
        <WhatsAppConnectionPanel branchId={branchId} />
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-[14px] text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
    <OutreachSettingsCard branchId={branchId} canEdit={canEdit} branch={branch} />
    </>
  );
}

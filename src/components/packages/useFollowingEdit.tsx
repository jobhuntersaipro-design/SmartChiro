"use client";

import { useCallback, useState } from "react";
import { SeriesProblemsDialog } from "./SeriesScope";
import { patchFollowing, type FollowingBody, type FollowingProblem } from "@/lib/series-client";

export type FollowingOutcome =
  | { ok: true; count: number }
  | { ok: false; message: string; /** The user closed the problems dialog. */ dismissed?: boolean };

interface Pending {
  appointmentId: string;
  body: FollowingBody;
  problems: FollowingProblem[];
  message: string;
  resolve: (outcome: FollowingOutcome) => void;
}

/**
 * "This and following" edits with the 409 problems flow: `run` resolves once
 * the change is applied, fails, or the user backs out of the problems dialog
 * (render `dialog` somewhere in the tree).
 */
export function useFollowingEdit(canManageAll: boolean) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (appointmentId: string, body: FollowingBody): Promise<FollowingOutcome> => {
    const result = await patchFollowing(appointmentId, body);
    if (result.ok) return result;
    if (!result.problems) return { ok: false, message: result.message };
    const problems = result.problems;
    return new Promise<FollowingOutcome>((resolve) =>
      setPending({ appointmentId, body, problems, message: result.message, resolve }),
    );
  }, []);

  async function applyAnyway(opts: { force?: boolean; forceOutsideHours?: boolean }) {
    if (!pending) return;
    setBusy(true);
    const result = await patchFollowing(pending.appointmentId, { ...pending.body, ...opts });
    setBusy(false);
    if (!result.ok && result.problems) {
      setPending({ ...pending, problems: result.problems, message: result.message });
      return;
    }
    pending.resolve(result.ok ? result : { ok: false, message: result.message });
    setPending(null);
  }

  const dialog = (
    <SeriesProblemsDialog
      problems={pending?.problems ?? null}
      message={pending?.message ?? ""}
      canManageAll={canManageAll}
      busy={busy}
      onApplyAnyway={(opts) => void applyAnyway(opts)}
      onClose={() => {
        pending?.resolve({ ok: false, message: "No changes made.", dismissed: true });
        setPending(null);
      }}
    />
  );

  return { run, dialog };
}

import { KeyRound } from "lucide-react";

/** Staff-side hint on the Profile tab: whether this patient can use the patient portal. */
export function PatientPortalAccess({ email }: { email: string | null }) {
  const trimmed = email?.trim();
  return (
    <p className="mt-3 flex items-start gap-1.5 text-[13px] text-fg-secondary">
      <KeyRound className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      {trimmed ? (
        <span>
          Portal: patient can sign in at <span className="font-mono">/portal</span> with{" "}
          <span className="font-medium text-foreground">{trimmed}</span>
        </span>
      ) : (
        <span>Portal: add an email to let this patient sign in to the patient portal.</span>
      )}
    </p>
  );
}

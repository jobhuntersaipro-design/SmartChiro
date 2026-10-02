import { Resend } from "resend";
import { CODE_TTL_MS } from "@/lib/portal/rules";

const PLACEHOLDER_KEY = /placeholder|^re_(x+|dummy|fake|changeme)$/i;

/** Resend is usable: a key is set and it isn't an obvious placeholder. */
export function portalEmailConfigured(key: string | undefined = process.env.RESEND_API_KEY): boolean {
  return !!key && !PLACEHOLDER_KEY.test(key);
}

let client: Resend | null = null;

/**
 * Email the one-time sign-in code. Without a working Resend key the code is
 * printed to the server console in development only (so the flow can be
 * finished locally); production never logs codes.
 */
export async function sendPortalCodeEmail(to: string, code: string, clinicName: string | null): Promise<void> {
  if (!portalEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[portal] sign-in code for ${to}: ${code} (RESEND_API_KEY not configured — dev only)`);
    } else {
      console.error("[portal] sign-in code not sent: RESEND_API_KEY is not configured");
    }
    return;
  }
  client ??= new Resend(process.env.RESEND_API_KEY);
  const minutes = CODE_TTL_MS / 60_000;
  const from = clinicName ? `${clinicName.replace(/[<>"]/g, "")} via SmartChiro` : "SmartChiro";
  try {
    const { error } = await client.emails.send({
      from: `${from} <noreply@smartchiro.org>`,
      to,
      subject: `${code} is your sign-in code`,
      text: `Your patient portal sign-in code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email — nobody can sign in without the code.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #0b0b0b;">
          <p style="margin: 0 0 16px; font-size: 15px;">Your patient portal sign-in code:</p>
          <p style="margin: 0 0 16px; font-size: 32px; font-weight: 600; letter-spacing: 6px; font-family: 'SF Mono', Menlo, Consolas, monospace;">${code}</p>
          <p style="margin: 0 0 8px; font-size: 14px; color: #585858;">It expires in ${minutes} minutes and works once.</p>
          <p style="margin: 0; font-size: 13px; color: #7d7d7d;">If you didn't ask for it, you can ignore this email — nobody can sign in without the code.</p>
        </div>
      `,
    });
    if (error) console.error("[portal] sign-in email failed", { message: error.message });
  } catch (e) {
    console.error("[portal] sign-in email failed", { message: e instanceof Error ? e.message : String(e) });
  }
}

import type { SignupConfig } from "@/types/whatsapp";

/**
 * Meta WhatsApp Cloud API configuration, read from env at call time so tests
 * and preview deploys can run without it.
 */

const DEFAULT_GRAPH_VERSION = "v23.0";

export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

export function appSecret(): string | null {
  return process.env.META_APP_SECRET?.trim() || null;
}

export function webhookVerifyToken(): string | null {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || null;
}

/**
 * What the browser needs to launch Embedded Signup, or null when the Meta app
 * isn't configured (the UI then offers only the manual connection form).
 */
export function signupConfig(): SignupConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const configId = process.env.META_WA_CONFIG_ID?.trim();
  if (!appId || !configId || !appSecret()) return null;
  return { appId, configId, graphVersion: graphVersion() };
}

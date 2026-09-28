"use client";

import type { SignupConfig } from "@/types/whatsapp";

/**
 * Browser side of Meta's WhatsApp Embedded Signup. Loads the Facebook JS SDK
 * on demand, opens the signup popup and resolves with the exchangeable code
 * (30 s TTL — post it to the server straight away) plus the WABA and phone
 * number the business picked.
 */

export type SignupFlow = "coexistence" | "new";


export interface SignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string | null;
}

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (res: FbLoginResponse) => void, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const SESSION_WAIT_MS = 15_000;
const FINISH_EVENTS = new Set(["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"]);

let sdkPromise: Promise<FacebookSdk> | null = null;

function loadSdk(cfg: SignupConfig): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const init = () => {
      const fb = window.FB;
      if (!fb) return reject(new Error("Facebook SDK failed to load"));
      fb.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.graphVersion });
      resolve(fb);
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Couldn't load Facebook. Check your connection or ad blocker and try again."));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

interface SessionMessage {
  type?: string;
  event?: string;
  data?: { waba_id?: string; phone_number_id?: string; current_step?: string; error_message?: string };
}

function parseSessionMessage(event: MessageEvent): SessionMessage | null {
  let host: string;
  try {
    host = new URL(event.origin).hostname;
  } catch {
    return null;
  }
  if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return null;
  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    return data?.type === "WA_EMBEDDED_SIGNUP" ? (data as SessionMessage) : null;
  } catch {
    return null;
  }
}

export async function runEmbeddedSignup(
  cfg: SignupConfig,
  flow: SignupFlow,
): Promise<SignupResult> {
  const fb = await loadSdk(cfg);

  return new Promise<SignupResult>((resolve, reject) => {
    let code: string | null = null;
    let session: { wabaId: string; phoneNumberId: string | null } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
    };
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };
    const maybeDone = () => {
      if (!code || !session) return;
      cleanup();
      resolve({ code, ...session });
    };

    function onMessage(event: MessageEvent) {
      const msg = parseSessionMessage(event);
      if (!msg) return;
      if (msg.event && FINISH_EVENTS.has(msg.event) && msg.data?.waba_id) {
        session = { wabaId: msg.data.waba_id, phoneNumberId: msg.data.phone_number_id ?? null };
        maybeDone();
      } else if (msg.event === "FINISH_ONLY_WABA") {
        fail("The WhatsApp account was created but no phone number was added. Run the signup again and add a number.");
      } else if (msg.event === "CANCEL") {
        fail(msg.data?.error_message ?? "Signup was cancelled.");
      } else if (msg.event === "ERROR") {
        fail(msg.data?.error_message ?? "Meta reported an error during signup.");
      }
    }
    window.addEventListener("message", onMessage);

    const extras: Record<string, unknown> = { setup: {}, sessionInfoVersion: "3" };
    if (flow === "coexistence") extras.featureType = "whatsapp_business_app_onboarding";

    // FB.login rejects async callbacks, so keep this one synchronous.
    fb.login(
      (res) => {
        const c = res.authResponse?.code;
        if (!c) return fail("Signup was cancelled.");
        code = c;
        if (session) return maybeDone();
        timer = setTimeout(
          () => fail("Meta didn't report which number was connected. Please try again."),
          SESSION_WAIT_MS,
        );
      },
      {
        config_id: cfg.configId,
        response_type: "code",
        override_default_response_type: true,
        extras,
      },
    );
  });
}

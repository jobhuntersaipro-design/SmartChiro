import { randomInt } from "crypto";
import type { WhatsAppConnectionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appSecret } from "./config";
import { encryptSecret } from "./crypto";
import { GraphError, graphRequest } from "./graph";
import { ensureWhatsAppTemplates, REMINDER_TEMPLATE_NAME } from "./templates";

/** Exchanges the Embedded Signup code (30 s TTL) for a business token. */
export async function exchangeCode(code: string): Promise<string> {
  const appId = process.env.META_APP_ID?.trim();
  const secret = appSecret();
  if (!appId || !secret) throw new Error("META_APP_ID and META_APP_SECRET must be set");
  const res = await graphRequest<{ access_token: string }>("oauth/access_token", {
    query: { client_id: appId, client_secret: secret, code },
  });
  return res.access_token;
}

interface PhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
}

/**
 * Confirms the token can see the number on this WABA and returns its details.
 * Without an id (some signup events omit it) the WABA must have exactly one.
 */
async function findNumberOnWaba(wabaId: string, phoneNumberId: string | null, token: string): Promise<PhoneNumber> {
  const res = await graphRequest<{ data: PhoneNumber[] }>(`${wabaId}/phone_numbers`, {
    token,
    query: { fields: "id,display_phone_number,verified_name", limit: "100" },
  });
  const numbers = res.data ?? [];
  if (!phoneNumberId) {
    if (numbers.length === 1) return numbers[0];
    throw new ConnectError(
      "number_ambiguous",
      numbers.length ? "This WhatsApp Business Account has several numbers — connect manually with the phone number ID." : "This WhatsApp Business Account has no phone number yet.",
    );
  }
  const number = numbers.find((n) => n.id === phoneNumberId);
  if (!number) throw new ConnectError("number_not_on_waba", "That phone number ID is not on this WhatsApp Business Account.");
  return number;
}

export async function subscribeApp(wabaId: string, token: string): Promise<void> {
  await graphRequest(`${wabaId}/subscribed_apps`, { method: "POST", token });
}

export async function unsubscribeApp(wabaId: string, token: string): Promise<void> {
  await graphRequest(`${wabaId}/subscribed_apps`, { method: "DELETE", token });
}

async function registerNumber(phoneNumberId: string, token: string, pin: string): Promise<void> {
  await graphRequest(`${phoneNumberId}/register`, {
    method: "POST",
    token,
    body: { messaging_product: "whatsapp", pin },
  });
}

export class ConnectError extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) {
    super(message);
    this.name = "ConnectError";
  }
}

export interface ConnectInput {
  branchId: string;
  userId: string;
  wabaId: string;
  /** Null when Embedded Signup didn't report it; resolved from the WABA. */
  phoneNumberId: string | null;
  token: string;
  type: WhatsAppConnectionType;
}

/**
 * Shared by Embedded Signup and manual connections: verify the number,
 * subscribe our app to the WABA's webhooks, register brand-new numbers,
 * save the (encrypted) token and create the reminder templates.
 */
export async function connectAccount(input: ConnectInput) {
  const { branchId, wabaId, token, type } = input;

  const number = await findNumberOnWaba(wabaId, input.phoneNumberId, token);
  const phoneNumberId = number.id;

  const other = await prisma.whatsAppAccount.findUnique({ where: { phoneNumberId } });
  if (other && other.branchId !== branchId) {
    throw new ConnectError("number_in_use", "This WhatsApp number is already connected to another branch.", 409);
  }
  await subscribeApp(wabaId, token);

  // Coexistence numbers are already registered by the Business app, and
  // manual connections are registered by whoever set them up.
  // Signup can also pick a number that's already on Cloud API, where
  // /register fails on a PIN mismatch — keep going and surface the warning.
  const errors: string[] = [];
  let registrationPinEnc: string | null = null;
  if (type === "EMBEDDED_SIGNUP") {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await registerNumber(phoneNumberId, token, pin);
      registrationPinEnc = encryptSecret(pin);
    } catch (e) {
      errors.push(`Number registration: ${e instanceof GraphError ? e.userMessage : String(e)}`);
    }
  }

  const templates = await ensureWhatsAppTemplates(wabaId, token);
  const templateStatus = templates.status;
  errors.push(...templates.errors.map((m) => `Template setup: ${m}`));

  const data = {
    wabaId,
    phoneNumberId,
    displayPhoneNumber: number.display_phone_number ?? null,
    verifiedName: number.verified_name ?? null,
    connectionType: type,
    status: "CONNECTED" as const,
    lastError: errors.length ? errors.join("; ") : null,
    accessTokenEnc: encryptSecret(token),
    registrationPinEnc,
    templateName: REMINDER_TEMPLATE_NAME,
    templateStatus,
    templatesCheckedAt: new Date(),
    connectedById: input.userId,
  };
  return prisma.whatsAppAccount.upsert({
    where: { branchId },
    create: { branchId, ...data },
    update: data,
  });
}

/** Maps connection failures to `{ status, body }` for the API routes. */
export function connectErrorResponse(e: unknown): { status: number; body: { error: string; message: string } } {
  if (e instanceof ConnectError) return { status: e.status, body: { error: e.code, message: e.message } };
  if (e instanceof GraphError) {
    return { status: 502, body: { error: "meta_error", message: e.userMessage } };
  }
  console.error("whatsapp connect failed", e);
  return { status: 500, body: { error: "internal", message: "Could not connect WhatsApp. Please try again." } };
}

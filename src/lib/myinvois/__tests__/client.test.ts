import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MyInvoisApiError,
  MyInvoisClient,
  clearMyInvoisTokenCache,
  flattenErrors,
  myInvoisStatus,
  parseRetryAfter,
  readMyInvoisConfig,
  validationLink,
} from "../client";

const ENV = { MYINVOIS_CLIENT_ID: "client-123", MYINVOIS_CLIENT_SECRET: "s3cret-value", MYINVOIS_ENV: "sandbox" };

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function setup(handler: Handler, now = { t: 1_000_000 }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  });
  const sleeps: number[] = [];
  const client = new MyInvoisClient(readMyInvoisConfig(ENV)!, {
    fetch: fetchMock,
    sleep: async (ms) => {
      sleeps.push(ms);
      now.t += ms;
    },
    now: () => now.t,
  });
  return { client, calls, sleeps, now };
}

const token = (expiresIn = 3600) => json(200, { access_token: "tok-1", token_type: "Bearer", expires_in: expiresIn, scope: "InvoicingAPI" });

afterEach(() => clearMyInvoisTokenCache());

describe("configuration", () => {
  it("is off without credentials and never exposes secrets", () => {
    expect(readMyInvoisConfig({})).toBeNull();
    expect(myInvoisStatus({})).toEqual({ configured: false, environment: "sandbox", intermediary: false });
    const status = myInvoisStatus({ ...ENV, MYINVOIS_ENV: "production", MYINVOIS_ON_BEHALF_OF: "C1" });
    expect(status).toEqual({ configured: true, environment: "production", intermediary: true });
    expect(JSON.stringify(status)).not.toContain("s3cret");
  });

  it("picks sandbox vs production base URLs, with overrides", () => {
    expect(readMyInvoisConfig(ENV)).toMatchObject({
      apiBaseUrl: "https://preprod-api.myinvois.hasil.gov.my",
      identityBaseUrl: "https://preprod-api.myinvois.hasil.gov.my",
      portalBaseUrl: "https://preprod.myinvois.hasil.gov.my",
    });
    expect(readMyInvoisConfig({ ...ENV, MYINVOIS_ENV: "production", MYINVOIS_IDENTITY_URL: "https://id.example/" })).toMatchObject({
      apiBaseUrl: "https://api.myinvois.hasil.gov.my",
      identityBaseUrl: "https://id.example",
      portalBaseUrl: "https://myinvois.hasil.gov.my",
    });
  });

  it("builds the public validation link", () => {
    expect(validationLink("https://preprod.myinvois.hasil.gov.my", "UUID1", "LONG2")).toBe("https://preprod.myinvois.hasil.gov.my/UUID1/share/LONG2");
  });
});

describe("token handling", () => {
  it("logs in with client credentials + InvoicingAPI scope and caches the token until it nearly expires", async () => {
    const { client, calls, now } = setup((url) => (url.endsWith("/connect/token") ? token(3600) : json(200, { documentSummary: [] })));
    await client.getSubmission("SUB1");
    await client.getSubmission("SUB1");
    const logins = calls.filter((c) => c.url.endsWith("/connect/token"));
    expect(logins).toHaveLength(1);
    expect(logins[0].url).toBe("https://preprod-api.myinvois.hasil.gov.my/connect/token");
    const body = new URLSearchParams(String(logins[0].init.body));
    expect(Object.fromEntries(body)).toEqual({
      client_id: "client-123",
      client_secret: "s3cret-value",
      grant_type: "client_credentials",
      scope: "InvoicingAPI",
    });
    expect((logins[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const api = calls.find((c) => c.url.includes("documentsubmissions"))!;
    expect((api.init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");

    now.t += 3600_000 - 30_000; // inside the 60 s renewal window
    await client.getSubmission("SUB1");
    expect(calls.filter((c) => c.url.endsWith("/connect/token"))).toHaveLength(2);
  });

  it("sends the onbehalfof header for intermediaries", async () => {
    const calls: RequestInit[] = [];
    const client = new MyInvoisClient(readMyInvoisConfig({ ...ENV, MYINVOIS_ON_BEHALF_OF: "C25845632020" })!, {
      fetch: async (_url, init) => {
        calls.push(init ?? {});
        return token();
      },
    });
    await client.getToken();
    expect((calls[0].headers as Record<string, string>).onbehalfof).toBe("C25845632020");
  });

  it("re-logs in once after a 401", async () => {
    let apiCalls = 0;
    const { client, calls } = setup((url) => {
      if (url.endsWith("/connect/token")) return token();
      apiCalls++;
      return apiCalls === 1 ? json(401, {}) : json(200, { documentSummary: [] });
    });
    await client.getSubmission("SUB1");
    expect(calls.filter((c) => c.url.endsWith("/connect/token"))).toHaveLength(2);
  });

  it("reports a failed login without the secret", async () => {
    const { client } = setup(() => json(400, { error: "invalid_client", error_description: "Bad credentials" }));
    const err = await client.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MyInvoisApiError);
    expect((err as Error).message).toContain("Bad credentials");
    expect((err as Error).message).not.toContain("s3cret");
  });
});

describe("rate limiting", () => {
  it("honours Retry-After on 429 and retries", async () => {
    let n = 0;
    const { client, sleeps } = setup((url) => {
      if (url.endsWith("/connect/token")) return token();
      n++;
      return n < 3 ? json(429, { error: { errorCode: "TooManyRequests" } }, { "Retry-After": "2" }) : json(200, { documentSummary: [] });
    });
    await client.getSubmission("SUB1");
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("gives up with retryAfter when LHDN asks for a longer wait than we allow", async () => {
    const { client, sleeps } = setup((url) => (url.endsWith("/connect/token") ? token() : json(429, {}, { "Retry-After": "120" })));
    const err = (await client.getSubmission("SUB1").catch((e: unknown) => e)) as MyInvoisApiError;
    expect(err).toBeInstanceOf(MyInvoisApiError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(120);
    expect(sleeps).toEqual([]);
  });

  it("backs off exponentially without Retry-After and stops after maxRetries", async () => {
    const { client, sleeps } = setup((url) => (url.endsWith("/connect/token") ? token() : json(503, {})));
    await expect(client.getSubmission("SUB1")).rejects.toBeInstanceOf(MyInvoisApiError);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfter("5", 0)).toBe(5);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});

describe("documents API", () => {
  it("submits base64 + hash + codeNumber and maps the 202 response", async () => {
    const { client, calls } = setup((url, init) => {
      if (url.endsWith("/connect/token")) return token();
      expect(init.method).toBe("POST");
      return json(202, {
        submissionUID: "SUB26CHARS0000000000000000",
        acceptedDocuments: [{ uuid: "UUID1", invoiceCodeNumber: "INV-1" }],
        rejectedDocuments: [{ invoiceCodeNumber: "INV-2", error: { errorCode: "BadArgument", error: "Invalid TIN", details: [{ errorCode: "CF321", error: "Supplier TIN invalid", propertyPath: "Invoice.AccountingSupplierParty" }] } }],
      });
    });
    const res = await client.submitDocuments([
      { format: "JSON", document: "e30=", documentHash: "44136fa3", codeNumber: "INV-1" },
      { format: "JSON", document: "e30=", documentHash: "44136fa3", codeNumber: "INV-2" },
    ]);
    const submit = calls.find((c) => c.url.includes("documentsubmissions"))!;
    expect(submit.url).toBe("https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions/");
    expect(JSON.parse(String(submit.init.body))).toEqual({
      documents: [
        { format: "JSON", document: "e30=", documentHash: "44136fa3", codeNumber: "INV-1" },
        { format: "JSON", document: "e30=", documentHash: "44136fa3", codeNumber: "INV-2" },
      ],
    });
    expect(res.submissionUid).toBe("SUB26CHARS0000000000000000");
    expect(res.acceptedDocuments).toEqual([{ uuid: "UUID1", invoiceCodeNumber: "INV-1" }]);
    expect(flattenErrors(res.rejectedDocuments[0].error)).toEqual([
      { code: "BadArgument", message: "Invalid TIN", path: null },
      { code: "CF321", message: "Supplier TIN invalid", path: "Invoice.AccountingSupplierParty" },
    ]);
  });

  it("surfaces LHDN's error on a failed submission (e.g. duplicate within 10 minutes)", async () => {
    const { client } = setup((url) =>
      url.endsWith("/connect/token") ? token() : json(422, { error: { errorCode: "DuplicateSubmission", error: "Duplicate submission" } }, { "Retry-After": "600" }),
    );
    const err = (await client.submitDocuments([]).catch((e: unknown) => e)) as MyInvoisApiError;
    expect(err).toMatchObject({ status: 422, code: "DuplicateSubmission", retryAfter: 600 });
  });

  it("polls submissions, reads document details and cancels", async () => {
    const { client, calls } = setup((url, init) => {
      if (url.endsWith("/connect/token")) return token();
      if (url.includes("/documentsubmissions/SUB1")) return json(200, { submissionUid: "SUB1", overallStatus: "valid", documentSummary: [{ uuid: "U1", status: "Valid", longId: "L1" }] });
      if (url.endsWith("/documents/U1/details")) return json(200, { uuid: "U1", status: "Valid", longId: "L1" });
      if (url.endsWith("/documents/state/U1/state")) {
        expect(init.method).toBe("PUT");
        expect(JSON.parse(String(init.body))).toEqual({ status: "cancelled", reason: "Wrong buyer details" });
        return json(200, { uuid: "U1", status: "Cancelled" });
      }
      return json(404, {});
    });
    expect((await client.getSubmission("SUB1")).documentSummary[0]).toMatchObject({ status: "Valid", longId: "L1" });
    expect(calls.at(-1)!.url).toBe("https://preprod-api.myinvois.hasil.gov.my/api/v1.0/documentsubmissions/SUB1?pageNo=1&pageSize=100");
    expect((await client.getDocumentDetails("U1")).longId).toBe("L1");
    expect(await client.cancelDocument("U1", "Wrong buyer details")).toEqual({ uuid: "U1", status: "Cancelled" });
  });
});

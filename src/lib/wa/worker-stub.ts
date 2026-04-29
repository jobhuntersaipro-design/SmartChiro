// In-memory replacement for the worker, used by integration tests.
// Replace fetch with the stub via vi.stubGlobal in test setup.

import type { WorkerSendResult } from "@/types/reminder";

type SendFn = (args: { branchId: string; to: string; body: string }) => Promise<WorkerSendResult>;

let sendImpl: SendFn = async () => ({
  ok: true,
  msgId: "stub_" + Math.random().toString(36).slice(2),
});

export function setStubSend(fn: SendFn): void {
  sendImpl = fn;
}

export function resetStub(): void {
  sendImpl = async () => ({
    ok: true,
    msgId: "stub_" + Math.random().toString(36).slice(2),
  });
}

/** Drop-in replacement for fetch that handles worker URLs only. */
export function makeStubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("/branches/")) {
      throw new Error("stub fetch: unexpected URL " + url);
    }
    if (url.includes("/send") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { to: string; body: string };
      const branchId = url.split("/branches/")[1].split("/")[0];
      const result = await sendImpl({ branchId, to: body.to, body: body.body });
      if (result.ok) {
        return new Response(JSON.stringify({ msgId: result.msgId }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { code: result.code, message: result.message } }),
        { status: 400 }
      );
    }
    if (url.includes("/status") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({ status: "CONNECTED", phoneNumber: "+60123456789" }),
        { status: 200 }
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}

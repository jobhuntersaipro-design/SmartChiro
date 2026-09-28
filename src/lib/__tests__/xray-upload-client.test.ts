import { describe, it, expect, vi } from "vitest";
import {
  uploadXray,
  DirectUploadBlockedError,
  PROXY_UPLOAD_LIMIT,
  titleFromFileName,
  type UploadTransport,
} from "@/lib/xray-upload-client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function transport(opts: { putFails?: Error; confirmStatus?: number } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  const t: UploadTransport = {
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/xrays/upload-url") return json(200, { xrayId: "x1", uploadUrl: "https://r2/put", thumbnailUploadUrl: "https://r2/thumb" });
      if (url.endsWith("/confirm")) return json(opts.confirmStatus ?? 200, opts.confirmStatus ? { message: "The file didn't reach storage." } : { xray: {} });
      if (url.endsWith("/abort")) return new Response(null, { status: 204 });
      return json(404, {});
    }),
    put: vi.fn(async (url: string, _body: Blob, _type: string, onProgress?: (p: number) => void) => {
      calls.push({ url });
      if (opts.putFails && url === "https://r2/put") throw opts.putFails;
      onProgress?.(100);
    }),
    postForm: vi.fn(async (url: string) => {
      calls.push({ url });
      return json(200, { xrayId: "proxy-1" });
    }),
  };
  return { t, calls };
}

const file = (size: number) => new File([new Uint8Array(size)], "Lat cervical.jpg", { type: "image/jpeg" });
const input = (size = 1000) => ({ file: file(size), thumbnail: new Blob(["t"]), width: 2000, height: 2400, patientId: "p1", bodyRegion: "CERVICAL" as const, viewType: "LATERAL" as const });

describe("uploadXray", () => {
  it("puts the file straight to storage, then confirms with dimensions and metadata", async () => {
    const { t, calls } = transport();
    const progress: number[] = [];
    await expect(uploadXray({ ...input(), onProgress: (p) => progress.push(p) }, t)).resolves.toEqual({ xrayId: "x1" });
    expect(calls.map((c) => c.url)).toEqual(["/api/xrays/upload-url", "https://r2/put", "https://r2/thumb", "/api/xrays/x1/confirm"]);
    expect(calls[3].body).toEqual({ width: 2000, height: 2400, title: "Lat cervical", bodyRegion: "CERVICAL", viewType: "LATERAL" });
    expect(progress).toEqual([100]);
  });

  it("removes the half-created X-ray when confirming fails", async () => {
    const { t, calls } = transport({ confirmStatus: 409 });
    await expect(uploadXray(input(), t)).rejects.toThrow("didn't reach storage");
    expect(calls.at(-1)?.url).toBe("/api/xrays/x1/abort");
  });

  it("falls back to the server proxy for small files when storage blocks the browser", async () => {
    const { t, calls } = transport({ putFails: new DirectUploadBlockedError("cors") });
    await expect(uploadXray(input(PROXY_UPLOAD_LIMIT), t)).resolves.toEqual({ xrayId: "proxy-1" });
    expect(calls.map((c) => c.url)).toContain("/api/xrays/x1/abort");
    expect(calls.at(-1)?.url).toBe("/api/xrays/upload");
  });

  it("explains the CORS problem for large files instead of trying the size-capped proxy", async () => {
    const { t, calls } = transport({ putFails: new DirectUploadBlockedError("cors") });
    await expect(uploadXray(input(PROXY_UPLOAD_LIMIT + 1), t)).rejects.toThrow(/CORS/);
    expect(calls.map((c) => c.url)).not.toContain("/api/xrays/upload");
  });

  it("derives a title from the file name", () => {
    expect(titleFromFileName("IMG_2231.final.jpeg")).toBe("IMG_2231.final");
  });
});

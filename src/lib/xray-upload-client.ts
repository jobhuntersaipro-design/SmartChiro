export type BodyRegion = "CERVICAL" | "THORACIC" | "LUMBAR" | "PELVIS" | "FULL_SPINE" | "EXTREMITY" | "OTHER";
export type ViewType = "AP" | "LATERAL" | "OBLIQUE" | "PA" | "OTHER";

export interface XrayUploadInput {
  file: File;
  thumbnail: Blob;
  width: number;
  height: number;
  patientId: string;
  title?: string;
  bodyRegion?: BodyRegion | null;
  viewType?: ViewType | null;
  onProgress?: (percent: number) => void;
}

/** The server-proxy fallback runs in a serverless function, whose request body is capped (~4.5 MB on Vercel). */
export const PROXY_UPLOAD_LIMIT = 4 * 1024 * 1024;

/** Browser couldn't talk to storage at all — almost always the bucket's CORS rules. */
export class DirectUploadBlockedError extends Error {}

export interface UploadTransport {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** PUT a body to a URL, reporting progress. Rejects with DirectUploadBlockedError on a network/CORS failure. */
  put: (url: string, body: Blob, contentType: string, onProgress?: (percent: number) => void) => Promise<void>;
  /** POST multipart form data with upload progress. */
  postForm: (url: string, form: FormData, onProgress?: (percent: number) => void) => Promise<Response>;
}

/** "IMG_2231.jpg" → "IMG_2231". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 200);
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Upload an X-ray straight to storage (R2) with a presigned URL, then confirm
 * it. The file never passes through our serverless functions, so large films
 * work and progress is real. If the browser is blocked from storage (bucket
 * CORS not configured) small files fall back to the server proxy; anything
 * else that fails removes the half-created record.
 */
export async function uploadXray(input: XrayUploadInput, transport: UploadTransport = browserTransport): Promise<{ xrayId: string }> {
  const { file, thumbnail, width, height, patientId, onProgress } = input;
  const title = input.title?.trim() || titleFromFileName(file.name);
  const metadata = { title, bodyRegion: input.bodyRegion ?? null, viewType: input.viewType ?? null };

  const urlRes = await transport.fetch("/api/xrays/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type, patientId }),
  });
  if (!urlRes.ok) throw new Error(await errorMessage(urlRes, "Couldn't start the upload."));
  const { xrayId, uploadUrl, thumbnailUploadUrl } = (await urlRes.json()) as {
    xrayId: string;
    uploadUrl: string;
    thumbnailUploadUrl: string;
  };

  const abort = () => transport.fetch(`/api/xrays/${xrayId}/abort`, { method: "POST" }).catch(() => undefined);

  try {
    await transport.put(uploadUrl, file, file.type, onProgress);
    // The thumbnail is a nicety — the film is what matters.
    await transport.put(thumbnailUploadUrl, thumbnail, "image/jpeg").catch(() => undefined);

    const confirmRes = await transport.fetch(`/api/xrays/${xrayId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width, height, ...metadata }),
    });
    if (!confirmRes.ok) throw new Error(await errorMessage(confirmRes, "Couldn't finish the upload."));
    return { xrayId };
  } catch (error) {
    await abort();
    if (error instanceof DirectUploadBlockedError && typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("You're offline. Check the connection and try again.");
    }
    if (error instanceof DirectUploadBlockedError) {
      if (file.size <= PROXY_UPLOAD_LIMIT) return uploadViaProxy(input, metadata, transport);
      throw new Error(
        "Upload to storage was blocked. Ask your administrator to allow this site in the storage bucket's CORS settings.",
      );
    }
    throw error;
  }
}

async function uploadViaProxy(
  input: XrayUploadInput,
  metadata: { title: string; bodyRegion: BodyRegion | null; viewType: ViewType | null },
  transport: UploadTransport,
): Promise<{ xrayId: string }> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("thumbnail", new File([input.thumbnail], "thumbnail.jpg", { type: "image/jpeg" }));
  form.append("patientId", input.patientId);
  form.append("width", String(input.width));
  form.append("height", String(input.height));
  form.append("title", metadata.title);
  if (metadata.bodyRegion) form.append("bodyRegion", metadata.bodyRegion);
  if (metadata.viewType) form.append("viewType", metadata.viewType);
  const res = await transport.postForm("/api/xrays/upload", form, input.onProgress);
  if (!res.ok) throw new Error(await errorMessage(res, "Upload failed."));
  const data = (await res.json()) as { xrayId: string };
  return { xrayId: data.xrayId };
}

function xhrRequest(
  method: "PUT" | "POST",
  url: string,
  body: Blob | FormData,
  contentType: string | null,
  onProgress?: (percent: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    // Status 0: the request never got a response — offline, or blocked by CORS.
    xhr.onerror = () => reject(new DirectUploadBlockedError("Network error during upload."));
    xhr.send(body);
  });
}

const browserTransport: UploadTransport = {
  fetch: (input, init) => fetch(input, init),
  put: async (url, body, contentType, onProgress) => {
    const { status } = await xhrRequest("PUT", url, body, contentType, onProgress);
    if (status < 200 || status >= 300) throw new Error(`Storage rejected the upload (status ${status}).`);
  },
  postForm: async (url, form, onProgress) => {
    const { status, text } = await xhrRequest("POST", url, form, null, onProgress);
    return new Response(text, { status, headers: { "Content-Type": "application/json" } });
  },
};

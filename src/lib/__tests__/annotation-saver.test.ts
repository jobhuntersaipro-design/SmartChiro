import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnnotationSaver, CONFLICT_MESSAGE, type SaveStatus } from "@/lib/annotation-saver";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

const ADJ: ImageAdjustments = { brightness: 0, contrast: 0, invert: false };

function state(label: string): AnnotationCanvasState {
  return {
    version: 1,
    shapes: [{ id: label } as AnnotationCanvasState["shapes"][number]],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    metadata: { shapeCount: 1, measurementCount: 0, lastModifiedShapeId: label },
  };
}

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/** Fetch mock whose responses are released one at a time. */
function controlledFetch() {
  const calls: Call[] = [];
  const pending: Array<(res: Response) => void> = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "{}")) });
    return new Promise<Response>((resolve) => pending.push(resolve));
  };
  const respond = async (status: number, json: unknown) => {
    const resolve = pending.shift();
    if (!resolve) throw new Error("no pending request");
    resolve(new Response(JSON.stringify(json), { status }));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { calls, fetchImpl, respond, pendingCount: () => pending.length };
}

function makeSaver(fetchImpl: ReturnType<typeof controlledFetch>["fetchImpl"], annotationId: string | null = "ann-1") {
  const log = { statuses: [] as SaveStatus[], dirty: [] as boolean[], errors: [] as (string | null)[] };
  const saver = new AnnotationSaver(
    { xrayId: "xr-1", annotationId, version: 3 },
    "user-1",
    {
      onStatus: (s, e) => {
        log.statuses.push(s);
        log.errors.push(e);
      },
      onDirty: (d) => log.dirty.push(d),
      onSaved: () => undefined,
      onSizeWarning: () => undefined,
    },
    fetchImpl,
    500,
  );
  return { saver, log };
}

describe("AnnotationSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces edits and sends the base version", async () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(499);
    expect(f.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: "/api/annotations/ann-1", method: "PUT" });
    expect(f.calls[0].body.baseVersion).toBe(3);
    await f.respond(200, { version: 4 });
    expect(saver.isDirty).toBe(false);
    expect(saver.version).toBe(4);
  });

  it("keeps an edit made while a save is in flight, then saves it", async () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(500);
    // Edit lands mid-flight.
    saver.update(state("b"), ADJ);
    saver.markDirty();
    await f.respond(200, { version: 4 });
    expect(saver.isDirty).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.calls).toHaveLength(2);
    expect((f.calls[1].body.canvasState as AnnotationCanvasState).shapes[0].id).toBe("b");
    expect(f.calls[1].body.baseVersion).toBe(4);
    await f.respond(200, { version: 5 });
    expect(saver.isDirty).toBe(false);
  });

  it("never runs two saves at once, and the first save creates only one annotation", async () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl, null);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    void saver.flush();
    saver.update(state("b"), ADJ);
    saver.markDirty();
    void saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.pendingCount()).toBe(1);
    expect(f.calls[0]).toMatchObject({ url: "/api/xrays/xr-1/annotations", method: "POST" });
    await f.respond(201, { annotation: { id: "new-ann", version: 1 } });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]).toMatchObject({ url: "/api/annotations/new-ann", method: "PUT" });
    expect((f.calls[1].body.canvasState as AnnotationCanvasState).shapes[0].id).toBe("b");
  });

  it("saves the old X-ray's pending edits to the old target when switching", async () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl);
    saver.update(state("old"), ADJ);
    saver.markDirty();
    void saver.switchTarget({ xrayId: "xr-2", annotationId: "ann-2", version: 7 });
    expect(saver.isDirty).toBe(false);
    saver.update(state("new"), ADJ);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls[0].url).toBe("/api/annotations/ann-1");
    expect((f.calls[0].body.canvasState as AnnotationCanvasState).shapes[0].id).toBe("old");
    await f.respond(200, { version: 4 });
    // Nothing edited on the new X-ray yet — no save for it.
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.calls).toHaveLength(1);
    expect(saver.annotationId).toBe("ann-2");
  });

  it("reports a conflict on 409, skips the unload beacon, and overwrites on retry", async () => {
    const f = controlledFetch();
    const { saver, log } = makeSaver(f.fetchImpl);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(500);
    await f.respond(409, { error: "version_conflict", version: 9 });
    expect(log.statuses.at(-1)).toBe("conflict");
    expect(log.errors.at(-1)).toBe(CONFLICT_MESSAGE);
    expect(saver.isDirty).toBe(true);
    expect(saver.unloadRequest()).toBeNull();
    void saver.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls[1].body.baseVersion).toBeUndefined();
    await f.respond(200, { version: 10 });
    expect(saver.isDirty).toBe(false);
  });

  it("retries network failures with backoff, then reports failure", async () => {
    const f = controlledFetch();
    const { saver, log } = makeSaver(f.fetchImpl);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    await vi.advanceTimersByTimeAsync(500);
    await f.respond(500, {});
    expect(log.statuses.at(-1)).toBe("retrying");
    await vi.advanceTimersByTimeAsync(2000);
    await f.respond(500, {});
    await vi.advanceTimersByTimeAsync(4000);
    await f.respond(500, {});
    expect(log.statuses.at(-1)).toBe("failed");
    expect(saver.isDirty).toBe(true);
  });

  it("builds an unload request only while something is unsaved", () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl);
    saver.update(state("a"), ADJ);
    expect(saver.unloadRequest()).toBeNull();
    saver.markDirty();
    const req = saver.unloadRequest();
    expect(req?.url).toBe("/api/annotations/ann-1");
    expect(JSON.parse(req!.body).baseVersion).toBeUndefined();
  });

  it("adopts a late-loading annotation instead of creating a second one", async () => {
    const f = controlledFetch();
    const { saver } = makeSaver(f.fetchImpl, null);
    expect(saver.adoptIfEditing("ann-9", 2)).toBe(false);
    saver.update(state("a"), ADJ);
    saver.markDirty();
    expect(saver.adoptIfEditing("ann-9", 2)).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.calls[0]).toMatchObject({ url: "/api/annotations/ann-9", method: "PUT" });
    expect(f.calls[0].body.baseVersion).toBe(2);
  });
});

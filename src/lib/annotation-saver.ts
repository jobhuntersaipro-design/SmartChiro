import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "failed" | "conflict";

export interface SaveTarget {
  xrayId: string;
  annotationId: string | null;
  /** Server version this client last saw; sent as `baseVersion` to detect lost updates. */
  version: number | null;
}

interface Snapshot {
  state: AnnotationCanvasState;
  adjustments: ImageAdjustments;
}

export interface SaverEvents {
  onStatus: (status: SaveStatus, error: string | null) => void;
  onDirty: (dirty: boolean) => void;
  onSaved: (at: Date) => void;
  onSizeWarning: (warning: string | null) => void;
}

interface Job {
  target: SaveTarget;
  generation: number;
  /** Fixed snapshot for a target that is no longer active; null = read the latest state at run time. */
  snapshot: Snapshot | null;
  overwrite: boolean;
  attempts: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MAX_CANVAS_STATE_SIZE = 10 * 1024 * 1024;
export const WARN_CANVAS_STATE_SIZE = 5 * 1024 * 1024;
export const MAX_ATTEMPTS = 3;
export const CONFLICT_MESSAGE =
  "These annotations were changed in another tab or by a colleague. Reload to see them, or overwrite with yours.";

class ConflictError extends Error {}
class FatalError extends Error {}

/**
 * Persists annotation edits for the X-ray viewer.
 *
 * - Saves are serialised on one promise chain, so an older save can never land
 *   after a newer one and the first save can't create two annotations.
 * - Every edit bumps a revision; a save only clears "dirty" when no edit
 *   arrived while it was in flight, otherwise another save follows.
 * - Switching X-ray (multi-view) first queues a save of the old X-ray's edits
 *   against the old target.
 * - Each save sends the version it started from; a 409 means someone else
 *   saved in between, which is surfaced instead of silently overwritten.
 */
export class AnnotationSaver {
  private target: SaveTarget;
  private generation = 0;
  private revision = 0;
  private savedRevision = 0;
  private latest: Snapshot | null = null;
  private chain: Promise<void> = Promise.resolve();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFailed: Job | null = null;
  private inFlight = 0;
  /** Set on a 409 — don't let an unload beacon overwrite the other copy behind the user's back. */
  private conflicted = false;

  constructor(
    target: SaveTarget,
    private readonly userId: string,
    private readonly events: SaverEvents,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly debounceMs = 500,
  ) {
    this.target = { ...target };
  }

  get xrayId(): string {
    return this.target.xrayId;
  }

  get annotationId(): string | null {
    return this.target.annotationId;
  }

  get version(): number | null {
    return this.target.version;
  }

  get isDirty(): boolean {
    return this.revision !== this.savedRevision;
  }

  get isSaving(): boolean {
    return this.inFlight > 0;
  }

  update(state: AnnotationCanvasState, adjustments: ImageAdjustments): void {
    this.latest = { state, adjustments };
  }

  markDirty(): void {
    this.revision++;
    this.events.onDirty(true);
    this.scheduleDebounce();
  }

  /** Save now if there is anything unsaved (or always, with `force`). */
  flush(options: { force?: boolean; overwrite?: boolean } = {}): Promise<void> {
    this.clearDebounce();
    if (!options.force && !this.isDirty) return this.chain;
    return this.enqueue({
      target: this.target,
      generation: this.generation,
      snapshot: null,
      overwrite: options.overwrite ?? false,
      attempts: 0,
    });
  }

  /** Retry after a failure, or overwrite after a conflict. */
  retry(): Promise<void> {
    this.conflicted = false;
    const job = this.lastFailed;
    this.lastFailed = null;
    if (job && job.generation !== this.generation) {
      return this.enqueue({ ...job, overwrite: true, attempts: 0 });
    }
    return this.flush({ force: true, overwrite: true });
  }

  /** Point future saves at another X-ray, saving the current one's pending edits first. */
  switchTarget(next: SaveTarget): Promise<void> {
    this.clearDebounce();
    this.clearRetry();
    let pending = this.chain;
    if (this.isDirty && this.latest) {
      pending = this.enqueue({
        target: this.target,
        generation: this.generation,
        snapshot: this.latest,
        overwrite: false,
        attempts: 0,
      });
    }
    this.generation++;
    this.conflicted = false;
    this.target = { ...next };
    this.revision = 0;
    this.savedRevision = 0;
    this.latest = null;
    this.events.onDirty(false);
    this.events.onStatus("idle", null);
    this.events.onSizeWarning(null);
    return pending;
  }

  /**
   * The current X-ray's existing annotation finished loading after the user
   * had already started drawing: keep the edits and save them into it rather
   * than creating a second annotation. Returns false when there is nothing to adopt into.
   */
  adoptIfEditing(annotationId: string, version: number | null): boolean {
    if (!this.isDirty || this.target.annotationId) return false;
    this.target.annotationId = annotationId;
    this.target.version = version;
    return true;
  }

  /** Request to fire with sendBeacon when the page is closing, or null when nothing is unsaved. */
  unloadRequest(): { url: string; body: string } | null {
    if (!this.isDirty || !this.latest || this.conflicted) return null;
    const { state, adjustments } = this.latest;
    const canvasStateSize = byteSize(JSON.stringify(state));
    if (this.target.annotationId) {
      return {
        url: `/api/annotations/${this.target.annotationId}`,
        body: JSON.stringify({ canvasState: state, canvasStateSize, imageAdjustments: adjustments }),
      };
    }
    return {
      url: `/api/xrays/${this.target.xrayId}/annotations`,
      body: JSON.stringify({
        canvasState: state,
        canvasStateSize,
        imageAdjustments: adjustments,
        createdById: this.userId,
      }),
    };
  }

  dispose(): void {
    this.clearDebounce();
    this.clearRetry();
  }

  private enqueue(job: Job): Promise<void> {
    this.chain = this.chain.then(() => this.run(job));
    return this.chain;
  }

  private isCurrent(job: Job): boolean {
    return job.generation === this.generation;
  }

  private async run(job: Job): Promise<void> {
    const current = this.isCurrent(job);
    const snapshot = job.snapshot ?? (current ? this.latest : null);
    if (!snapshot) return;
    const revision = current ? this.revision : 0;

    const stateJson = JSON.stringify(snapshot.state);
    const canvasStateSize = byteSize(stateJson);
    if (canvasStateSize > MAX_CANVAS_STATE_SIZE) {
      this.fail(job, "Annotation data is too large. Try simplifying some shapes.");
      return;
    }
    if (current) {
      this.events.onSizeWarning(
        canvasStateSize > WARN_CANVAS_STATE_SIZE
          ? "Annotation file is getting large. Consider simplifying some shapes."
          : null,
      );
      this.events.onStatus(job.attempts > 0 ? "retrying" : "saving", null);
    }

    this.inFlight++;
    try {
      await this.persist(job, snapshot, canvasStateSize);
      this.succeed(job, revision, snapshot);
    } catch (error) {
      if (error instanceof ConflictError) {
        this.lastFailed = job;
        if (current) {
          this.conflicted = true;
          this.events.onStatus("conflict", CONFLICT_MESSAGE);
        }
      } else if (error instanceof FatalError) {
        this.fail(job, error.message);
      } else {
        this.retryLater(job);
      }
    } finally {
      this.inFlight--;
    }
  }

  private async persist(job: Job, snapshot: Snapshot, canvasStateSize: number): Promise<void> {
    const { target } = job;
    const payload = {
      canvasState: snapshot.state,
      canvasStateSize,
      imageAdjustments: snapshot.adjustments,
    };

    if (!target.annotationId) {
      const res = await this.fetchImpl(`/api/xrays/${target.xrayId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, createdById: this.userId }),
      });
      await this.checkResponse(res);
      const data = (await res.json()) as { annotation: { id: string; version?: number } };
      target.annotationId = data.annotation.id;
      target.version = data.annotation.version ?? 1;
      return;
    }

    const baseVersion = job.overwrite ? undefined : target.version ?? undefined;
    const res = await this.fetchImpl(`/api/annotations/${target.annotationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, baseVersion }),
    });
    await this.checkResponse(res);
    const data = (await res.json()) as { version?: number };
    if (typeof data.version === "number") target.version = data.version;
  }

  private async checkResponse(res: Response): Promise<void> {
    if (res.ok) return;
    if (res.status === 409) throw new ConflictError();
    if (res.status === 401) throw new FatalError("You've been signed out. Sign in again in another tab, then retry.");
    if (res.status === 404) throw new FatalError("This X-ray is no longer available to you.");
    if (res.status === 413) throw new FatalError("Annotation data is too large. Try simplifying some shapes.");
    throw new Error(`Save failed with status ${res.status}`);
  }

  private succeed(job: Job, revision: number, sent: Snapshot): void {
    if (!this.isCurrent(job)) return;
    // Only count the edit as saved if what we sent is still the latest state —
    // an edit can bump the revision a moment before its state reaches update().
    if (this.latest === sent) this.savedRevision = Math.max(this.savedRevision, revision);
    this.events.onSaved(new Date());
    this.events.onStatus("saved", null);
    if (this.isDirty) {
      // Edits arrived while this save was in flight — save again.
      this.scheduleDebounce();
    } else {
      this.events.onDirty(false);
    }
  }

  private retryLater(job: Job): void {
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.fail(job, "Unable to save. Check your connection.");
      return;
    }
    if (this.isCurrent(job)) {
      this.events.onStatus("retrying", `Save failed — retrying... (${attempts}/${MAX_ATTEMPTS})`);
    }
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.enqueue({ ...job, attempts });
    }, 2 ** attempts * 1000);
  }

  private fail(job: Job, message: string): void {
    this.lastFailed = job;
    this.events.onStatus(
      "failed",
      this.isCurrent(job) ? message : `Changes to the previous X-ray were not saved. ${message}`,
    );
  }

  private scheduleDebounce(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

function byteSize(json: string): number {
  return new TextEncoder().encode(json).length;
}

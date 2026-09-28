"use client";

import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export interface ModelProgress {
  loaded: number;
  total: number;
  done: boolean;
  failed: boolean;
}

type ProgressSnapshot = Readonly<Record<string, ModelProgress>>;

const models = new Map<string, Promise<GLTF | null>>();
const listeners = new Set<() => void>();
let snapshot: ProgressSnapshot = {};

function update(url: string, patch: Partial<ModelProgress>) {
  const prev = snapshot[url] ?? { loaded: 0, total: 0, done: false, failed: false };
  snapshot = { ...snapshot, [url]: { ...prev, ...patch } };
  for (const listener of listeners) listener();
}

/**
 * Loads (once) and caches a meshopt-compressed GLB, publishing byte-level
 * progress. Resolves to null on failure so a suspended tree never throws —
 * the overlay reads `failed` from the progress store and offers a reload.
 */
export function loadModel(url: string): Promise<GLTF | null> {
  let promise = models.get(url);
  if (!promise) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    // No synchronous store update here: this runs during render.
    promise = loader
      .loadAsync(url, (event) => update(url, { loaded: event.loaded, total: event.total }))
      .then((gltf) => {
        update(url, { done: true });
        return gltf;
      })
      .catch(() => {
        update(url, { done: true, failed: true });
        return null;
      });
    models.set(url, promise);
  }
  return promise;
}

export function subscribeModelProgress(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getModelProgress(): ProgressSnapshot {
  return snapshot;
}

const EMPTY: ProgressSnapshot = {};
export function getServerModelProgress(): ProgressSnapshot {
  return EMPTY;
}

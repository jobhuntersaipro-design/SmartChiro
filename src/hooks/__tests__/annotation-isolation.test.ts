import { describe, it, expect } from "vitest";
import type { BaseShape } from "@/types/annotation";

/**
 * Tests for per-xray annotation isolation logic.
 *
 * The core data structure is a Map<string, { shapes: BaseShape[], annotationId: string | null }>
 * that stores shapes per xray ID. These tests verify the save/load/switch logic
 * used in AnnotationCanvas for multi-view mode.
 */

function createTestShape(id: string, label: string): BaseShape {
  return {
    id,
    type: "line",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    label,
    zIndex: 0,
    visible: true,
    locked: false,
    style: {
      strokeColor: "#FF0000",
      strokeWidth: 2,
      fillColor: null,
      opacity: 1,
    },
  };
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

interface XrayCache {
  shapes: BaseShape[];
  annotationId: string | null;
  viewportState?: ViewportState;
}

type ShapeCache = Map<string, XrayCache>;

/**
 * Simulates the slot-switch logic from AnnotationCanvas:
 * 1. Save current shapes + viewport for the previous xray
 * 2. Load shapes + viewport for the new xray (from cache or empty)
 */
function switchActiveXray(
  cache: ShapeCache,
  prevXrayId: string | null,
  prevShapes: BaseShape[],
  prevAnnotationId: string | null,
  newXrayId: string,
  prevViewportState?: ViewportState
): { shapes: BaseShape[]; annotationId: string | null; viewportState?: ViewportState } {
  // Save current shapes + viewport for previous xray
  if (prevXrayId) {
    cache.set(prevXrayId, {
      shapes: [...prevShapes],
      annotationId: prevAnnotationId,
      viewportState: prevViewportState,
    });
  }

  // Load shapes + viewport for new xray
  const cached = cache.get(newXrayId);
  if (cached) {
    return { shapes: cached.shapes, annotationId: cached.annotationId, viewportState: cached.viewportState };
  }

  // Not cached yet — return empty (API fetch would happen async)
  return { shapes: [], annotationId: null };
}

describe("Per-xray annotation isolation", () => {
  it("initializes cache with the primary xray's shapes", () => {
    const cache: ShapeCache = new Map();
    const shape1 = createTestShape("s1", "Shape on xray-A");
    cache.set("xray-A", { shapes: [shape1], annotationId: "ann-1" });

    expect(cache.get("xray-A")!.shapes).toHaveLength(1);
    expect(cache.get("xray-A")!.shapes[0].label).toBe("Shape on xray-A");
    expect(cache.get("xray-A")!.annotationId).toBe("ann-1");
  });

  it("saves current shapes when switching to a different xray", () => {
    const cache: ShapeCache = new Map();
    const shapeA = createTestShape("s1", "Shape on A");

    // Switch from xray-A to xray-B
    const result = switchActiveXray(cache, "xray-A", [shapeA], "ann-1", "xray-B");

    // xray-A shapes should be cached
    expect(cache.get("xray-A")!.shapes).toHaveLength(1);
    expect(cache.get("xray-A")!.shapes[0].label).toBe("Shape on A");

    // xray-B has no cached shapes yet
    expect(result.shapes).toHaveLength(0);
    expect(result.annotationId).toBeNull();
  });

  it("loads cached shapes when switching back to a previously visited xray", () => {
    const cache: ShapeCache = new Map();
    const shapeA = createTestShape("s1", "Shape on A");
    const shapeB = createTestShape("s2", "Shape on B");

    // Start on xray-A, switch to xray-B
    switchActiveXray(cache, "xray-A", [shapeA], "ann-1", "xray-B");

    // Add shapes for xray-B in cache (simulating drawing on B)
    cache.set("xray-B", { shapes: [shapeB], annotationId: "ann-2" });

    // Switch back to xray-A
    const result = switchActiveXray(cache, "xray-B", [shapeB], "ann-2", "xray-A");

    expect(result.shapes).toHaveLength(1);
    expect(result.shapes[0].label).toBe("Shape on A");
    expect(result.annotationId).toBe("ann-1");
  });

  it("keeps shapes isolated between different xrays", () => {
    const cache: ShapeCache = new Map();
    const shapeA1 = createTestShape("s1", "A-shape-1");
    const shapeA2 = createTestShape("s2", "A-shape-2");
    const shapeB1 = createTestShape("s3", "B-shape-1");

    cache.set("xray-A", { shapes: [shapeA1, shapeA2], annotationId: "ann-1" });
    cache.set("xray-B", { shapes: [shapeB1], annotationId: "ann-2" });

    // Loading xray-A should NOT include xray-B shapes
    const resultA = cache.get("xray-A")!;
    expect(resultA.shapes.every((s) => s.label!.startsWith("A-"))).toBe(true);

    // Loading xray-B should NOT include xray-A shapes
    const resultB = cache.get("xray-B")!;
    expect(resultB.shapes.every((s) => s.label!.startsWith("B-"))).toBe(true);
  });

  it("does not lose shapes when switching between 3+ xrays", () => {
    const cache: ShapeCache = new Map();
    const shapeA = createTestShape("s1", "A");
    const shapeB = createTestShape("s2", "B");
    const shapeC = createTestShape("s3", "C");

    // A → B
    switchActiveXray(cache, "xray-A", [shapeA], "ann-1", "xray-B");
    cache.set("xray-B", { shapes: [shapeB], annotationId: "ann-2" });

    // B → C
    switchActiveXray(cache, "xray-B", [shapeB], "ann-2", "xray-C");
    cache.set("xray-C", { shapes: [shapeC], annotationId: "ann-3" });

    // C → A
    const resultA = switchActiveXray(cache, "xray-C", [shapeC], "ann-3", "xray-A");

    expect(resultA.shapes).toHaveLength(1);
    expect(resultA.shapes[0].label).toBe("A");

    // Verify all 3 are in cache
    expect(cache.get("xray-A")!.shapes[0].label).toBe("A");
    expect(cache.get("xray-B")!.shapes[0].label).toBe("B");
    expect(cache.get("xray-C")!.shapes[0].label).toBe("C");
  });

  it("handles switching when previous slot has no xray (null)", () => {
    const cache: ShapeCache = new Map();
    const shapeB = createTestShape("s1", "B");
    cache.set("xray-B", { shapes: [shapeB], annotationId: "ann-2" });

    // Switch from null to xray-B (first load into an empty slot)
    const result = switchActiveXray(cache, null, [], null, "xray-B");

    expect(result.shapes).toHaveLength(1);
    expect(result.shapes[0].label).toBe("B");
  });

  it("preserves annotationId through multiple switches", () => {
    const cache: ShapeCache = new Map();

    // xray-A has an existing annotation
    cache.set("xray-A", { shapes: [], annotationId: "ann-existing" });

    // Switch from new xray (no annotation) to xray-A
    const result = switchActiveXray(cache, "xray-new", [], null, "xray-A");

    expect(result.annotationId).toBe("ann-existing");
  });

  it("returns empty shapes and null annotationId for uncached xray", () => {
    const cache: ShapeCache = new Map();

    const result = switchActiveXray(cache, "xray-A", [], null, "xray-never-seen");

    expect(result.shapes).toHaveLength(0);
    expect(result.annotationId).toBeNull();
  });
});

describe("Per-xray viewport state persistence", () => {
  it("saves and restores viewport state (zoom/pan) when switching xrays", () => {
    const cache: ShapeCache = new Map();
    const zoomedIn: ViewportState = { zoom: 1.2, panX: 50, panY: -30 };

    // Switch from xray-A (zoomed to 120%) to xray-B
    switchActiveXray(cache, "xray-A", [], "ann-1", "xray-B", zoomedIn);

    // xray-A should have viewport state cached
    expect(cache.get("xray-A")!.viewportState).toEqual(zoomedIn);
  });

  it("returns cached viewport state when switching back", () => {
    const cache: ShapeCache = new Map();
    const zoomA: ViewportState = { zoom: 1.2, panX: 50, panY: -30 };
    const zoomB: ViewportState = { zoom: 0.5, panX: 0, panY: 0 };

    // A (120%) → B
    switchActiveXray(cache, "xray-A", [], "ann-1", "xray-B", zoomA);
    // B (50%) → A
    const result = switchActiveXray(cache, "xray-B", [], "ann-2", "xray-A", zoomB);

    expect(result.viewportState).toEqual(zoomA);
    expect(cache.get("xray-B")!.viewportState).toEqual(zoomB);
  });

  it("returns undefined viewport state for uncached xray", () => {
    const cache: ShapeCache = new Map();

    const result = switchActiveXray(cache, "xray-A", [], null, "xray-new", { zoom: 1, panX: 0, panY: 0 });

    expect(result.viewportState).toBeUndefined();
  });

  it("preserves viewport state through 3+ switches", () => {
    const cache: ShapeCache = new Map();
    const zoomA: ViewportState = { zoom: 1.5, panX: 100, panY: 200 };
    const zoomB: ViewportState = { zoom: 0.8, panX: -50, panY: 10 };
    const zoomC: ViewportState = { zoom: 2.0, panX: 0, panY: 0 };

    // A → B → C → A
    switchActiveXray(cache, "xray-A", [], "ann-1", "xray-B", zoomA);
    switchActiveXray(cache, "xray-B", [], "ann-2", "xray-C", zoomB);
    const result = switchActiveXray(cache, "xray-C", [], "ann-3", "xray-A", zoomC);

    expect(result.viewportState).toEqual(zoomA);
    expect(cache.get("xray-B")!.viewportState).toEqual(zoomB);
    expect(cache.get("xray-C")!.viewportState).toEqual(zoomC);
  });
});

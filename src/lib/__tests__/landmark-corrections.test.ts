import { describe, it, expect } from "vitest";
import { extractLandmarkCorrections } from "../landmark-corrections";
import type { BaseShape } from "@/types/annotation";

// Minimal shape builder — pure dummy data, only the fields the helper reads.
function landmark(overrides: Partial<BaseShape>): BaseShape {
  return {
    id: overrides.id ?? "shape-1",
    type: "landmark",
    label: null,
    zIndex: 1,
    visible: true,
    locked: false,
    style: {
      strokeColor: "#22D3EE",
      strokeWidth: 2,
      strokeOpacity: 1,
      fillColor: null,
      fillOpacity: 0.3,
      lineDash: [],
    },
    x: 100,
    y: 200,
    width: 0,
    height: 0,
    rotation: 0,
    points: [{ x: 100, y: 200 }],
    text: null,
    fontSize: null,
    measurement: null,
    landmarkName: "top_of_femoral_head_1",
    landmarkSource: "manual",
    landmarkOriginalX: 95,
    landmarkOriginalY: 190,
    ...overrides,
  } as BaseShape;
}

describe("extractLandmarkCorrections", () => {
  it("emits one row per manually-adjusted AI landmark with both AI and final coords", () => {
    const rows = extractLandmarkCorrections([
      landmark({
        id: "l1",
        landmarkName: "top_of_femoral_head_1",
        landmarkOriginalX: 95,
        landmarkOriginalY: 190,
        points: [{ x: 102, y: 205 }],
        label: "Femoral head 1",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      landmarkName: "top_of_femoral_head_1",
      displayName: "Femoral head 1",
      aiX: 95,
      aiY: 190,
      finalX: 102,
      finalY: 205,
    });
  });

  it("skips landmarks the user has not yet reviewed (source still 'ai')", () => {
    const rows = extractLandmarkCorrections([
      landmark({ landmarkSource: "ai" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("skips landmarks without an AI original (pure manual placement)", () => {
    const rows = extractLandmarkCorrections([
      landmark({ landmarkOriginalX: undefined, landmarkOriginalY: undefined }),
    ]);
    expect(rows).toEqual([]);
  });

  it("skips zero-delta corrections (user dragged back to AI position)", () => {
    const rows = extractLandmarkCorrections([
      landmark({
        landmarkOriginalX: 100,
        landmarkOriginalY: 200,
        points: [{ x: 100, y: 200 }],
      }),
    ]);
    expect(rows).toEqual([]);
  });

  it("falls back to landmarkName when label is missing", () => {
    const rows = extractLandmarkCorrections([
      landmark({
        label: null,
        landmarkName: "second_sacral_tubercle",
      }),
    ]);
    expect(rows[0].displayName).toBe("second_sacral_tubercle");
  });

  it("ignores non-landmark shapes", () => {
    const polyline = { ...landmark({}), type: "polyline" as const, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    const rows = extractLandmarkCorrections([polyline]);
    expect(rows).toEqual([]);
  });

  it("ignores landmarks with no points or invalid coordinates", () => {
    const rows = extractLandmarkCorrections([
      landmark({ id: "no-pts", points: [] }),
      landmark({ id: "nan", points: [{ x: Number.NaN, y: 0 }] }),
      landmark({ id: "inf-orig", landmarkOriginalX: Number.POSITIVE_INFINITY }),
    ]);
    expect(rows).toEqual([]);
  });

  it("de-dupes by landmark name within a single save (first wins)", () => {
    const rows = extractLandmarkCorrections([
      landmark({
        id: "a",
        landmarkName: "top_of_femoral_head_1",
        points: [{ x: 101, y: 200 }],
      }),
      landmark({
        id: "b",
        landmarkName: "top_of_femoral_head_1",
        points: [{ x: 999, y: 999 }],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].finalX).toBe(101);
  });

  it("emits one row per unique landmark name across many shapes", () => {
    const rows = extractLandmarkCorrections([
      landmark({
        id: "fh1",
        landmarkName: "top_of_femoral_head_1",
        points: [{ x: 102, y: 205 }],
      }),
      landmark({
        id: "fh2",
        landmarkName: "top_of_femoral_head_2",
        points: [{ x: 502, y: 205 }],
      }),
      landmark({
        id: "s2",
        landmarkName: "second_sacral_tubercle",
        landmarkOriginalX: 300,
        landmarkOriginalY: 400,
        points: [{ x: 305, y: 410 }],
      }),
    ]);
    expect(rows.map((r) => r.landmarkName).sort()).toEqual([
      "second_sacral_tubercle",
      "top_of_femoral_head_1",
      "top_of_femoral_head_2",
    ]);
  });
});

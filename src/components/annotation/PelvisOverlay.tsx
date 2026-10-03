"use client";

import { memo, useMemo } from "react";
import { DEFAULT_SHAPE_STYLE, type BaseShape } from "@/types/annotation";
import type { DetectLandmarksResponse } from "@/types/pelvis";
import { orientPoint, type Orientation } from "@/lib/orientation";
import {
  computePelvicAnalysis,
  formatLength,
  landmarkPoints,
  patientRightOnScreen,
  pelvicOverlay,
  type LandmarkPoints,
  type OverlaySegment,
  type ParamStatus,
  type Pt,
} from "@/lib/pelvic-analysis";
import { landmarkById, landmarkByKey, landmarkLabel, patientSideOf } from "@/lib/pelvic-landmarks";

/** Visible landmark shapes that have a point. */
export function pelvicLandmarkShapes(shapes: readonly BaseShape[]): BaseShape[] {
  return shapes.filter((s) => s.type === "landmark" && s.visible && s.points.length >= 1);
}

/**
 * Landmark positions keyed by paper number, from landmark shapes. With the
 * view's `orientation` they are placed on the displayed film, the frame the
 * analysis measures in.
 */
export function pelvicPointsOf(landmarks: readonly BaseShape[], orientation?: Orientation): LandmarkPoints {
  return landmarkPoints(
    landmarks.map((s) => {
      const p = orientation ? orientPoint(s.points[0], orientation) : s.points[0];
      return { name: s.landmarkName, x: p.x, y: p.y };
    }),
  );
}

/** Whether the AI took R/L from the film's side marker; null when no landmark says. */
export function landmarkSideSourceOf(landmarks: readonly BaseShape[]): "marker" | "assumed" | null {
  return landmarks.find((s) => s.landmarkSideSource)?.landmarkSideSource ?? null;
}

/**
 * The panel's side note: where the patient's right is on screen (from the
 * displayed landmarks) and whether the AI read it off the film's R/L marker.
 */
export function patientSideNote(landmarks: readonly BaseShape[], orientation?: Orientation): string {
  const screen = patientRightOnScreen(pelvicPointsOf(landmarks, orientation), patientRightOnOf(landmarks));
  const source = landmarkSideSourceOf(landmarks);
  const parts = [
    screen ? `patient's right on the ${screen} of the screen` : null,
    source === "marker" ? "from the R/L marker" : source === "assumed" ? "assumed (no side marker found)" : null,
  ].filter(Boolean);
  return parts.length > 0 ? `R/L are patient sides: ${parts.join(", ")}.` : "R/L are patient sides.";
}

export interface LandmarkMerge {
  /** Landmarks already on the film, moved to the new positions (same ids). */
  modified: { before: BaseShape; after: BaseShape }[];
  added: BaseShape[];
  /** Other landmark shapes: keys not returned, duplicates, older names. */
  removed: BaseShape[];
}

/**
 * An AI run applied to the film's shapes. A key already on the film keeps
 * its shape (and id), moved to the new position, so measurements snapped to
 * it keep following; new keys are added; every other landmark is removed.
 */
export function mergeDetectedLandmarks(
  current: readonly BaseShape[],
  data: Pick<DetectLandmarksResponse, "landmarks" | "patientRightOn" | "sideSource">,
  stamp: number,
): LandmarkMerge {
  const byKey = new Map<string, BaseShape>();
  for (const s of current) {
    if (s.type !== "landmark" || !s.landmarkName || !landmarkByKey(s.landmarkName)) continue;
    if (!byKey.has(s.landmarkName)) byKey.set(s.landmarkName, s);
  }
  const baseZ = current.length === 0 ? 1 : Math.max(...current.map((s) => s.zIndex)) + 1;
  const modified: LandmarkMerge["modified"] = [];
  const added: BaseShape[] = [];
  data.landmarks.forEach((lm, i) => {
    const def = landmarkByKey(lm.key) ?? landmarkById(lm.id);
    if (!def) return;
    const side = patientSideOf(def.imageSide, data.patientRightOn);
    const placed = {
      label: landmarkLabel(def, side),
      x: lm.x,
      y: lm.y,
      width: 0,
      height: 0,
      points: [{ x: lm.x, y: lm.y }],
      landmarkName: def.key,
      landmarkSource: "ai" as const,
      landmarkOriginalX: lm.x,
      landmarkOriginalY: lm.y,
      landmarkSide: side ?? undefined,
      landmarkSideSource: data.sideSource,
      landmarkConfidence: lm.confidence,
    };
    const before = byKey.get(def.key);
    if (before) {
      byKey.delete(def.key);
      modified.push({ before, after: { ...before, ...placed } });
      return;
    }
    added.push({
      id: `landmark-${stamp}-${i}`,
      type: "landmark",
      zIndex: baseZ + added.length,
      visible: true,
      locked: false,
      style: { ...DEFAULT_SHAPE_STYLE, strokeColor: "#22D3EE" },
      rotation: 0,
      text: null,
      fontSize: null,
      measurement: null,
      ...placed,
    });
  });
  const kept = new Set(modified.map((m) => m.before.id));
  const removed = current.filter((s) => s.type === "landmark" && !kept.has(s.id));
  return { modified, added, removed };
}

/**
 * A pasted landmark is a plain point the user placed: without the catalog
 * key and AI metadata, only the original is measured.
 */
export function plainLandmarkCopy(shape: BaseShape): BaseShape {
  if (shape.type !== "landmark") return shape;
  return {
    ...shape,
    landmarkName: undefined,
    landmarkSide: undefined,
    landmarkSideSource: undefined,
    landmarkSource: "manual",
    landmarkOriginalX: undefined,
    landmarkOriginalY: undefined,
    landmarkConfidence: undefined,
  };
}

/**
 * Image side holding the patient's right, read back from the patient sides
 * stored on paired landmarks (an image-left landmark marked "R" ⇒ "left").
 * Defaults to the standard AP convention, image left.
 */
export function patientRightOnOf(landmarks: readonly BaseShape[]): "left" | "right" {
  for (const s of landmarks) {
    const def = s.landmarkName ? landmarkByKey(s.landmarkName) : undefined;
    if (!def || def.imageSide === "mid" || !s.landmarkSide) continue;
    if (s.landmarkSide === "R") return def.imageSide;
    return def.imageSide === "left" ? "right" : "left";
  }
  return "left";
}

const COLOR: Record<OverlaySegment["role"], string> = {
  base: "#22C55E",
  plumb: "#22C55E",
  measure: "#EF4444",
  guide: "#E5E7EB",
};

const TAG_STROKE: Partial<Record<ParamStatus, string>> = {
  normal: "#22C55E",
  outside: "#EF4444",
};

interface PelvisOverlayProps {
  /** Visible landmark shapes (see `pelvicLandmarkShapes`), in image space. */
  landmarks: BaseShape[];
  pixelsPerMm?: number;
  unit: "mm" | "px";
  zoom: number;
  /** The view's flip/rotate; landmarks are oriented first, so values and lines are the displayed film's. */
  orientation?: Orientation;
}

interface Tag {
  key: string;
  at: Pt;
  text: string;
  status: ParamStatus;
}

/**
 * The paper's Fig. 5 construction lines and values, drawn over the film:
 * femur base line and S2 plumb line in green, measured spans in red, guides
 * dashed. Lives in the annotation SVG above shapes and below landmark dots.
 */
export const PelvisOverlay = memo(function PelvisOverlay({
  landmarks,
  pixelsPerMm,
  unit,
  zoom,
  orientation,
}: PelvisOverlayProps) {
  const { segments, tags } = useMemo(() => {
    const points = pelvicPointsOf(landmarks, orientation);
    const patientRightOn = patientRightOnOf(landmarks);
    const geometry = pelvicOverlay(points);
    const { params } = computePelvicAnalysis(points, { pixelsPerMm, patientRightOn });

    const out: Tag[] = [];
    geometry.tags.forEach((tag, i) => {
      const param = params.find((p) => p.id === tag.param);
      if (!param) return;
      let text: string | null = null;
      if (param.kind === "pair" && tag.imageSide) {
        const side = patientSideOf(tag.imageSide, patientRightOn);
        const value = side === "R" ? param.right : param.left;
        if (value) text = `${param.label} ${side} ${formatLength(value, unit)}`;
      } else if (param.kind === "single" && param.value) {
        text = `${param.label} ${formatLength(param.value, unit)}`;
      }
      if (text) out.push({ key: `${tag.param}-${tag.imageSide ?? "mid"}-${i}`, at: tag.at, text, status: param.status });
    });

    return { segments: geometry.segments, tags: out };
  }, [landmarks, pixelsPerMm, unit, orientation]);

  if (segments.length === 0) return null;

  const strokeWidth = 1.5 / zoom;
  const dash = `${6 / zoom} ${4 / zoom}`;
  const font = 11 / zoom;
  const padX = 4 / zoom;

  return (
    <g pointerEvents="none">
      {segments.map((s, i) => (
        <line
          key={i}
          x1={s.a.x}
          y1={s.a.y}
          x2={s.b.x}
          y2={s.b.y}
          stroke={COLOR[s.role]}
          strokeOpacity={s.role === "guide" ? 0.5 : 1}
          strokeWidth={strokeWidth}
          strokeDasharray={s.role === "guide" ? dash : undefined}
          strokeLinecap="round"
        />
      ))}
      {tags.map((t) => {
        const width = t.text.length * font * 0.6 + padX * 2;
        const height = font * 1.45;
        return (
          <g key={t.key}>
            <rect
              x={t.at.x - width / 2}
              y={t.at.y - height / 2}
              width={width}
              height={height}
              rx={height / 2}
              ry={height / 2}
              fill="rgba(10,18,32,0.82)"
              stroke={TAG_STROKE[t.status] ?? "none"}
              strokeWidth={1 / zoom}
            />
            <text
              x={t.at.x}
              y={t.at.y}
              fontSize={font}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill="#FFFFFF"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {t.text}
            </text>
          </g>
        );
      })}
    </g>
  );
});

"use client";

import { memo, useMemo } from "react";
import type { BaseShape } from "@/types/annotation";
import { orientPoint, type Orientation } from "@/lib/orientation";
import {
  computePelvicAnalysis,
  formatLength,
  landmarkPoints,
  pelvicOverlay,
  type LandmarkPoints,
  type OverlaySegment,
  type ParamStatus,
  type Pt,
} from "@/lib/pelvic-analysis";
import { landmarkByKey, patientSideOf } from "@/lib/pelvic-landmarks";

/** Visible landmark shapes that have a point. */
export function pelvicLandmarkShapes(shapes: readonly BaseShape[]): BaseShape[] {
  return shapes.filter((s) => s.type === "landmark" && s.visible && s.points.length >= 1);
}

/** Landmark positions keyed by paper number, from landmark shapes. */
export function pelvicPointsOf(landmarks: readonly BaseShape[]): LandmarkPoints {
  return landmarkPoints(
    landmarks.map((s) => ({ name: s.landmarkName, x: s.points[0].x, y: s.points[0].y })),
  );
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
  /** The view's flip/rotate; segments are placed on the oriented film like shapes are. */
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
    const points = pelvicPointsOf(landmarks);
    const patientRightOn = patientRightOnOf(landmarks);
    const geometry = pelvicOverlay(points);
    const { params } = computePelvicAnalysis(points, { pixelsPerMm, patientRightOn });
    const place = (p: Pt) => (orientation ? orientPoint(p, orientation) : p);

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
      if (text) out.push({ key: `${tag.param}-${tag.imageSide ?? "mid"}-${i}`, at: place(tag.at), text, status: param.status });
    });

    return {
      segments: geometry.segments.map((s) => ({ ...s, a: place(s.a), b: place(s.b) })),
      tags: out,
    };
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

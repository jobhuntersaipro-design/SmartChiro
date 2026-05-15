"use client";

import type { BaseShape } from "@/types/annotation";
import { formatMeasurement, LANDMARK_LABEL_SENTINEL } from "@/lib/measurements";

// A vertex label of LANDMARK_LABEL_SENTINEL means "snap-followed a landmark
// — render no inline label." `null` to VertexMarker omits the label and
// renders just the dot. Centralized so every call site stays consistent.
function vertexLabelFor(
  vertexLabels: string[] | undefined,
  i: number,
  fallback: string,
): string | null {
  const raw = vertexLabels?.[i];
  if (raw === undefined) return fallback;
  if (raw === LANDMARK_LABEL_SENTINEL) return null;
  return raw;
}

interface ShapeRendererProps {
  shape: BaseShape;
  zoom: number;
  /**
   * Globally-unique labels for each of this shape's points (e.g. ["P1", "P2"]).
   * Populated by AnnotationCanvas using a single counter walked across all
   * point/line/polyline shapes so dot numbers are unique across the whole image.
   * Optional — when missing, renderers fall back to local 1-based indices.
   */
  vertexLabels?: string[];
  /** Whether this shape (or any of its vertices) is currently selected. */
  selected?: boolean;
  /**
   * Calibration: pixels per millimeter from the user's calibration line.
   * When set, length/area readouts convert to mm/cm/mm²/cm² instead of px/px².
   */
  pixelsPerMm?: number;
}

export function ShapeRenderer({ shape, zoom, vertexLabels, selected, pixelsPerMm }: ShapeRendererProps) {
  const sw = shape.style.strokeWidth / zoom;
  const dashArray =
    shape.style.lineDash.length > 0
      ? shape.style.lineDash.map((d) => d / zoom).join(" ")
      : undefined;

  // Adobe-style halo: a slightly thicker white stroke under the colored stroke
  // so annotations stay readable against any X-ray contrast.
  const haloWidth = sw + 2 / zoom;

  return (
    <g opacity={shape.style.strokeOpacity}>
      {/* ─── Point ─── */}
      {shape.type === "point" && shape.points.length >= 1 && (
        <PointRenderer
          shape={shape}
          zoom={zoom}
          label={vertexLabels?.[0]}
          selected={selected}
        />
      )}

      {/* ─── AI Landmark (cyan dot + label, dashed ring when AI-source) ─── */}
      {shape.type === "landmark" && shape.points.length >= 1 && (
        <LandmarkRenderer shape={shape} zoom={zoom} selected={selected} />
      )}

      {/* ─── Legacy line shape (kept for backwards-compat with old saves) ─── */}
      {shape.type === "line" && shape.points.length >= 2 && (
        <>
          <line
            x1={shape.points[0].x}
            y1={shape.points[0].y}
            x2={shape.points[1].x}
            y2={shape.points[1].y}
            stroke="#FFFFFF"
            strokeOpacity={0.85}
            strokeWidth={haloWidth}
            strokeLinecap={shape.lineCap ?? "round"}
            strokeDasharray={dashArray}
          />
          <line
            x1={shape.points[0].x}
            y1={shape.points[0].y}
            x2={shape.points[1].x}
            y2={shape.points[1].y}
            stroke={shape.style.strokeColor}
            strokeWidth={sw}
            strokeLinecap={shape.lineCap ?? "round"}
            strokeDasharray={dashArray}
          />
        </>
      )}

      {/* ─── Ruler ─── */}
      {shape.type === "ruler" && shape.points.length >= 2 && (
        <RulerRenderer
          shape={shape}
          zoom={zoom}
          sw={sw}
          pixelsPerMm={pixelsPerMm}
          vertexLabels={vertexLabels}
        />
      )}

      {/* ─── Calibration (yellow line + future mm label) ─── */}
      {shape.type === "calibration" && shape.points.length >= 2 && (
        <RulerRenderer shape={shape} zoom={zoom} sw={sw} />
      )}

      {/* ─── Angle ─── */}
      {shape.type === "angle" && shape.points.length >= 2 && (
        <AngleRenderer shape={shape} zoom={zoom} sw={sw} vertexLabels={vertexLabels} pixelsPerMm={pixelsPerMm} />
      )}

      {/* ─── Cobb Angle ─── */}
      {shape.type === "cobb_angle" && shape.points.length >= 2 && (
        <CobbAngleRenderer shape={shape} zoom={zoom} sw={sw} vertexLabels={vertexLabels} />
      )}

      {/* ─── Polyline (with numbered vertex dots, halo, and ID label) ─── */}
      {shape.type === "polyline" && shape.points.length >= 2 && (
        <PolylineRenderer
          shape={shape}
          zoom={zoom}
          sw={sw}
          haloWidth={haloWidth}
          dashArray={dashArray}
          vertexLabels={vertexLabels}
          pixelsPerMm={pixelsPerMm}
        />
      )}

      {/* ─── Arrow (drag-created, end arrowhead) ─── */}
      {shape.type === "arrow" && shape.points.length >= 2 && (
        <ArrowRenderer
          shape={shape}
          zoom={zoom}
          sw={sw}
          haloWidth={haloWidth}
          dashArray={dashArray}
        />
      )}

      {/* ─── Rectangle (legacy) ─── */}
      {shape.type === "rectangle" && (
        <RectangleRenderer shape={shape} zoom={zoom} sw={sw} dashArray={dashArray} />
      )}

      {/* ─── Ellipse (legacy) ─── */}
      {shape.type === "ellipse" && (
        <EllipseRenderer shape={shape} zoom={zoom} sw={sw} dashArray={dashArray} />
      )}

      {shape.type === "freehand" && shape.points.length >= 2 && (
        <polyline
          points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={shape.style.strokeColor}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashArray}
        />
      )}

      {shape.type === "text" && shape.text && (
        <>
          {shape.textBackground && (
            <rect
              x={shape.x - (shape.textPadding ?? 4)}
              y={shape.y - (shape.textPadding ?? 4)}
              width={shape.width + (shape.textPadding ?? 4) * 2}
              height={shape.height + (shape.textPadding ?? 4) * 2}
              fill={shape.textBackground}
              fillOpacity={0.7}
              rx={2}
              ry={2}
            />
          )}
          <text
            x={shape.x}
            y={shape.y + (shape.fontSize ?? 16)}
            fill={shape.style.strokeColor}
            fontSize={(shape.fontSize ?? 16) / zoom}
            fontFamily={shape.fontFamily ?? "Inter, system-ui, sans-serif"}
            fontWeight={shape.fontWeight ?? 400}
            fontStyle={shape.fontStyle ?? "normal"}
            textAnchor={
              shape.textAlign === "center"
                ? "middle"
                : shape.textAlign === "right"
                  ? "end"
                  : "start"
            }
          >
            {shape.text}
          </text>
        </>
      )}
    </g>
  );
}

// ─── Ruler / Calibration Reference Renderer ───

function RulerRenderer({
  shape,
  zoom,
  sw,
  pixelsPerMm,
  vertexLabels,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  pixelsPerMm?: number;
  vertexLabels?: string[];
}) {
  const p1 = shape.points[0];
  const p2 = shape.points[1];
  const tickLen = (shape.tickLength ?? 8) / zoom;

  // Perpendicular direction for end ticks
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 1;

  // Midpoint for label
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  // Label offset — above the line
  const labelOffsetY = -12 / zoom;
  const fontSize = 12 / zoom;
  const pillPadX = 6 / zoom;
  const pillPadY = 3 / zoom;
  const pillRadius = 4 / zoom;

  // Compute fresh label every render so post-calibration changes refresh
  // any existing rulers (the `measurement.label` baked in at draw time can
  // be stale once calibration changes). When calibrated, show "mm (px)" so
  // the user sees both the converted reading AND the underlying pixels.
  let label = shape.measurement?.label;
  if (shape.type === "ruler" || shape.type === "calibration") {
    const pixelLength = Math.hypot(dx, dy);
    if (pixelsPerMm && pixelsPerMm > 0) {
      const mm = formatMeasurement(pixelLength, "px", pixelsPerMm);
      const px = `${Math.round(pixelLength)} px`;
      label = `${mm} (${px})`;
    } else {
      label = `${Math.round(pixelLength)} px`;
    }
  }

  return (
    <>
      {/* Main line */}
      <line
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* End ticks */}
      {shape.showEndTicks !== false && (
        <>
          <line
            x1={p1.x - nx * tickLen / 2} y1={p1.y - ny * tickLen / 2}
            x2={p1.x + nx * tickLen / 2} y2={p1.y + ny * tickLen / 2}
            stroke={shape.style.strokeColor}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <line
            x1={p2.x - nx * tickLen / 2} y1={p2.y - ny * tickLen / 2}
            x2={p2.x + nx * tickLen / 2} y2={p2.y + ny * tickLen / 2}
            stroke={shape.style.strokeColor}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
      {/* Measurement label with pill background */}
      {label && (
        <>
          <rect
            x={mx - (label.length * fontSize * 0.32) - pillPadX}
            y={my + labelOffsetY - fontSize * 0.7 - pillPadY}
            width={label.length * fontSize * 0.64 + pillPadX * 2}
            height={fontSize + pillPadY * 2}
            rx={pillRadius}
            ry={pillRadius}
            fill="#1A1F36"
            fillOpacity={0.8}
          />
          <text
            x={mx}
            y={my + labelOffsetY}
            fill="#FFFFFF"
            fontSize={fontSize}
            fontWeight={500}
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            {label}
          </text>
        </>
      )}
      {/* Numbered vertex dots for ruler — every endpoint is a snap target */}
      {shape.type === "ruler" && shape.points.map((p, i) => (
        <VertexMarker
          key={`v${i}`}
          shapeId={shape.id}
          vertexIndex={i}
          x={p.x}
          y={p.y}
          zoom={zoom}
          color={shape.style.strokeColor}
          label={vertexLabelFor(vertexLabels, i, `${i + 1}`)}
        />
      ))}
    </>
  );
}

// ─── Angle Renderer ───

function AngleRenderer({
  shape,
  zoom,
  sw,
  vertexLabels,
  pixelsPerMm,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  vertexLabels?: string[];
  pixelsPerMm?: number;
}) {
  const points = shape.points;

  // Draw the rays
  const rayPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // If we have 3 points, draw the arc and label
  const hasFullAngle = points.length >= 3;
  const vertex = hasFullAngle ? points[1] : null;

  // Compute arc
  let arcPath = "";
  if (hasFullAngle && vertex) {
    const a = points[0];
    const c = points[2];
    const arcR = (shape.arcRadius ?? 30) / zoom;

    const angleA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
    const angleC = Math.atan2(c.y - vertex.y, c.x - vertex.x);

    const startX = vertex.x + arcR * Math.cos(angleA);
    const startY = vertex.y + arcR * Math.sin(angleA);
    const endX = vertex.x + arcR * Math.cos(angleC);
    const endY = vertex.y + arcR * Math.sin(angleC);

    // Determine sweep direction
    let diff = angleC - angleA;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
    const sweep = diff > 0 ? 1 : 0;

    arcPath = `M ${startX} ${startY} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
  }

  const fontSize = 12 / zoom;
  const pillPadX = 6 / zoom;
  const pillPadY = 3 / zoom;
  const pillRadius = 4 / zoom;

  // Build the label live so it reflects: (1) the current ray geometry after
  // vertex drags, and (2) any calibration changes since the shape was drawn.
  // Format: "45.0° · 25 mm — 38 mm" when calibrated, "45.0° · 100 px — 150 px"
  // otherwise. Falls back to the stored angle-only label if we can't compute.
  let label = shape.measurement?.label;
  if (hasFullAngle && vertex) {
    const r1 = Math.hypot(points[0].x - vertex.x, points[0].y - vertex.y);
    const r2 = Math.hypot(points[2].x - vertex.x, points[2].y - vertex.y);
    const angleLabel = shape.measurement?.label ?? "";
    const lenA = formatMeasurement(r1, "px", pixelsPerMm ?? null);
    const lenB = formatMeasurement(r2, "px", pixelsPerMm ?? null);
    label = angleLabel
      ? `${angleLabel} · ${lenA} — ${lenB}`
      : `${lenA} — ${lenB}`;
  }

  return (
    <>
      <polyline
        points={rayPoints}
        fill="none"
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arc */}
      {arcPath && (
        <path
          d={arcPath}
          fill="none"
          stroke={shape.style.strokeColor}
          strokeWidth={sw * 0.75}
        />
      )}
      {/* Numbered vertex dots — every angle vertex is a snap target with a P# label */}
      {points.map((p, i) => (
        <VertexMarker
          key={`v${i}`}
          shapeId={shape.id}
          vertexIndex={i}
          x={p.x}
          y={p.y}
          zoom={zoom}
          color={shape.style.strokeColor}
          label={vertexLabelFor(vertexLabels, i, `${i + 1}`)}
        />
      ))}
      {/* Label */}
      {label && vertex && (
        <>
          <rect
            x={vertex.x + 16 / zoom - pillPadX}
            y={vertex.y - 12 / zoom - fontSize * 0.7 - pillPadY}
            width={label.length * fontSize * 0.64 + pillPadX * 2}
            height={fontSize + pillPadY * 2}
            rx={pillRadius} ry={pillRadius}
            fill="#1A1F36" fillOpacity={0.8}
          />
          <text
            x={vertex.x + 16 / zoom + (label.length * fontSize * 0.32)}
            y={vertex.y - 12 / zoom}
            fill="#FFFFFF"
            fontSize={fontSize}
            fontWeight={500}
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            {label}
          </text>
        </>
      )}
    </>
  );
}

// ─── Cobb Angle Renderer ───

function CobbAngleRenderer({ shape, zoom, sw, vertexLabels }: { shape: BaseShape; zoom: number; sw: number; vertexLabels?: string[] }) {
  const points = shape.points;
  const hasFull = points.length >= 4;

  const fontSize = 12 / zoom;
  const pillPadX = 6 / zoom;
  const pillPadY = 3 / zoom;
  const pillRadius = 4 / zoom;

  return (
    <>
      {/* Line 1: first 2 points */}
      {points.length >= 2 && (
        <line
          x1={points[0].x} y1={points[0].y}
          x2={points[1].x} y2={points[1].y}
          stroke={shape.style.strokeColor}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {/* Line 2: points 2-3 */}
      {points.length >= 4 && (
        <line
          x1={points[2].x} y1={points[2].y}
          x2={points[3].x} y2={points[3].y}
          stroke={shape.style.strokeColor}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {/* Perpendicular construction lines */}
      {hasFull && shape.showPerpendiculars !== false && shape.perpendicular1 && shape.perpendicular2 && (
        <>
          <line
            x1={shape.perpendicular1[0]} y1={shape.perpendicular1[1]}
            x2={shape.perpendicular1[2]} y2={shape.perpendicular1[3]}
            stroke={shape.style.strokeColor}
            strokeWidth={sw * 0.75}
            strokeOpacity={0.6}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          />
          <line
            x1={shape.perpendicular2[0]} y1={shape.perpendicular2[1]}
            x2={shape.perpendicular2[2]} y2={shape.perpendicular2[3]}
            stroke={shape.style.strokeColor}
            strokeWidth={sw * 0.75}
            strokeOpacity={0.6}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
          />
        </>
      )}
      {/* Intersection point */}
      {hasFull && shape.intersection && (
        <circle
          cx={shape.intersection[0]}
          cy={shape.intersection[1]}
          r={4 / zoom}
          fill="none"
          stroke={shape.style.strokeColor}
          strokeWidth={sw * 0.75}
        />
      )}
      {/* Angle arc at intersection */}
      {hasFull && shape.intersection && shape.perpendicular1 && shape.perpendicular2 && (
        <CobbArc
          intersection={shape.intersection}
          perp1={shape.perpendicular1}
          perp2={shape.perpendicular2}
          zoom={zoom}
          color={shape.style.strokeColor}
          sw={sw}
        />
      )}
      {/* Label */}
      {hasFull && shape.measurement && shape.intersection && (
        <>
          <rect
            x={shape.intersection[0] + 12 / zoom - pillPadX}
            y={shape.intersection[1] - 8 / zoom - fontSize * 0.7 - pillPadY}
            width={shape.measurement.label.length * fontSize * 0.42 + pillPadX * 2}
            height={fontSize + pillPadY * 2}
            rx={pillRadius} ry={pillRadius}
            fill="#1A1F36" fillOpacity={0.8}
          />
          <text
            x={shape.intersection[0] + 12 / zoom + (shape.measurement.label.length * fontSize * 0.21)}
            y={shape.intersection[1] - 8 / zoom}
            fill="#FFFFFF"
            fontSize={fontSize}
            fontWeight={500}
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
          >
            {shape.measurement.label}
          </text>
        </>
      )}
      {/* Numbered vertex dots — every cobb endpoint is a snap target with a P# label */}
      {points.map((p, i) => (
        <VertexMarker
          key={`v${i}`}
          shapeId={shape.id}
          vertexIndex={i}
          x={p.x}
          y={p.y}
          zoom={zoom}
          color={shape.style.strokeColor}
          label={vertexLabelFor(vertexLabels, i, `${i + 1}`)}
        />
      ))}
    </>
  );
}

// ─── Cobb Arc Helper ───

function CobbArc({
  intersection,
  perp1,
  perp2,
  zoom,
  color,
  sw,
}: {
  intersection: [number, number];
  perp1: [number, number, number, number];
  perp2: [number, number, number, number];
  zoom: number;
  color: string;
  sw: number;
}) {
  const ix = intersection[0];
  const iy = intersection[1];
  const arcR = 20 / zoom;

  // Direction from intersection back to midpoints
  const angle1 = Math.atan2(perp1[1] - iy, perp1[0] - ix);
  const angle2 = Math.atan2(perp2[1] - iy, perp2[0] - ix);

  const startX = ix + arcR * Math.cos(angle1);
  const startY = iy + arcR * Math.sin(angle1);
  const endX = ix + arcR * Math.cos(angle2);
  const endY = iy + arcR * Math.sin(angle2);

  let diff = angle2 - angle1;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
  const sweep = diff > 0 ? 1 : 0;

  const d = `M ${startX} ${startY} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${endX} ${endY}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={sw * 0.75}
    />
  );
}

// ─── Rectangle Renderer ───

function RectangleRenderer({
  shape,
  zoom,
  sw,
  dashArray,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  dashArray?: string;
}) {
  const fontSize = 12 / zoom;
  const pillPadX = 6 / zoom;
  const pillPadY = 3 / zoom;
  const pillRadius = 4 / zoom;
  const labelOffsetY = -8 / zoom;

  const label = shape.measurement?.label;
  const idLabel = shape.measurementId ? `${shape.measurementId}  ` : "";
  const fullLabel = label ? `${idLabel}${label}` : idLabel.trim();

  return (
    <>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={(shape.cornerRadius ?? 0) / zoom}
        ry={(shape.cornerRadius ?? 0) / zoom}
        fill={shape.style.fillColor ?? "none"}
        fillOpacity={shape.style.fillOpacity}
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeDasharray={dashArray}
      />
      {fullLabel && (
        <MeasurementLabel
          text={fullLabel}
          x={shape.x + shape.width / 2}
          y={shape.y + labelOffsetY}
          color={shape.style.strokeColor}
          fontSize={fontSize}
          padX={pillPadX}
          padY={pillPadY}
          radius={pillRadius}
        />
      )}
    </>
  );
}

// ─── Ellipse Renderer ───

function EllipseRenderer({
  shape,
  zoom,
  sw,
  dashArray,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  dashArray?: string;
}) {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const rx = shape.width / 2;
  const ry = shape.height / 2;

  const fontSize = 12 / zoom;
  const pillPadX = 6 / zoom;
  const pillPadY = 3 / zoom;
  const pillRadius = 4 / zoom;
  const labelOffsetY = -8 / zoom;

  const label = shape.measurement?.label;
  const idLabel = shape.measurementId ? `${shape.measurementId}  ` : "";
  const fullLabel = label ? `${idLabel}${label}` : idLabel.trim();

  return (
    <>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={shape.style.fillColor ?? "none"}
        fillOpacity={shape.style.fillOpacity}
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeDasharray={dashArray}
      />
      {fullLabel && (
        <MeasurementLabel
          text={fullLabel}
          x={cx}
          y={shape.y + labelOffsetY}
          color={shape.style.strokeColor}
          fontSize={fontSize}
          padX={pillPadX}
          padY={pillPadY}
          radius={pillRadius}
        />
      )}
    </>
  );
}

// ─── Shared label pill (used by rect/ellipse area readouts) ───

function MeasurementLabel({
  text,
  x,
  y,
  color,
  fontSize,
  padX,
  padY,
  radius,
}: {
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  padX: number;
  padY: number;
  radius: number;
}) {
  const charWidth = fontSize * 0.55;
  const textWidth = text.length * charWidth;
  return (
    <g>
      <rect
        x={x - textWidth / 2 - padX}
        y={y - fontSize - padY}
        width={textWidth + padX * 2}
        height={fontSize + padY * 2}
        rx={radius}
        ry={radius}
        fill="#0a1220"
        fillOpacity={0.85}
        stroke={color}
        strokeWidth={Math.max(1 / 8, fontSize / 24)}
        strokeOpacity={0.6}
      />
      <text
        x={x}
        y={y - padY}
        fill="#FFFFFF"
        fontSize={fontSize}
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={500}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

// ─── Polyline Renderer (white halo + colored stroke + numbered dots + label) ───

function PolylineRenderer({
  shape,
  zoom,
  sw,
  haloWidth,
  dashArray,
  vertexLabels,
  pixelsPerMm,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  haloWidth: number;
  dashArray?: string;
  vertexLabels?: string[];
  pixelsPerMm?: number;
}) {
  const pointsAttr = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
  const fontSize = 12 / zoom;
  const padX = 6 / zoom;
  const padY = 3 / zoom;
  const labelRadius = 4 / zoom;

  let totalLen = 0;
  for (let i = 1; i < shape.points.length; i++) {
    totalLen += Math.hypot(
      shape.points[i].x - shape.points[i - 1].x,
      shape.points[i].y - shape.points[i - 1].y,
    );
  }
  const idLabel = shape.measurementId ?? "";
  const lengthLabel = formatMeasurement(totalLen, "px", pixelsPerMm ?? null);
  const labelText = idLabel ? `${idLabel}  ${lengthLabel}` : lengthLabel;
  const first = shape.points[0];

  return (
    <>
      {/* Halo */}
      <polyline
        points={pointsAttr}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.85}
        strokeWidth={haloWidth}
        strokeLinecap={shape.lineCap ?? "round"}
        strokeLinejoin="round"
        strokeDasharray={dashArray}
      />
      {/* Foreground colored stroke */}
      <polyline
        points={pointsAttr}
        fill="none"
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeLinecap={shape.lineCap ?? "round"}
        strokeLinejoin="round"
        strokeDasharray={dashArray}
      />
      {/* Numbered vertex dots — hollow ring + center dot, screen-space sized */}
      {shape.points.map((p, i) => (
        <VertexMarker
          key={i}
          shapeId={shape.id}
          vertexIndex={i}
          x={p.x}
          y={p.y}
          zoom={zoom}
          color={shape.style.strokeColor}
          label={vertexLabelFor(vertexLabels, i, `${i + 1}`)}
        />
      ))}
      {/* Total length / ID label above first vertex */}
      {first && (
        <MeasurementLabel
          text={labelText}
          x={first.x}
          y={first.y - 18 / zoom}
          color={shape.style.strokeColor}
          fontSize={fontSize}
          padX={padX}
          padY={padY}
          radius={labelRadius}
        />
      )}
    </>
  );
}

// ─── Point Renderer (single landmark dot, screen-space sized) ───
//
// Three layers, drawn back-to-front:
//   1. Outer 16px transparent halo (catches hover events; visible on selection)
//   2. Hollow 8px-diameter ring (2px stroke, no fill — see-through to anatomy)
//   3. 1.5px solid center dot (the actual measurement point)
// All sizes are scaled by 1/zoom so the marker stays constant on screen.
function PointRenderer({
  shape,
  zoom,
  label,
  selected,
}: {
  shape: BaseShape;
  zoom: number;
  label?: string;
  selected?: boolean;
}) {
  const p = shape.points[0];
  if (!p) return null;
  const color = selected ? "#FBBF24" : shape.style.strokeColor;
  // User-renamed label wins over the auto P# — gives users a way to label
  // a point as "tilt origin" or similar from the Layers tab.
  const labelText = shape.label ?? label ?? shape.measurementId ?? "P";

  // Uniform label-inside-dot — same VertexMarker the polyline/line dots use,
  // so every dot on the canvas reads identically.
  return (
    <VertexMarker
      shapeId={shape.id}
      vertexIndex={0}
      x={p.x}
      y={p.y}
      zoom={zoom}
      color={color}
      label={labelText}
    />
  );
}

// ─── Landmark Renderer (AI-detected anatomical points) ───
//
// Visual identity uses traffic-light colors so the review state is obvious at
// a glance:
//   - RED solid ring  → source = "ai" (placed by the model, not yet reviewed)
//   - GREEN solid ring → source = "manual" (user has dragged / accepted)
//   - Amber ring        → currently selected (overrides both)
// Label sits off to the right of the dot showing the displayName, which is
// much more useful than a 1-character index for anatomical features.
function LandmarkRenderer({
  shape,
  zoom,
  selected,
}: {
  shape: BaseShape;
  zoom: number;
  selected?: boolean;
}) {
  const p = shape.points[0];
  if (!p) return null;
  const ringRadius = 7 / zoom;
  const ringWidth = 1.75 / zoom;
  const dotRadius = 2 / zoom;
  const labelFont = 11 / zoom;
  const labelOffset = (ringRadius + 4) / 1;
  const isAi = shape.landmarkSource !== "manual";
  const ringColor = selected
    ? "#FBBF24" // amber selection override
    : isAi
      ? "#EF4444" // red — unreviewed AI placement
      : "#10B981"; // green — user-reviewed / manual
  const label = shape.label ?? shape.landmarkName ?? "";

  return (
    <g>
      {/* Halo for contrast on bright X-rays */}
      <circle
        cx={p.x}
        cy={p.y}
        r={ringRadius}
        stroke="#FFFFFF"
        strokeOpacity={0.85}
        strokeWidth={ringWidth + 1.5 / zoom}
        fill="none"
      />
      {/* Solid status ring (red = AI, green = manual, amber = selected) */}
      <circle
        cx={p.x}
        cy={p.y}
        r={ringRadius}
        stroke={ringColor}
        strokeWidth={ringWidth}
        fill="none"
      />
      {/* Center dot */}
      <circle cx={p.x} cy={p.y} r={dotRadius} fill={ringColor} />

      {/* Label off to the right with a backdrop pill so it stays readable */}
      {label && (
        <g pointerEvents="none">
          <rect
            x={p.x + labelOffset}
            y={p.y - labelFont * 0.65}
            width={Math.max(label.length, 1) * labelFont * 0.55 + 6 / zoom}
            height={labelFont * 1.25}
            fill="rgba(10,18,32,0.78)"
            rx={3 / zoom}
            ry={3 / zoom}
          />
          <text
            x={p.x + labelOffset + 3 / zoom}
            y={p.y + labelFont * 0.32}
            fontSize={labelFont}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="#FFFFFF"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Arrow Renderer (drag-created with arrowhead) ───
function ArrowRenderer({
  shape,
  zoom,
  sw,
  haloWidth,
  dashArray,
}: {
  shape: BaseShape;
  zoom: number;
  sw: number;
  haloWidth: number;
  dashArray?: string;
}) {
  const [start, end] = shape.points;
  const arrowSize = (shape.arrowSize ?? 12) / zoom;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Two arrowhead wing points, 30° from the line direction
  const a = Math.PI / 6;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const w1x = end.x - arrowSize * (ux * cos + uy * sin);
  const w1y = end.y - arrowSize * (uy * cos - ux * sin);
  const w2x = end.x - arrowSize * (ux * cos - uy * sin);
  const w2y = end.y - arrowSize * (uy * cos + ux * sin);

  return (
    <>
      {/* Halo on shaft */}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="#FFFFFF"
        strokeOpacity={0.85}
        strokeWidth={haloWidth}
        strokeLinecap={shape.lineCap ?? "round"}
        strokeDasharray={dashArray}
      />
      {/* Foreground shaft */}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeLinecap={shape.lineCap ?? "round"}
        strokeDasharray={dashArray}
      />
      {/* Arrowhead halo + fill */}
      <polygon
        points={`${end.x},${end.y} ${w1x},${w1y} ${w2x},${w2y}`}
        stroke="#FFFFFF"
        strokeOpacity={0.85}
        strokeWidth={haloWidth}
        strokeLinejoin="round"
        fill="none"
      />
      <polygon
        points={`${end.x},${end.y} ${w1x},${w1y} ${w2x},${w2y}`}
        fill={shape.style.strokeColor}
        stroke={shape.style.strokeColor}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </>
  );
}

// ─── Single vertex marker (hollow ring + center dot, optional inline number) ───
//
// Used by both Point and Polyline renderers. Sizes are zoom-corrected so the
// marker stays a constant on-screen size at every zoom level.
//
// We DO NOT set pointer-events: auto here. The snap-to-vertex logic in
// useDrawingTools works in image-space coordinates and doesn't need the dot to
// receive native pointer events; making it pointer-transparent restores
// click-to-select on the underlying shape.
function VertexMarker({
  shapeId,
  vertexIndex,
  x,
  y,
  zoom,
  color,
  label,
}: {
  shapeId: string;
  vertexIndex: number;
  x: number;
  y: number;
  zoom: number;
  color: string;
  /** When provided, rendered inside the dot. Pass null to render no label (just the ring). */
  label?: string | null;
}) {
  // Sizes are zoom-corrected so the marker stays a constant on-screen size.
  // Ring is sized to comfortably hold a 3-character label like "P12".
  const ringRadius = 11 / zoom;
  const ringStroke = 2 / zoom;
  const centerRadius = 1.5 / zoom;
  const fontSize = 10 / zoom;
  return (
    <g data-vertex={`${shapeId}:${vertexIndex}`} style={{ pointerEvents: "none" }}>
      {/* Solid backing for label legibility — semi-transparent dark fill so the
          underlying anatomy is still hinted at through the ring. */}
      {label != null && (
        <circle cx={x} cy={y} r={ringRadius} fill="#0a1220" fillOpacity={0.7} />
      )}
      {/* Hollow ring */}
      <circle
        cx={x}
        cy={y}
        r={ringRadius}
        fill="none"
        stroke={color}
        strokeWidth={ringStroke}
      />
      {/* Center dot — only when there's no label (the label itself marks the center) */}
      {label == null && (
        <circle cx={x} cy={y} r={centerRadius} fill={color} />
      )}
      {/* Inline label — centered inside the ring */}
      {label != null && (
        <text
          x={x}
          y={y + fontSize / 3}
          fill="#FFFFFF"
          fontSize={fontSize}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight={600}
          textAnchor="middle"
          style={{ userSelect: "none" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

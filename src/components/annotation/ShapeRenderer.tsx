"use client";

import type { BaseShape, Point } from "@/types/annotation";

interface ShapeRendererProps {
  shape: BaseShape;
  zoom: number;
}

export function ShapeRenderer({ shape, zoom }: ShapeRendererProps) {
  const sw = shape.style.strokeWidth / zoom;
  const dashArray =
    shape.style.lineDash.length > 0
      ? shape.style.lineDash.map((d) => d / zoom).join(" ")
      : undefined;

  return (
    <g opacity={shape.style.strokeOpacity}>
      {(shape.type === "line" || shape.type === "arrow") &&
        shape.points.length >= 2 && (
          <>
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
            {shape.type === "arrow" && (
              <>
                {(shape.arrowEnd !== false) && (
                  <polygon
                    points={getArrowheadPoints(
                      shape.points[0],
                      shape.points[1],
                      (shape.arrowSize ?? 12) / zoom
                    )}
                    fill={shape.style.strokeColor}
                  />
                )}
                {shape.arrowStart && (
                  <polygon
                    points={getArrowheadPoints(
                      shape.points[1],
                      shape.points[0],
                      (shape.arrowSize ?? 12) / zoom
                    )}
                    fill={shape.style.strokeColor}
                  />
                )}
              </>
            )}
          </>
        )}

      {/* ─── Ruler ─── */}
      {shape.type === "ruler" && shape.points.length >= 2 && (
        <RulerRenderer shape={shape} zoom={zoom} sw={sw} />
      )}

      {/* ─── Angle ─── */}
      {shape.type === "angle" && shape.points.length >= 2 && (
        <AngleRenderer shape={shape} zoom={zoom} sw={sw} />
      )}

      {/* ─── Cobb Angle ─── */}
      {shape.type === "cobb_angle" && shape.points.length >= 2 && (
        <CobbAngleRenderer shape={shape} zoom={zoom} sw={sw} />
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

function RulerRenderer({ shape, zoom, sw }: { shape: BaseShape; zoom: number; sw: number }) {
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

  const label = shape.measurement?.label;

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
    </>
  );
}

// ─── Angle Renderer ───

function AngleRenderer({ shape, zoom, sw }: { shape: BaseShape; zoom: number; sw: number }) {
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
  const label = shape.measurement?.label;

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
      {/* Vertex dot */}
      {vertex && (
        <circle
          cx={vertex.x} cy={vertex.y}
          r={3 / zoom}
          fill={shape.style.strokeColor}
        />
      )}
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

function CobbAngleRenderer({ shape, zoom, sw }: { shape: BaseShape; zoom: number; sw: number }) {
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

// ─── Helpers ───

function getArrowheadPoints(
  from: Point,
  to: Point,
  size: number
): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const p1x = to.x - size * Math.cos(angle - Math.PI / 6);
  const p1y = to.y - size * Math.sin(angle - Math.PI / 6);
  const p2x = to.x - size * Math.cos(angle + Math.PI / 6);
  const p2y = to.y - size * Math.sin(angle + Math.PI / 6);
  return `${to.x},${to.y} ${p1x},${p1y} ${p2x},${p2y}`;
}


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
      {shape.type === "rectangle" && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.cornerRadius ? shape.cornerRadius : undefined}
          ry={shape.cornerRadius ? shape.cornerRadius : undefined}
          fill={shape.style.fillColor ?? "none"}
          fillOpacity={shape.style.fillOpacity}
          stroke={shape.style.strokeColor}
          strokeWidth={sw}
          strokeDasharray={dashArray}
          transform={
            shape.rotation
              ? `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`
              : undefined
          }
        />
      )}

      {shape.type === "ellipse" && (
        <ellipse
          cx={shape.x + shape.width / 2}
          cy={shape.y + shape.height / 2}
          rx={shape.width / 2}
          ry={shape.height / 2}
          fill={shape.style.fillColor ?? "none"}
          fillOpacity={shape.style.fillOpacity}
          stroke={shape.style.strokeColor}
          strokeWidth={sw}
          strokeDasharray={dashArray}
          transform={
            shape.rotation
              ? `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`
              : undefined
          }
        />
      )}

      {(shape.type === "line" || shape.type === "arrow" || shape.type === "ruler") &&
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
            {shape.measurement && (
              <text
                x={(shape.points[0].x + shape.points[1].x) / 2}
                y={(shape.points[0].y + shape.points[1].y) / 2 - 8 / zoom}
                fill={shape.style.strokeColor}
                fontSize={12 / zoom}
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
              >
                {shape.measurement.label}
              </text>
            )}
          </>
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

      {shape.type === "polyline" && shape.points.length >= 2 && (
        <>
          {shape.closed ? (
            <polygon
              points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={shape.style.fillColor ?? "none"}
              fillOpacity={shape.style.fillOpacity}
              stroke={shape.style.strokeColor}
              strokeWidth={sw}
              strokeLinecap={shape.lineCap ?? "round"}
              strokeLinejoin="round"
              strokeDasharray={dashArray}
            />
          ) : (
            <polyline
              points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={shape.style.strokeColor}
              strokeWidth={sw}
              strokeLinecap={shape.lineCap ?? "round"}
              strokeLinejoin="round"
              strokeDasharray={dashArray}
            />
          )}
        </>
      )}

      {shape.type === "bezier" &&
        shape.points.length >= 2 &&
        shape.controlPoints &&
        shape.controlPoints.length >= 2 && (
          <path
            d={buildBezierPath(shape.points, shape.controlPoints)}
            fill="none"
            stroke={shape.style.strokeColor}
            strokeWidth={sw}
            strokeLinecap={shape.lineCap ?? "round"}
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

      {shape.type === "angle" &&
        shape.points.length >= 3 && (
          <>
            <polyline
              points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={shape.style.strokeColor}
              strokeWidth={sw}
            />
            {shape.measurement && (
              <text
                x={shape.points[1].x + 12 / zoom}
                y={shape.points[1].y - 8 / zoom}
                fill={shape.style.strokeColor}
                fontSize={12 / zoom}
                fontFamily="system-ui, sans-serif"
              >
                {shape.measurement.label}
              </text>
            )}
          </>
        )}
    </g>
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

function buildBezierPath(
  anchors: Point[],
  controlPoints: { cp1x: number; cp1y: number; cp2x: number; cp2y: number }[]
): string {
  if (anchors.length < 2) return "";
  let d = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let i = 1; i < anchors.length; i++) {
    const prevCp = controlPoints[i - 1];
    const currCp = controlPoints[i];
    d += ` C ${prevCp.cp2x} ${prevCp.cp2y}, ${currCp.cp1x} ${currCp.cp1y}, ${anchors[i].x} ${anchors[i].y}`;
  }
  return d;
}

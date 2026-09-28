"use client";

import { useEffect, useRef, useState } from "react";
import type { Granularity, TrendPoint } from "@/types/reports";
import { compactMYR, formatDayShort, formatMYR } from "@/components/reports/report-format";
import { formatRangeLabel } from "@/lib/reports/range";

/**
 * Plain-SVG charts for the reports page. Colours were checked with the
 * dataviz palette validator on the white card surface: indigo (brand) and
 * orange pass lightness, chroma, colour-blind separation and 3:1 contrast.
 */
export const SERIES = {
  collected: "#635BFF",
  invoiced: "#eb6834",
} as const;
const TRACK = "#E6E4FF"; // lighter step of the indigo ramp (meter track)
const GRID = "#E3E8EE";
const BASELINE = "#C1C9D2";
const MUTED = "#697386";
const INK = "#061b31";

/** Width of an element, following resizes (0 until mounted). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Clean axis steps: 1, 2, 2.5, 5 × 10ⁿ. */
function niceScale(min: number, max: number, ticks = 4): { lo: number; hi: number; step: number } {
  const span = max - min || Math.abs(max) || 100;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.max(step, Math.ceil(max / step) * step), step };
}

/** A column with a 4px rounded data end and a square base. */
function columnPath(x: number, w: number, base: number, value: number): string {
  const r = Math.min(4, w / 2, Math.abs(base - value));
  if (value <= base) {
    return `M${x},${base}V${value + r}Q${x},${value} ${x + r},${value}H${x + w - r}Q${x + w},${value} ${x + w},${value + r}V${base}Z`;
  }
  return `M${x},${base}V${value - r}Q${x},${value} ${x + r},${value}H${x + w - r}Q${x + w},${value} ${x + w},${value - r}V${base}Z`;
}

const HEIGHT = 232;
const TOP = 22;
const AXIS = 26;
const LEFT = 60;
const RIGHT = 8;

interface TrendChartProps {
  points: TrendPoint[];
  granularity: Granularity;
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#425466]">
      {(["collected", "invoiced"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <rect width="10" height="10" rx="2" fill={SERIES[k]} />
          </svg>
          {k === "collected" ? "Collected" : "Invoiced"}
        </span>
      ))}
    </div>
  );
}

/** Collected vs invoiced per day / week: paired columns, hover or focus a period for its values. */
export function TrendChart({ points, granularity }: TrendChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const values = points.flatMap((p) => [p.collected, p.invoiced]);
  const { lo, hi, step } = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const plotW = Math.max(0, width - LEFT - RIGHT);
  const plotH = HEIGHT - TOP - AXIS;
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * plotH;
  const slot = points.length > 0 ? plotW / points.length : 0;
  const barW = Math.max(1, Math.min(24, (Math.min(slot * 0.72, 52) - 2) / 2));
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 52))));
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  const peak = points.reduce((best, p, i) => (p.collected > (points[best]?.collected ?? 0) ? i : best), 0);
  const summary = `Collected and invoiced per ${granularity}. Peak collected ${formatMYR(points[peak]?.collected ?? 0)}.`;

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke={t === 0 ? BASELINE : GRID} strokeWidth={1} />
              <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={MUTED} className="tabular-nums">
                {compactMYR(t)}
              </text>
            </g>
          ))}
          {active !== null && (
            <rect x={LEFT + slot * active} y={TOP} width={slot} height={plotH} fill="#F6F9FC" />
          )}
          {points.map((p, i) => {
            const cx = LEFT + slot * (i + 0.5);
            return (
              <g key={p.key}>
                <path d={columnPath(cx - 1 - barW, barW, y(0), y(p.collected))} fill={SERIES.collected} />
                <path d={columnPath(cx + 1, barW, y(0), y(p.invoiced))} fill={SERIES.invoiced} />
                {i % every === 0 && (
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={12} fill={MUTED} className="tabular-nums">
                    {formatDayShort(p.from)}
                  </text>
                )}
              </g>
            );
          })}
          {points[peak] && points[peak].collected > 0 && (
            <text
              x={Math.min(Math.max(LEFT + slot * (peak + 0.5), LEFT + 24), width - 28)}
              y={Math.min(y(points[peak].collected), y(points[peak].invoiced)) - 6}
              textAnchor="middle"
              fontSize={12}
              fill={INK}
              className="tabular-nums"
            >
              {compactMYR(points[peak].collected)} collected
            </text>
          )}
          {points.map((p, i) => (
            <rect
              key={p.key}
              x={LEFT + slot * i}
              y={TOP}
              width={slot}
              height={plotH + AXIS}
              fill="transparent"
              tabIndex={0}
              aria-label={`${formatRangeLabel(p)}: collected ${formatMYR(p.collected)}, invoiced ${formatMYR(p.invoiced)}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none focus-visible:stroke-[#635BFF]"
            />
          ))}
          {active !== null && points[active] && (
            <TrendTooltip point={points[active]} x={LEFT + slot * (active + 0.5)} width={width} />
          )}
        </svg>
      )}
      {width === 0 && <div className="h-58" />}
    </div>
  );
}

function TrendTooltip({ point, x, width }: { point: TrendPoint; x: number; width: number }) {
  const W = 176;
  const left = x + 12 + W > width ? x - 12 - W : x + 12;
  const rows = [
    { key: "collected" as const, name: "Collected", value: point.collected },
    { key: "invoiced" as const, name: "Invoiced", value: point.invoiced },
  ];
  return (
    <g transform={`translate(${Math.max(0, left)},${TOP})`} pointerEvents="none">
      <rect width={W} height={70} rx={6} fill="#FFFFFF" stroke={GRID} />
      <text x={10} y={18} fontSize={12} fill={MUTED}>
        {formatRangeLabel(point)}
      </text>
      {rows.map((r, i) => (
        <g key={r.key} transform={`translate(10,${38 + i * 20})`}>
          <line x1={0} x2={10} y1={-4} y2={-4} stroke={SERIES[r.key]} strokeWidth={2} strokeLinecap="round" />
          <text x={16} y={0} fontSize={13} fontWeight={600} fill={INK} className="tabular-nums">
            {formatMYR(r.value)}
          </text>
          <text x={W - 20} y={0} fontSize={12} fill={MUTED} textAnchor="end">
            {r.name}
          </text>
        </g>
      ))}
    </g>
  );
}

export interface BarRow {
  key: string;
  label: string;
  /** Null = no value (drawn as "—" without a bar). */
  value: number | null;
  display: string;
  /** Secondary text under the value (e.g. "18.5 of 40 h"). */
  detail?: string;
}

interface BarListProps {
  rows: BarRow[];
  /** Scale maximum; defaults to the largest value. */
  max?: number;
  /** Draw the full-width track (meters such as utilisation). */
  track?: boolean;
  label: string;
  empty: string;
}

/** Horizontal bars, one series: label, bar, value at the end of the row. */
export function BarList({ rows, max, track = false, label, empty }: BarListProps) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value ?? 0));
  if (rows.length === 0) return <p className="py-4 text-center text-[14px] text-[#64748d]">{empty}</p>;
  return (
    <ul aria-label={label} className="space-y-1">
      {rows.map((r) => {
        const pct = r.value && top > 0 ? Math.max(0, Math.min(100, (r.value / top) * 100)) : 0;
        return (
          <li
            key={r.key}
            title={`${r.label}: ${r.display}${r.detail ? ` (${r.detail})` : ""}`}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-[4px] px-1 py-1 hover:bg-[#f6f9fc] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
          >
            <span className="truncate text-[14px] text-[#273951]">{r.label}</span>
            <svg className="h-3.5 w-full" aria-hidden>
              {track && <rect x="0" y="1" width="100%" height="12" rx="4" fill={TRACK} />}
              {pct > 0 && (
                <>
                  <rect x="0" y="1" width={`${pct}%`} height="12" rx="4" fill={SERIES.collected} />
                  <rect x="0" y="1" width={`${pct / 2}%`} height="12" fill={SERIES.collected} />
                </>
              )}
            </svg>
            <span className="text-right text-[14px] whitespace-nowrap text-[#061b31] tabular-nums">
              {r.display}
              {r.detail && <span className="block text-[12px] text-[#64748d]">{r.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

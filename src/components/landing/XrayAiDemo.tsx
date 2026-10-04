"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * Landing-page "video" of the AI pelvis analysis on a sample full-spine film, driven
 * by one clock so it loops, pauses off-screen and shows its last frame under reduced
 * motion. Like the viewer, it checks the film, zooms to the pelvis, then measures.
 * Landmarks were placed by hand for the demo; the values come from
 * `computePelvicAnalysis` on them at an assumed 0.5 mm/px (patient's right on the
 * image right, per the film's R marker).
 */

const FILM = { src: "/landing/full-spine-xray.jpg", w: 711, h: 1600 };

const DURATION = 16000;
const SCAN_AT = 600;
const CHECKED_AT = 1500;
const ZOOM_AT = 2400;
const ZOOM_MS = 900;
const DETECT_AT = ZOOM_AT + ZOOM_MS;
const LANDMARK_GAP = 250;
const REFINE_AT = DETECT_AT + 14 * LANDMARK_GAP;
const MEASURE_AT = REFINE_AT + 800;
const LINE_GAP = 300;
const LINE_DRAW = 700;
const RESULTS_AT = MEASURE_AT + 2000;
const ROW_GAP = 350;

const VIOLET = "#a78bfa";
const AMBER = "#fbbf24";
const CYAN = "#67e8f9";

// viewBoxes (film pixels, 4:3): the whole film, then the pelvis.
const FULL = [(FILM.w - (FILM.h * 4) / 3) / 2, 0, (FILM.h * 4) / 3, FILM.h];
const PELVIS = [10, 1088, 692, 519];

// Paper Fig. 2 numbering in film pixels; 4 and 6 (ischial tuberosities) are below the
// film's edge. `low` = dashed ring (the sacral points the app flags); `left` puts the
// number on the left where the sacral points crowd.
const LANDMARKS = [
  { n: 1, x: 182, y: 1393 },
  { n: 2, x: 543, y: 1392 },
  { n: 3, x: 165, y: 1138 },
  { n: 5, x: 545, y: 1148 },
  { n: 7, x: 356, y: 1268, low: true },
  { n: 8, x: 354, y: 1490 },
  { n: 9, x: 274, y: 1213, left: true },
  { n: 10, x: 440, y: 1213 },
  { n: 11, x: 266, y: 1268, low: true, left: true },
  { n: 12, x: 448, y: 1268, low: true },
  { n: 13, x: 286, y: 1246, left: true },
  { n: 14, x: 47, y: 1224 },
  { n: 15, x: 428, y: 1246 },
  { n: 16, x: 673, y: 1234 },
];
const REFINED = new Set([1, 2, 3, 5, 8]);

// Femur base line through 1–2, parallels through the crests (3, 5), and the S2 perpendicular.
const LINES = [
  { d: "M30 1393.4 L690 1391.6", color: VIOLET, label: "FHHD 0.5 mm", lx: 692, ly: 1381 },
  { d: "M30 1138.4 L690 1136.5", color: AMBER },
  { d: "M30 1149.4 L690 1147.6", color: AMBER, label: "ICHD 5.5 mm", lx: 692, ly: 1127 },
  { d: "M355.7 1160 L356.8 1560", color: CYAN, label: "DOCS 1.3 mm", lx: 366, ly: 1530 },
];

const STAGES = [
  { label: "Checking the film", at: 0 },
  { label: "Zooming to the pelvis", at: ZOOM_AT },
  { label: "Finding landmarks", at: DETECT_AT },
  { label: "Refining key points", at: REFINE_AT },
  { label: "Measuring 10 parameters", at: MEASURE_AT },
];
const DONE_AT = RESULTS_AT + 7 * ROW_GAP;

type Status = "ok" | "review" | "check" | "skip";
const RESULTS: { name: string; value: string; normal: string; status: Status }[] = [
  { name: "FHHD", value: "0.5 mm", normal: "< 10 mm", status: "ok" },
  { name: "ALFHRF", value: "0.2°", normal: "< 1°", status: "ok" },
  { name: "ICHD", value: "5.5 mm", normal: "< 5 mm", status: "review" },
  { name: "DOCS", value: "1.3 mm", normal: "< 3 mm", status: "ok" },
  { name: "IM R / L", value: "—", normal: "Δ < 5 mm", status: "skip" },
  { name: "ISM R / L", value: "123 / 120 mm", normal: "Δ < 5 mm", status: "ok" },
  { name: "SAM R / L", value: "46 / 45 mm", normal: "Δ < 5 mm", status: "check" },
];
const STATUS_PILL: Record<Status, { text: string; className: string }> = {
  ok: { text: "Normal", className: "bg-emerald-400/15 text-emerald-300" },
  review: { text: "Review", className: "bg-amber-400/15 text-amber-300" },
  check: { text: "Check", className: "bg-white/10 text-white/60" },
  skip: { text: "Not in view", className: "bg-white/10 text-white/60" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const clock = (ms: number) => `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;

export function XrayAiDemo() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [elapsed, setElapsed] = useState(0);
  // null = autoplay (unless reduced motion); true/false once the viewer presses play/pause.
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const playing = (userPlaying ?? !reduced) && inView;
  const t = userPlaying === null && reduced ? DONE_AT : elapsed;

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      setElapsed((e) => (e + now - last) % DURATION);
      last = now;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const stage = STAGES.findLastIndex((s) => t >= s.at);
  const done = t >= DONE_AT;
  const zoom = easeInOut(clamp01((t - ZOOM_AT) / ZOOM_MS));
  const viewBox = FULL.map((v, i) => v + (PELVIS[i] - v) * zoom).join(" ");
  const chip =
    t >= REFINE_AT
      ? { text: "Ischia below the film edge · IM skipped", className: "bg-amber-400/15 text-amber-200" }
      : t >= CHECKED_AT && t < DETECT_AT
        ? { text: "Full spine · AP · upright ✓", className: "bg-brand/30 text-violet-100" }
        : null;

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-surface border border-white/10 bg-canvas text-white shadow-(--shadow-floating)"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <Sparkles className="ml-2 size-4 shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
        <span className="truncate text-[13px] font-medium">AI pelvis analysis</span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            done ? "bg-emerald-400/15 text-emerald-300" : "bg-brand/25 text-violet-200",
          )}
        >
          {done ? "Analysis complete" : `${STAGES[stage].label}…`}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_22rem]">
        <div className="relative bg-black">
          <svg
            viewBox={viewBox}
            className="block aspect-4/3 w-full"
            role="img"
            aria-label="Animated demo: the AI checks a full-spine X-ray, zooms to the pelvis, places numbered landmarks, draws measurement lines and reports pelvic parameters."
          >
            <defs>
              <linearGradient id="xr-scan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={VIOLET} stopOpacity="0" />
                <stop offset="1" stopColor={VIOLET} stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <image href={FILM.src} width={FILM.w} height={FILM.h} opacity={clamp01(t / SCAN_AT)} />
            {t >= SCAN_AT && t < ZOOM_AT && <ScanLine y={((t - SCAN_AT) / (ZOOM_AT - SCAN_AT)) * FILM.h} />}
            {t >= CHECKED_AT && t < DETECT_AT && (
              <rect
                x="28"
                y="1105"
                width="668"
                height="485"
                rx="12"
                fill="none"
                stroke={VIOLET}
                strokeOpacity="0.8"
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
                className="landing-fade"
              />
            )}
            {LINES.map((line, i) => {
              const start = MEASURE_AT + i * LINE_GAP;
              if (t < start) return null;
              const p = clamp01((t - start) / LINE_DRAW);
              return (
                <g key={line.d}>
                  <path d={line.d} pathLength={1} stroke={line.color} strokeWidth="2.2" strokeDasharray="1" strokeDashoffset={1 - p} fill="none" />
                  {line.label && p === 1 && (
                    <text
                      x={line.lx}
                      y={line.ly}
                      textAnchor={line.lx > 600 ? "end" : "start"}
                      fontSize="16"
                      fontWeight="600"
                      fill={line.color}
                      stroke="#000"
                      strokeWidth="4"
                      paintOrder="stroke"
                      className="landing-fade"
                    >
                      {line.label}
                    </text>
                  )}
                </g>
              );
            })}
            {LANDMARKS.map((m, i) =>
              t >= DETECT_AT + i * LANDMARK_GAP ? (
                <g key={m.n}>
                  <circle cx={m.x} cy={m.y} r="7" fill="none" stroke={VIOLET} strokeWidth="1.5" className="landing-ping" />
                  {t >= REFINE_AT && t < MEASURE_AT && REFINED.has(m.n) && (
                    <circle cx={m.x} cy={m.y} r="9" fill="none" stroke="#fff" strokeWidth="1.5" className="landing-ping" />
                  )}
                  <g className="landing-pop">
                    {m.low && <circle cx={m.x} cy={m.y} r="13" fill="none" stroke={VIOLET} strokeWidth="1.5" strokeDasharray="3.5 3.5" />}
                    <circle cx={m.x} cy={m.y} r="6.5" fill="#8b5cf6" stroke="#fff" strokeWidth="2" />
                    <text
                      x={m.left ? m.x - (m.low ? 15 : 10) : m.x + (m.low ? 15 : 10)}
                      y={m.left ? m.y + 5 : m.y - 9}
                      textAnchor={m.left ? "end" : "start"}
                      fontSize="15"
                      fontWeight="600"
                      fill="#fff"
                      stroke="#000"
                      strokeWidth="3.5"
                      paintOrder="stroke"
                    >
                      {m.n}
                    </text>
                  </g>
                </g>
              ) : null,
            )}
          </svg>
          {chip && (
            <span key={chip.text} className={cn("landing-fade absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur", chip.className)}>
              {chip.text}
            </span>
          )}
        </div>

        <aside className="flex flex-col gap-4 border-t border-white/10 p-5 lg:border-l lg:border-t-0">
          <ol className="space-y-2">
            {STAGES.map((s, i) => {
              const state = done || i < stage ? "done" : i === stage ? "active" : "pending";
              return (
                <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full",
                      state === "done" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/50",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : state === "active" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span className={state === "pending" ? "text-white/45" : "text-white/90"}>{s.label}</span>
                </li>
              );
            })}
          </ol>

          <div className="rounded-panel bg-canvas-raised p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[13px] font-medium">Pelvic parameters</p>
              <p className="text-[11px] text-white/50">normal range</p>
            </div>
            <ul className="space-y-1.5">
              {RESULTS.map((r, i) =>
                t >= RESULTS_AT + i * ROW_GAP ? (
                  <li key={r.name} className="landing-fade flex items-center gap-2 text-[12px]">
                    <span className="w-16 shrink-0 font-medium text-white/90">{r.name}</span>
                    <span className="min-w-0 flex-1 truncate tabular-nums text-white/80">{r.value}</span>
                    <span className="hidden text-[11px] text-white/45 sm:inline lg:hidden xl:inline">{r.normal}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_PILL[r.status].className)}>
                      {STATUS_PILL[r.status].text}
                    </span>
                  </li>
                ) : (
                  <li key={r.name} className="flex h-5.5 items-center gap-2">
                    <span className="h-2 w-12 rounded-full bg-white/10" />
                    <span className="h-2 flex-1 rounded-full bg-white/5" />
                  </li>
                ),
              )}
            </ul>
          </div>

          <p className={cn("text-[12px] text-white/60 transition-opacity duration-300", done ? "opacity-100" : "opacity-0")}>
            1 finding to review: the right iliac crest sits 5.5 mm lower. Drag any point and every measurement updates live.
          </p>
        </aside>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setUserPlaying(!playing)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={playing ? "Pause demo" : "Play demo"}
        >
          {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5" fill="currentColor" />}
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(t / DURATION) * 100}%` }} />
        </div>
        <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-white/50">
          {clock(t)} / {clock(DURATION)}
        </span>
        <button
          type="button"
          onClick={() => {
            setElapsed(0);
            setUserPlaying(true);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Replay demo"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/40">
        Sample film with landmarks placed for the demo; mm at an assumed scale. Method: Moon et al., Heliyon 2024.
      </p>
    </div>
  );
}

function ScanLine({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <rect y="-160" width={FILM.w} height="160" fill="url(#xr-scan)" />
      <line x1="0" x2={FILM.w} stroke={VIOLET} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

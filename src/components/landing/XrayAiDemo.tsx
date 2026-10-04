"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * Landing-page "video" of the AI pelvis analysis: an SVG film driven by one clock,
 * so it loops, pauses off-screen and shows its last frame under reduced motion.
 * Illustrative only — the film is a drawing and the numbers are examples.
 */

const DURATION = 15000;
const SCAN_AT = 700;
const DETECT_AT = 2600;
const LANDMARK_GAP = 250;
const REFINE_AT = DETECT_AT + 16 * LANDMARK_GAP;
const MEASURE_AT = REFINE_AT + 800;
const LINE_GAP = 300;
const LINE_DRAW = 700;
const RESULTS_AT = MEASURE_AT + 2000;
const ROW_GAP = 350;

const VIOLET = "#a78bfa";
const AMBER = "#fbbf24";
const CYAN = "#67e8f9";

// Paper Fig. 2 numbering, in the drawing's 480×360 space. `low` = dashed ring (low confidence);
// `left` puts the number on the left where the sacral points crowd.
const LANDMARKS = [
  { n: 1, x: 150, y: 198 },
  { n: 2, x: 330, y: 196 },
  { n: 3, x: 132, y: 50 },
  { n: 4, x: 177, y: 312 },
  { n: 5, x: 348, y: 40 },
  { n: 6, x: 303, y: 310 },
  { n: 7, x: 240, y: 136 },
  { n: 8, x: 240, y: 267 },
  { n: 9, x: 217, y: 103, low: true },
  { n: 10, x: 263, y: 103 },
  { n: 11, x: 211, y: 136, low: true, left: true },
  { n: 12, x: 269, y: 136, low: true },
  { n: 13, x: 222, y: 121, left: true },
  { n: 14, x: 70, y: 100 },
  { n: 15, x: 258, y: 121 },
  { n: 16, x: 410, y: 93 },
];
const REFINED = new Set([1, 2, 3, 4, 5, 6, 8]);

// Femur base line through 1–2, parallels through the crests (3, 5), and the S2 perpendicular.
const LINES = [
  { d: "M40 199.2 L440 194.8", color: VIOLET, label: "FHHD 1.7 mm", lx: 470, ly: 185 },
  { d: "M60 50.8 L420 46.8", color: AMBER },
  { d: "M60 43.2 L420 39.2", color: AMBER, label: "ICHD 6.5 mm", lx: 470, ly: 30 },
  { d: "M238.9 40 L242.3 340", color: CYAN, label: "DOCS 1.3 mm", lx: 252, ly: 334 },
];

const STAGES = [
  { label: "Checking the film", at: 0 },
  { label: "Finding 16 landmarks", at: DETECT_AT },
  { label: "Refining key points", at: REFINE_AT },
  { label: "Measuring 10 parameters", at: MEASURE_AT },
];
const DONE_AT = RESULTS_AT + 7 * ROW_GAP;

type Status = "ok" | "review" | "check";
const RESULTS: { name: string; value: string; normal: string; status: Status }[] = [
  { name: "FHHD", value: "1.7 mm", normal: "< 10 mm", status: "ok" },
  { name: "ALFHRF", value: "0.6°", normal: "< 1°", status: "ok" },
  { name: "ICHD", value: "6.5 mm", normal: "< 5 mm", status: "review" },
  { name: "DOCS", value: "1.3 mm", normal: "< 3 mm", status: "ok" },
  { name: "IM R / L", value: "221 / 228 mm", normal: "Δ < 5 mm", status: "review" },
  { name: "ISM R / L", value: "124 / 123 mm", normal: "Δ < 5 mm", status: "ok" },
  { name: "SAM R / L", value: "41 / 44 mm", normal: "Δ < 5 mm", status: "check" },
];
const STATUS_PILL: Record<Status, { text: string; className: string }> = {
  ok: { text: "Normal", className: "bg-emerald-400/15 text-emerald-300" },
  review: { text: "Review", className: "bg-amber-400/15 text-amber-300" },
  check: { text: "Check", className: "bg-white/10 text-white/60" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
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
  const reviews = RESULTS.filter((r) => r.status === "review").length;

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
        <svg
          viewBox="0 0 480 360"
          className="block h-auto w-full"
          role="img"
          aria-label="Animated demo: the AI checks a pelvis X-ray, places 16 numbered landmarks, draws measurement lines and reports pelvic parameters."
        >
          <Film />
          {t >= SCAN_AT && t < DETECT_AT && <ScanLine y={((t - SCAN_AT) / (DETECT_AT - SCAN_AT)) * 380} />}
          {t >= 2000 && t < MEASURE_AT && (
            <g className="landing-fade">
              <rect x="52" y="26" width="376" height="296" rx="6" fill="none" stroke={VIOLET} strokeOpacity="0.55" strokeDasharray="6 5" />
              <text x="60" y="20" fontSize="10" fill={VIOLET}>Pelvis · AP · upright ✓</text>
            </g>
          )}
          {LINES.map((line, i) => {
            const start = MEASURE_AT + i * LINE_GAP;
            if (t < start) return null;
            const p = clamp01((t - start) / LINE_DRAW);
            return (
              <g key={line.d}>
                <path d={line.d} pathLength={1} stroke={line.color} strokeWidth="1.5" strokeDasharray="1" strokeDashoffset={1 - p} fill="none" />
                {line.label && p === 1 && (
                  <text
                    x={line.lx}
                    y={line.ly}
                    textAnchor={line.lx > 400 ? "end" : "start"}
                    fontSize="11"
                    fontWeight="600"
                    fill={line.color}
                    stroke="#000"
                    strokeWidth="3"
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
                <circle cx={m.x} cy={m.y} r="5" fill="none" stroke={VIOLET} className="landing-ping" />
                {t >= REFINE_AT && t < MEASURE_AT && REFINED.has(m.n) && (
                  <circle cx={m.x} cy={m.y} r="6" fill="none" stroke="#fff" className="landing-ping" />
                )}
                <g className="landing-pop">
                  {m.low && <circle cx={m.x} cy={m.y} r="9" fill="none" stroke={VIOLET} strokeDasharray="2.5 2.5" />}
                  <circle cx={m.x} cy={m.y} r="4.5" fill="#8b5cf6" stroke="#fff" strokeWidth="1.5" />
                  <text
                    x={m.left ? m.x - (m.low ? 10 : 7) : m.x + (m.low ? 10 : 7)}
                    y={m.left ? m.y + 4 : m.y - 6}
                    textAnchor={m.left ? "end" : "start"}
                    fontSize="10"
                    fontWeight="600"
                    fill="#fff"
                    stroke="#000"
                    strokeWidth="2.5"
                    paintOrder="stroke"
                  >
                    {m.n}
                  </text>
                </g>
              </g>
            ) : null,
          )}
        </svg>

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
            {reviews} findings to review · drag any point and every measurement updates live.
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
        Illustration with example values. Landmarks and parameters follow Moon et al., Heliyon 2024.
      </p>
    </div>
  );
}

function ScanLine({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <rect y="-36" width="480" height="36" fill="url(#xr-scan)" />
      <line x1="0" x2="480" stroke={VIOLET} strokeWidth="1.5" />
    </g>
  );
}

/** A drawn AP pelvis; the image-right ilium is drawn a little taller (the finding the demo reports). */
function Film() {
  return (
    <>
      <defs>
        <radialGradient id="xr-bg" cx="50%" cy="45%" r="75%">
          <stop offset="0" stopColor="#262626" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <linearGradient id="xr-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={VIOLET} stopOpacity="0" />
          <stop offset="1" stopColor={VIOLET} stopOpacity="0.35" />
        </linearGradient>
        <filter id="xr-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
        <filter id="xr-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="xr-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.08 0" />
        </filter>
        <path
          id="xr-ilium"
          d="M206 96 C196 74 168 50 132 50 C104 50 80 66 72 90 C67 104 72 116 84 122 C98 140 112 168 120 192 C140 199 162 199 178 192 C188 176 198 160 206 152 Z"
        />
        <path
          id="xr-ischium"
          d="M168 226 C156 248 154 284 162 304 C168 315 184 315 190 304 C200 290 220 284 236 284 L236 250 C222 246 200 236 184 222 Z"
        />
        <g id="xr-femur">
          <circle cx="150" cy="222" r="24" />
          <path d="M134 214 L108 236 C92 234 82 246 86 262 L96 360 L134 360 L130 300 C130 290 134 282 142 276 L162 238 Z" />
        </g>
      </defs>

      <rect width="480" height="360" fill="url(#xr-bg)" />
      <g filter="url(#xr-soft)" fill="#d4d4d4" fillOpacity="0.42" stroke="#f5f5f5" strokeOpacity="0.7" strokeWidth="2.5">
        {/* L4–L5 */}
        <rect x="214" y="-6" width="52" height="40" rx="7" />
        <rect x="188" y="60" width="104" height="11" rx="5.5" />
        <rect x="212" y="46" width="56" height="38" rx="7" />
        <ellipse cx="240" cy="68" rx="5" ry="9" />
        {/* Sacrum */}
        <path d="M206 92 L274 92 C272 130 262 170 248 196 L244 212 L236 212 L232 196 C218 170 208 130 206 92 Z" />
        <use href="#xr-ilium" />
        <use href="#xr-ischium" />
        <use href="#xr-femur" />
        <g transform="translate(480 0) scale(-1 1)">
          <use href="#xr-ilium" transform="translate(0 -2) translate(0 200) scale(1 1.0533) translate(0 -200)" />
          <use href="#xr-ischium" transform="translate(0 -2)" />
          <use href="#xr-femur" transform="translate(0 -2)" />
        </g>
      </g>
      {/* Thin iliac fossae, obturator and sacral foramina read darker. */}
      <g fill="#000">
        <ellipse cx="142" cy="110" rx="38" ry="30" opacity="0.35" filter="url(#xr-blur)" />
        <ellipse cx="338" cy="104" rx="38" ry="32" opacity="0.35" filter="url(#xr-blur)" />
        <g filter="url(#xr-soft)" opacity="0.8">
          <ellipse cx="199" cy="266" rx="21" ry="14" transform="rotate(-25 199 266)" />
          <ellipse cx="281" cy="264" rx="21" ry="14" transform="rotate(25 281 264)" />
          {[
            [226, 112],
            [227, 132],
            [229, 152],
            [233, 172],
          ].map(([x, y]) => (
            <g key={y}>
              <circle cx={x} cy={y} r="3.5" />
              <circle cx={480 - x} cy={y} r="3.5" />
            </g>
          ))}
        </g>
      </g>
      <rect width="480" height="360" filter="url(#xr-grain)" />
    </>
  );
}

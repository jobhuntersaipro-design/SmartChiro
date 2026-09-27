"use client";

import { useEffect, useRef, useState } from "react";
import type { PartCallout } from "@/lib/anatomy/callout";
import { poseLabel } from "@/lib/anatomy/osteology";
import { PartLabel } from "./PartLabel";
import { mountSkeleton, type SkeletonStage } from "./mount-skeleton";

export function SkeletonViewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<SkeletonStage | null>(null);
  const amountRef = useRef(0);
  const tweenRef = useRef(0);
  const [callout, setCallout] = useState<PartCallout | null>(null);
  const [hint, setHint] = useState(true);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [amount, setAmount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let dead = false;
    let stage: SkeletonStage | null = null;
    const observer = new ResizeObserver(() => {
      setBounds({ width: host.clientWidth, height: host.clientHeight });
    });
    observer.observe(host);
    mountSkeleton(canvas, host, setCallout, setProgress)
      .then((next) => {
        if (dead) {
          next.dispose();
          return;
        }
        stage = next;
        stageRef.current = next;
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      cancelAnimationFrame(tweenRef.current);
      observer.disconnect();
      stage?.dispose();
      stageRef.current = null;
    };
  }, []);

  function publish(next: number) {
    const clamped = Math.min(1, Math.max(0, next));
    amountRef.current = clamped;
    setAmount(clamped);
    stageRef.current?.setAmount(clamped);
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function runExplode() {
    cancelAnimationFrame(tweenRef.current);
    const target = amountRef.current > 0.5 ? 0 : 1;
    if (reducedMotion()) {
      publish(target);
      return;
    }
    const from = amountRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1100);
      const eased = k * k * (3 - 2 * k);
      publish(from + (target - from) * eased);
      if (k < 1) tweenRef.current = requestAnimationFrame(step);
    };
    tweenRef.current = requestAnimationFrame(step);
  }

  const exploded = amount > 0.5;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#0c0e12]">
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1"
        onPointerDown={() => setHint(false)}
      >
        <canvas
          ref={canvasRef}
          data-testid="anatomy-skeleton-canvas"
          className="absolute inset-0 h-full w-full touch-none"
        />
        {callout && <PartLabel callout={callout} bounds={bounds} />}
        {hint && ready && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[14px] text-[#d5dbe3]">
            Drag to turn. Pinch to zoom.
          </p>
        )}
        {!ready && !failed && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-[15px] text-[#d5dbe3]">
            <span>Loading skeleton</span>
            <span className="h-1 w-32 overflow-hidden rounded-full bg-white/15">
              <span
                className="block h-full bg-[#efe6d6]"
                style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
              />
            </span>
          </div>
        )}
        {failed && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] text-[#d5dbe3]">
            The skeleton could not be loaded.
          </p>
        )}
        <button
          type="button"
          onClick={() => stageRef.current?.frameFront()}
          className="absolute left-3 top-3 z-10 min-h-11 rounded-[4px] border border-white/15 bg-[#16181d] px-3 text-[15px] font-medium text-white"
        >
          Front
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-3 py-2">
        <button
          type="button"
          data-testid="anatomy-explode"
          onClick={runExplode}
          disabled={!ready}
          className="min-h-11 shrink-0 rounded-[4px] bg-[#efe6d6] px-3 text-[15px] font-medium text-[#0A2540] disabled:opacity-40"
        >
          {exploded ? "Assemble" : "Explode"}
        </button>
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-[14px] text-[#d5dbe3]">
          <span className="w-24 shrink-0">{poseLabel(amount)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={amount}
            aria-label="Explode skeleton"
            disabled={!ready}
            className="h-11 w-full accent-[#efe6d6]"
            onChange={(event) => {
              cancelAnimationFrame(tweenRef.current);
              publish(Number(event.target.value));
            }}
          />
        </label>
      </div>
    </div>
  );
}

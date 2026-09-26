"use client";

import { useEffect, useRef, useState } from "react";
import type { PartCallout } from "@/lib/anatomy/callout";
import { PartLabel } from "./PartLabel";
import { mountMuscles, type MuscleStage } from "./mount-muscles";

export function MuscleViewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<MuscleStage | null>(null);
  const [callout, setCallout] = useState<PartCallout | null>(null);
  const [hint, setHint] = useState(true);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const stage = mountMuscles(canvas, host, setCallout);
    stageRef.current = stage;
    const observer = new ResizeObserver(() => {
      setBounds({ width: host.clientWidth, height: host.clientHeight });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#fcfcfe]">
      <div
        ref={hostRef}
        className="relative min-h-0 flex-1"
        onPointerDown={() => setHint(false)}
      >
        <canvas
          ref={canvasRef}
          data-testid="anatomy-muscle-canvas"
          className="absolute inset-0 h-full w-full touch-none"
        />
        {callout && <PartLabel callout={callout} bounds={bounds} />}
        {hint && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[14px] text-[#425466]">
            Drag to turn. Pinch to zoom.
          </p>
        )}
        <button
          type="button"
          onClick={() => stageRef.current?.frameFront()}
          className="absolute left-3 top-3 z-10 min-h-11 rounded-[4px] border border-[#E3E8EE] bg-white px-3 text-[15px] font-medium text-[#0A2540] shadow-sm"
        >
          Front
        </button>
      </div>
    </div>
  );
}

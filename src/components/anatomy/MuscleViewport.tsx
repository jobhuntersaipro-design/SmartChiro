"use client";

import { useEffect, useRef, useState } from "react";
import type { PartCallout } from "@/lib/anatomy/callout";
import { cn } from "@/lib/utils";
import { PartLabel } from "./PartLabel";
import { mountMuscles, type AtlasView, type MuscleStage } from "./mount-muscles";

const VIEWS: { id: AtlasView; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
];

export function MuscleViewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<MuscleStage | null>(null);
  const [callout, setCallout] = useState<PartCallout | null>(null);
  const [hint, setHint] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState("");
  const [view, setView] = useState<AtlasView>("front");
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const stage = mountMuscles(
      canvas,
      host,
      setCallout,
      () => setReady(true),
      (message) => setFailed(message),
    );
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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
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
        {!ready && !failed && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[15px] text-[#425466]">
            Opening the atlas
          </p>
        )}
        {failed && (
          <p className="absolute inset-x-6 top-1/2 text-center text-[15px] text-[#0A2540]">{failed}</p>
        )}
        {hint && ready && (
          <p className="pointer-events-none absolute inset-x-0 bottom-20 text-center text-[14px] text-[#425466]">
            Drag to turn. Pinch to zoom.
          </p>
        )}
        <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <div className="grid grid-cols-4 gap-1 rounded-[6px] bg-white/95 p-1 shadow-sm">
            {VIEWS.map((item) => {
              const selected = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`anatomy-view-${item.id}`}
                  onClick={() => {
                    setView(item.id);
                    stageRef.current?.frameView(item.id);
                  }}
                  className={cn(
                    "min-h-11 min-w-11 rounded-[4px] px-3 text-[15px] font-medium motion-reduce:transition-none",
                    selected ? "bg-[#635BFF] text-white" : "text-[#425466]",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="pointer-events-none absolute left-3 top-3 text-[11px] text-[#8a94a6]">
          Z-Anatomy and BodyParts3D, CC BY-SA 4.0
        </p>
      </div>
    </div>
  );
}

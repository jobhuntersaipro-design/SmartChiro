"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MuscleViewport } from "./MuscleViewport";
import { SkeletonViewport } from "./SkeletonViewport";

type AnatomyMode = "muscles" | "skeleton" | "both";

const MODES: { id: AnatomyMode; label: string }[] = [
  { id: "muscles", label: "Muscles" },
  { id: "skeleton", label: "Skeleton" },
  { id: "both", label: "Both" },
];

export function AnatomyStudio() {
  const [mode, setMode] = useState<AnatomyMode>("muscles");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F9FC]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#E3E8EE] bg-white px-3 py-2 md:px-4">
        <h1 className="sr-only">Anatomy</h1>
        <div
          role="tablist"
          aria-label="Anatomy"
          className="grid w-full max-w-md grid-cols-3 gap-1 rounded-[6px] bg-[#F6F9FC] p-1"
        >
          {MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`anatomy-mode-${item.id}`}
                onClick={() => setMode(item.id)}
                className={cn(
                  "min-h-11 rounded-[4px] text-[15px] font-medium motion-reduce:transition-none",
                  selected
                    ? "bg-white text-[#635BFF] shadow-sm"
                    : "text-[#425466] hover:text-[#0A2540]",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1",
          mode === "both" ? "grid-rows-2 md:grid-cols-2 md:grid-rows-1" : "grid-rows-1",
        )}
      >
        <section
          aria-label="Muscles"
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col",
            mode === "skeleton" && "hidden",
            mode === "both" && "border-b border-[#E3E8EE] md:border-r md:border-b-0",
          )}
        >
          <MuscleViewport />
        </section>
        <section
          aria-label="Skeleton"
          className={cn("flex h-full min-h-0 min-w-0 flex-col", mode === "muscles" && "hidden")}
        >
          <SkeletonViewport />
        </section>
      </div>
    </div>
  );
}

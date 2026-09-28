"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bone,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  Loader2,
  RotateCcw,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANATOMY_ATTRIBUTION,
  findPart,
  groupLabel,
  groupParts,
  type AnatomyLayer,
  type AnatomyPart,
} from "@/lib/anatomy/parts";
import type { FocusRequest } from "./AnatomyViewer";

const AnatomyViewer = dynamic(() => import("./AnatomyViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#1A1F36] text-white/70">
      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
    </div>
  ),
});

const LAYERS: { key: AnatomyLayer; label: string }[] = [
  { key: "skeleton", label: "Skeleton" },
  { key: "muscles", label: "Muscles" },
];

type PerLayer<T> = Record<AnatomyLayer, T>;

export function AnatomyExplorer() {
  const [layer, setLayer] = useState<AnatomyLayer>("skeleton");
  const [selected, setSelected] = useState<PerLayer<string[]>>({ skeleton: [], muscles: [] });
  const [hidden, setHidden] = useState<PerLayer<string[]>>({ skeleton: [], muscles: [] });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIds = selected[layer];
  const hiddenGroups = useMemo(() => new Set(hidden[layer]), [hidden, layer]);
  const groups = useMemo(() => groupParts(layer, query), [layer, query]);
  const selectedParts = selectedIds
    .map((id) => findPart(layer, id))
    .filter((p): p is AnatomyPart => Boolean(p));

  function focus(ids: string[]) {
    if (ids.length) setFocusRequest((prev) => ({ ids, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  function selectPart(id: string, additive: boolean) {
    const current = selected[layer];
    const isSelected = current.includes(id);
    let next: string[];
    if (additive) next = isSelected ? current.filter((x) => x !== id) : [...current, id];
    else next = isSelected && current.length === 1 ? [] : [id];

    setSelected((prev) => ({ ...prev, [layer]: next }));
    if (!additive && next.length) focus(next);

    const part = findPart(layer, id);
    if (part && next.includes(id)) {
      setExpanded((prev) => new Set(prev).add(`${layer}:${part.group}`));
    }
  }

  function clearSelection() {
    setSelected((prev) => ({ ...prev, [layer]: [] }));
  }

  function toggleGroupVisibility(key: string) {
    setHidden((prev) => {
      const list = prev[layer];
      return { ...prev, [layer]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] };
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const k = `${layer}:${key}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      setSelected((prev) => ({ ...prev, [layer]: [] }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer]);

  // Keep the most recently selected row in view when picked from the 3D model.
  const lastSelected = selectedIds[selectedIds.length - 1];
  useEffect(() => {
    if (!lastSelected) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-part-id="${lastSelected}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [lastSelected, expanded]);

  return (
    <div className="flex h-full min-h-150 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.22px] text-[#061b31]">Anatomy</h1>
          <p className="mt-0.5 text-[14px] text-[#64748d]">
            Explore the skeleton and muscle groups in 3D — click a structure to select it
          </p>
        </div>
        <div role="tablist" aria-label="Anatomy layer" className="flex rounded-md border border-[#e5edf5] bg-white p-0.5">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              role="tab"
              aria-selected={layer === l.key}
              onClick={() => setLayer(l.key)}
              className={cn(
                "rounded-[4px] px-3.5 py-1 text-[14px] font-medium transition-colors",
                layer === l.key ? "bg-[#ededfc] text-[#533afd]" : "text-[#425466] hover:bg-[#f6f9fc] hover:text-[#061b31]"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="relative min-h-105 flex-1 overflow-hidden rounded-[6px] border border-[#e5edf5] shadow-(--shadow-card)">
          <AnatomyViewer
            layer={layer}
            selectedIds={selectedIds}
            hiddenGroups={hiddenGroups}
            isolate={isolate}
            showSkeletonUnderlay={showSkeleton}
            focusRequest={focusRequest}
            resetNonce={resetNonce}
            onPartClick={selectPart}
          />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <ViewerButton onClick={() => setResetNonce((n) => n + 1)} icon={RotateCcw} label="Reset view" />
            <ViewerButton
              onClick={() => setIsolate((v) => !v)}
              icon={Focus}
              label="Isolate selection"
              active={isolate}
            />
            {layer === "muscles" && (
              <ViewerButton
                onClick={() => setShowSkeleton((v) => !v)}
                icon={Bone}
                label="Show skeleton"
                active={showSkeleton}
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-[#0A2540]/70 to-transparent px-3 pb-2.5 pt-8">
            <p className="hidden text-[12px] text-white/70 md:block">
              Drag to rotate · Right-drag to pan · Scroll to zoom · Shift+click to multi-select · Esc to clear
            </p>
            <a
              href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/"
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto ml-auto shrink-0 text-[11px] text-white/60 hover:text-white"
              title={ANATOMY_ATTRIBUTION}
            >
              3D models: BodyParts3D · CC BY-SA
            </a>
          </div>
        </div>

        <aside className="flex max-h-150 w-full flex-col overflow-hidden rounded-[6px] border border-[#e5edf5] bg-white shadow-(--shadow-card) lg:max-h-none lg:w-85">
          <SelectionCard
            layer={layer}
            parts={selectedParts}
            onRemove={(id) => selectPart(id, true)}
            onFocus={() => focus(selectedIds)}
            onClear={clearSelection}
          />

          <div className="border-b border-[#e5edf5] p-3">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748d]"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={layer === "skeleton" ? "Search bones, e.g. L5, femur…" : "Search muscles, e.g. psoas…"}
                className="h-8 w-full rounded-md border border-[#e5edf5] bg-[#f6f9fc] pl-8 pr-3 text-[14px] text-[#061b31] placeholder:text-[#94a3b8] focus:border-[#533afd] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
            {groups.length === 0 && (
              <p className="px-4 py-6 text-center text-[14px] text-[#64748d]">No structures match “{query}”.</p>
            )}
            {groups.map(({ group, parts }) => {
              const open = query.trim() !== "" || expanded.has(`${layer}:${group.key}`);
              const isHidden = hiddenGroups.has(group.key);
              const selectedCount = parts.filter((p) => selectedIds.includes(p.id)).length;
              return (
                <div key={group.key}>
                  <div className="group flex items-center gap-1 px-2 hover:bg-[#f6f9fc]">
                    <button
                      onClick={() => toggleExpanded(group.key)}
                      aria-expanded={open}
                      className={cn(
                        "flex flex-1 items-center gap-1.5 py-1.5 text-left text-[14px] font-medium",
                        isHidden ? "text-[#A3ACB9]" : "text-[#061b31]"
                      )}
                    >
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 shrink-0 text-[#64748d] transition-transform", open && "rotate-90")}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{group.label}</span>
                      <span className="text-[12px] font-normal text-[#64748d]">{parts.length}</span>
                      {selectedCount > 0 && (
                        <span className="rounded-full bg-[#ededfc] px-1.5 text-[11px] font-medium text-[#533afd]">
                          {selectedCount} selected
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => toggleGroupVisibility(group.key)}
                      aria-label={isHidden ? `Show ${group.label}` : `Hide ${group.label}`}
                      title={isHidden ? "Show in 3D view" : "Hide in 3D view"}
                      className="rounded-[4px] p-1 text-[#64748d] hover:bg-white hover:text-[#061b31]"
                    >
                      {isHidden ? (
                        <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                      ) : (
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                  {open && (
                    <ul className="pb-1">
                      {parts.map((part) => {
                        const isSelected = selectedIds.includes(part.id);
                        return (
                          <li key={part.id}>
                            <button
                              data-part-id={part.id}
                              onClick={(e) => selectPart(part.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                              className={cn(
                                "flex w-full items-center gap-2 py-1 pl-8 pr-3 text-left text-[14px] transition-colors",
                                isSelected
                                  ? "bg-[#ededfc] text-[#533afd]"
                                  : "text-[#425466] hover:bg-[#f6f9fc] hover:text-[#061b31]"
                              )}
                            >
                              <span className="flex-1 truncate">{part.label}</span>
                              {part.short && (
                                <span className="shrink-0 rounded-full bg-[#f6f9fc] px-1.5 font-mono text-[11px] text-[#425466]">
                                  {part.short}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface ViewerButtonProps {
  onClick: () => void;
  icon: typeof RotateCcw;
  label: string;
  active?: boolean;
}

function ViewerButton({ onClick, icon: Icon, label, active }: ViewerButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-[4px] border px-2 py-1 text-[13px] font-medium backdrop-blur-sm transition-colors",
        active
          ? "border-[#635BFF] bg-[#635BFF]/85 text-white"
          : "border-white/15 bg-[#0A2540]/60 text-white/90 hover:bg-[#0A2540]/80 hover:text-white"
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

interface SelectionCardProps {
  layer: AnatomyLayer;
  parts: AnatomyPart[];
  onRemove: (id: string) => void;
  onFocus: () => void;
  onClear: () => void;
}

function SelectionCard({ layer, parts, onRemove, onFocus, onClear }: SelectionCardProps) {
  if (parts.length === 0) {
    return (
      <div className="border-b border-[#e5edf5] px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Selection</p>
        <p className="mt-1 text-[14px] text-[#64748d]">
          Click a {layer === "skeleton" ? "bone" : "muscle"} in the model or pick one below.
        </p>
      </div>
    );
  }

  const single = parts.length === 1 ? parts[0] : null;
  return (
    <div className="border-b border-[#e5edf5] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          {parts.length} selected
        </p>
        <div className="flex gap-1">
          <button
            onClick={onFocus}
            className="flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[13px] text-[#533afd] hover:bg-[#ededfc]"
          >
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.75} />
            Focus
          </button>
          <button
            onClick={onClear}
            className="rounded-[4px] px-1.5 py-0.5 text-[13px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31]"
          >
            Clear
          </button>
        </div>
      </div>
      {single ? (
        <div className="mt-1.5">
          <p className="text-[16px] font-medium text-[#061b31]">{single.label}</p>
          <p className="mt-0.5 text-[13px] text-[#64748d]">
            {groupLabel(layer, single.group)}
            {single.side !== "midline" && ` · ${single.side === "right" ? "Right" : "Left"} side`}
          </p>
        </div>
      ) : (
        <ul className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {parts.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1 rounded-full bg-[#ededfc] py-0.5 pl-2 pr-1 text-[12px] text-[#533afd]"
            >
              <span className="max-w-50 truncate">{p.short ?? p.label}</span>
              <button
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.label}`}
                className="rounded-full p-0.5 hover:bg-white"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

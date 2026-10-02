"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bone,
  Crosshair,
  Expand,
  Focus,
  Layers,
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
  isPeeledAway,
  layerLabel,
  MUSCLE_LAYERS,
  type AnatomyLayer,
  type AnatomyPart,
  type MuscleLayer,
} from "@/lib/anatomy/parts";
import { summarizeSelection, unitIdsOf, type SelectionItem } from "@/lib/anatomy/muscle-groups";
import { AnatomyPartList, muscleGroupRowKey, regionRowKey } from "./AnatomyPartList";
import type { FocusRequest, PartClickOptions } from "./AnatomyViewer";

const AnatomyViewer = dynamic(() => import("./AnatomyViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-canvas text-white/70">
      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
    </div>
  ),
});

const LAYERS: { key: AnatomyLayer; label: string }[] = [
  { key: "skeleton", label: "Skeleton" },
  { key: "muscles", label: "Muscles" },
];

type PerLayer<T> = Record<AnatomyLayer, T>;

const DEFAULT_EXPANSION = 0.6;

function preloadMuscles() {
  void import("./AnatomyViewer").then((m) => m.preloadLayer("muscles"));
}

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
  const [peelDepth, setPeelDepth] = useState<MuscleLayer>(1);
  const [expansion, setExpansion] = useState(0);
  const [expandGroupKeys, setExpandGroupKeys] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const expandGroups = useMemo(() => new Set(expandGroupKeys), [expandGroupKeys]);
  const isMuscles = layer === "muscles";

  const selectedIds = selected[layer];
  const hiddenGroups = useMemo(() => new Set(hidden[layer]), [hidden, layer]);
  const selectionItems = useMemo(() => summarizeSelection(layer, selectedIds), [layer, selectedIds]);

  function focus(ids: string[]) {
    if (!ids.length) return;
    // Muscles carry an outward explode vector; their sum is a good side to view the selection from.
    const direction: [number, number, number] = [0, 0, 0];
    for (const id of ids) {
      const explode = findPart(layer, id)?.explode;
      if (explode) for (let k = 0; k < 3; k++) direction[k] += explode[k];
    }
    setFocusRequest((prev) => ({ ids, nonce: (prev?.nonce ?? 0) + 1, direction }));
  }

  /** Clicking in 3D picks the whole clinical group (per side) unless Alt is held. */
  function handlePartClick(id: string, { additive, single }: PartClickOptions) {
    selectIds(single ? [id] : unitIdsOf(layer, id), additive);
  }

  function selectIds(ids: string[], additive: boolean) {
    const current = selected[layer];
    const allSelected = ids.every((id) => current.includes(id));
    let next: string[];
    if (additive) next = allSelected ? current.filter((x) => !ids.includes(x)) : [...new Set([...current, ...ids])];
    else next = allSelected && current.length === ids.length ? [] : ids;

    setSelected((prev) => ({ ...prev, [layer]: next }));
    if (!additive && next.length) focus(next);
    if (next.length === 0 || !ids.some((id) => next.includes(id))) return;

    const parts = ids.map((id) => findPart(layer, id)).filter((p): p is AnatomyPart => Boolean(p));
    setExpanded((prev) => {
      const open = new Set(prev);
      for (const part of parts) {
        open.add(regionRowKey(layer, part.group));
        if (part.fg) open.add(muscleGroupRowKey(part.fg));
      }
      return open;
    });
    // Selecting muscles that are all peeled away reveals the shallowest of their layers.
    if (isMuscles && parts.length && parts.every((p) => isPeeledAway(p, peelDepth))) {
      setPeelDepth(Math.min(...parts.map((p) => p.layer ?? 1)) as MuscleLayer);
    }
  }

  function toggleGroupExpansion(key: string) {
    const next = expandGroupKeys.includes(key) ? expandGroupKeys.filter((k) => k !== key) : [...expandGroupKeys, key];
    setExpandGroupKeys(next);
    // An empty scope means "whole body", so collapse instead of spreading everything.
    if (next.length === 0) setExpansion(0);
    else if (expansion === 0) setExpansion(DEFAULT_EXPANSION);
  }

  function clearExpansion() {
    setExpandGroupKeys([]);
    setExpansion(0);
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
          <h1 className="text-[22px] font-light tracking-[-0.22px] text-foreground">Anatomy</h1>
          <p className="mt-0.5 text-[14px] text-fg-secondary">
            Explore the skeleton and muscle groups in 3D — click a structure to select it
          </p>
        </div>
        <div role="tablist" aria-label="Anatomy layer" className="flex rounded-md border border-border bg-white p-0.5">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              role="tab"
              aria-selected={layer === l.key}
              onClick={() => setLayer(l.key)}
              onPointerEnter={l.key === "muscles" ? preloadMuscles : undefined}
              onFocus={l.key === "muscles" ? preloadMuscles : undefined}
              className={cn(
                "rounded-control px-3.5 py-1 text-[14px] font-medium transition-colors",
                layer === l.key ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-muted hover:text-foreground"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="relative min-h-105 flex-1 overflow-hidden rounded-panel border border-border shadow-(--shadow-card)">
          <AnatomyViewer
            layer={layer}
            selectedIds={selectedIds}
            hiddenGroups={hiddenGroups}
            isolate={isolate}
            showSkeletonUnderlay={showSkeleton}
            focusRequest={focusRequest}
            resetNonce={resetNonce}
            peelDepth={isMuscles ? peelDepth : 1}
            expansion={isMuscles ? expansion : 0}
            expandGroups={expandGroups}
            onPartClick={handlePartClick}
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
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
            {isMuscles && (
              <MuscleDepthControls
                peelDepth={peelDepth}
                onPeelDepthChange={setPeelDepth}
                expansion={expansion}
                onExpansionChange={setExpansion}
                scopeLabels={expandGroupKeys.map((k) => groupLabel("muscles", k))}
                onClearScope={clearExpansion}
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-foreground/70 to-transparent px-3 pb-2.5 pt-8">
            <p className="hidden text-[12px] text-white/70 md:block">
              Drag the model to rotate · Drag empty space to move · Scroll to zoom · Shift+click to multi-select
              {isMuscles && " · Alt+click for a single muscle"} · Esc to clear
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

        <aside className="flex max-h-150 w-full flex-col overflow-hidden rounded-panel border border-border bg-white shadow-(--shadow-card) lg:max-h-none lg:w-85">
          <SelectionCard
            layer={layer}
            items={selectionItems}
            onRemove={(ids) => selectIds(ids, true)}
            onFocus={() => focus(selectedIds)}
            onClear={clearSelection}
          />

          <div className="border-b border-border p-3">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={layer === "skeleton" ? "Search bones, e.g. L5, femur…" : "Search muscles, e.g. psoas…"}
                className="h-8 w-full rounded-md border border-border bg-surface-muted pl-8 pr-3 text-[14px] text-foreground placeholder:text-fg-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
            <AnatomyPartList
              layer={layer}
              query={query}
              expanded={expanded}
              onToggleExpanded={toggleExpanded}
              hiddenGroups={hiddenGroups}
              onToggleVisibility={toggleGroupVisibility}
              expandGroups={expandGroups}
              expansion={expansion}
              onToggleGroupExpansion={toggleGroupExpansion}
              selectedIds={selectedIds}
              peelDepth={peelDepth}
              onSelect={selectIds}
            />
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
        "flex items-center gap-1.5 rounded-control border px-2 py-1 text-[13px] font-medium backdrop-blur-sm transition-colors",
        active
          ? "border-brand bg-brand/85 text-white"
          : "border-white/15 bg-foreground/60 text-white/90 hover:bg-foreground/80 hover:text-white"
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );
}

interface MuscleDepthControlsProps {
  peelDepth: MuscleLayer;
  onPeelDepthChange: (depth: MuscleLayer) => void;
  expansion: number;
  onExpansionChange: (value: number) => void;
  scopeLabels: string[];
  onClearScope: () => void;
}

function MuscleDepthControls({
  peelDepth,
  onPeelDepthChange,
  expansion,
  onExpansionChange,
  scopeLabels,
  onClearScope,
}: MuscleDepthControlsProps) {
  const scope = scopeLabels.length ? scopeLabels.join(", ") : "Whole body";
  return (
    <div className="pointer-events-auto w-full max-w-66 rounded-panel border border-white/15 bg-foreground/70 p-2.5 text-white shadow-md backdrop-blur-sm sm:w-66">
      <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-white/70">
        <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />
        Peel to
      </div>
      <div
        role="radiogroup"
        aria-label="Peel muscles to layer"
        className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-control bg-white/10 p-0.5"
      >
        {MUSCLE_LAYERS.map(({ layer, label }) => (
          <button
            key={layer}
            role="radio"
            aria-checked={peelDepth === layer}
            onClick={() => onPeelDepthChange(layer)}
            className={cn(
              "rounded-control px-1 py-1 text-[12px] font-medium transition-colors",
              peelDepth === layer ? "bg-brand text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] font-medium uppercase tracking-[0.04em] text-white/70">
        <label htmlFor="muscle-expansion" className="flex items-center gap-1.5">
          <Expand className="h-3.5 w-3.5" strokeWidth={1.75} />
          Expand
        </label>
        <span className="font-mono normal-case tracking-normal text-white/80">{Math.round(expansion * 100)}%</span>
      </div>
      <input
        id="muscle-expansion"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={expansion}
        onChange={(e) => onExpansionChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-brand"
      />
      <div className="mt-1 flex items-center gap-1 text-[12px] text-white/65">
        <span className="truncate" title={scope}>
          {scope}
        </span>
        {scopeLabels.length > 0 && (
          <button
            onClick={onClearScope}
            aria-label="Collapse all groups"
            className="ml-auto shrink-0 rounded-control p-0.5 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

interface SelectionCardProps {
  layer: AnatomyLayer;
  items: SelectionItem[];
  onRemove: (ids: string[]) => void;
  onFocus: () => void;
  onClear: () => void;
}

function SelectionCard({ layer, items, onRemove, onFocus, onClear }: SelectionCardProps) {
  if (items.length === 0) {
    return (
      <div className="border-b border-border px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-fg-secondary">Selection</p>
        <p className="mt-1 text-[14px] text-fg-secondary">
          {layer === "skeleton"
            ? "Click a bone in the model or pick one below."
            : "Click a muscle group in the model or pick one below."}
        </p>
      </div>
    );
  }

  const single = items.length === 1 ? items[0] : null;
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-fg-secondary">
          {items.length === 1 ? "Selected" : `${items.length} selected`}
        </p>
        <div className="flex gap-1">
          <button
            onClick={onFocus}
            className="flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[13px] text-brand hover:bg-brand-subtle"
          >
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.75} />
            Focus
          </button>
          <button
            onClick={onClear}
            className="rounded-control px-1.5 py-0.5 text-[13px] text-fg-secondary hover:bg-surface-muted hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>
      {single ? (
        <SelectionDetail layer={layer} item={single} />
      ) : (
        <ul className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-1 rounded-full bg-brand-subtle py-0.5 pl-2 pr-1 text-[12px] text-brand"
            >
              <span className="max-w-50 truncate">
                {item.isGroup ? item.label : (findPart(layer, item.ids[0])?.short ?? item.label)}
              </span>
              <button
                onClick={() => onRemove(item.ids)}
                aria-label={`Remove ${item.label}`}
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

function SelectionDetail({ layer, item }: { layer: AnatomyLayer; item: SelectionItem }) {
  const parts = item.ids.map((id) => findPart(layer, id)).filter((p): p is AnatomyPart => Boolean(p));
  const first = parts[0];
  if (!first) return null;

  if (item.isGroup) {
    const layers = [...new Set(parts.map((p) => p.layer).filter((l): l is MuscleLayer => Boolean(l)))].sort();
    const members = [...new Set(parts.map((p) => p.label.replace(/\b(right|left) /i, "")))];
    return (
      <div className="mt-1.5">
        <p className="text-[16px] font-medium text-foreground">{item.label}</p>
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          {groupLabel(layer, first.group)} · {parts.length} parts
          {layers.length > 0 && ` · ${layers.map(layerLabel).join(", ")}`}
        </p>
        <p className="mt-1 line-clamp-3 text-[13px] text-fg-secondary" title={members.join(", ")}>
          {members.join(", ")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <p className="text-[16px] font-medium text-foreground">{first.label}</p>
      <p className="mt-0.5 text-[13px] text-fg-secondary">
        {groupLabel(layer, first.group)}
        {first.side !== "midline" && ` · ${first.side === "right" ? "Right" : "Left"} side`}
        {first.layer && ` · ${layerLabel(first.layer)} layer`}
      </p>
    </div>
  );
}

"use client";

import { ChevronRight, Expand, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  groupParts,
  isPeeledAway,
  layerLabel,
  type AnatomyGroup,
  type AnatomyLayer,
  type AnatomyPart,
  type MuscleLayer,
} from "@/lib/anatomy/parts";
import { groupMuscles, type MuscleGroupEntry } from "@/lib/anatomy/muscle-groups";

interface AnatomyPartListProps {
  layer: AnatomyLayer;
  query: string;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  hiddenGroups: Set<string>;
  onToggleVisibility: (region: string) => void;
  expandGroups: Set<string>;
  expansion: number;
  onToggleGroupExpansion: (region: string) => void;
  selectedIds: string[];
  peelDepth: MuscleLayer;
  onSelect: (ids: string[], additive: boolean) => void;
}

interface RegionRow {
  region: AnatomyGroup;
  parts: AnatomyPart[];
  muscleGroups?: MuscleGroupEntry[];
}

/** Keys for the collapsible rows — shared with the explorer so it can open rows on selection. */
export const regionRowKey = (layer: AnatomyLayer, region: string) => `${layer}:${region}`;
export const muscleGroupRowKey = (group: string) => `muscles:fg:${group}`;

function isAdditive(e: React.MouseEvent) {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

export function AnatomyPartList(props: AnatomyPartListProps) {
  const { layer, query, selectedIds } = props;
  const rows: RegionRow[] =
    layer === "muscles"
      ? groupMuscles(query).map(({ region, groups }) => ({
          region,
          parts: groups.flatMap((g) => g.parts),
          muscleGroups: groups,
        }))
      : groupParts(layer, query).map(({ group, parts }) => ({ region: group, parts }));
  const selected = new Set(selectedIds);

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-[14px] text-fg-secondary">No structures match “{query}”.</p>;
  }

  return (
    <>
      {rows.map((row) => (
        <RegionSection key={row.region.key} row={row} selected={selected} {...props} />
      ))}
    </>
  );
}

function RegionSection({
  row,
  selected,
  layer,
  query,
  expanded,
  onToggleExpanded,
  hiddenGroups,
  onToggleVisibility,
  expandGroups,
  expansion,
  onToggleGroupExpansion,
  peelDepth,
  onSelect,
}: AnatomyPartListProps & { row: RegionRow; selected: Set<string> }) {
  const { region, parts, muscleGroups } = row;
  const searching = query.trim() !== "";
  const open = searching || expanded.has(regionRowKey(layer, region.key));
  const isHidden = hiddenGroups.has(region.key);
  const selectedCount = parts.filter((p) => selected.has(p.id)).length;
  const isExpanding = expandGroups.has(region.key) && expansion > 0;

  return (
    <div>
      <div className="group flex items-center gap-1 px-2 hover:bg-surface-muted">
        <button
          onClick={() => onToggleExpanded(regionRowKey(layer, region.key))}
          aria-expanded={open}
          className={cn(
            "flex flex-1 items-center gap-1.5 py-1.5 text-left text-[14px] font-medium",
            isHidden ? "text-fg-disabled" : "text-foreground"
          )}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-fg-secondary transition-transform", open && "rotate-90")}
            strokeWidth={1.75}
          />
          <span className="truncate">{region.label}</span>
          <span className="text-[12px] font-normal text-fg-secondary">{parts.length}</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-brand-subtle px-1.5 text-[11px] font-medium text-brand">
              {selectedCount} selected
            </span>
          )}
        </button>
        {layer === "muscles" && (
          <button
            onClick={() => onToggleGroupExpansion(region.key)}
            aria-pressed={isExpanding}
            aria-label={`${isExpanding ? "Collapse" : "Expand"} ${region.label} in 3D view`}
            title={isExpanding ? "Collapse this region" : "Expand this region to separate its muscle groups"}
            className={cn(
              "rounded-control p-1",
              isExpanding ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-white hover:text-foreground"
            )}
          >
            <Expand className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
        <button
          onClick={() => onToggleVisibility(region.key)}
          aria-label={isHidden ? `Show ${region.label}` : `Hide ${region.label}`}
          title={isHidden ? "Show in 3D view" : "Hide in 3D view"}
          className="rounded-control p-1 text-fg-secondary hover:bg-white hover:text-foreground"
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />}
        </button>
      </div>

      {open && !muscleGroups && (
        <ul className="pb-1">
          {parts.map((part) => (
            <PartRow key={part.id} part={part} indent="pl-8" selected={selected} peelDepth={peelDepth} onSelect={onSelect} layer={layer} />
          ))}
        </ul>
      )}

      {open &&
        muscleGroups?.map((entry) => (
          <MuscleGroupSection
            key={entry.group.key}
            entry={entry}
            open={searching || expanded.has(muscleGroupRowKey(entry.group.key))}
            onToggle={() => onToggleExpanded(muscleGroupRowKey(entry.group.key))}
            selected={selected}
            peelDepth={peelDepth}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

interface MuscleGroupSectionProps {
  entry: MuscleGroupEntry;
  open: boolean;
  onToggle: () => void;
  selected: Set<string>;
  peelDepth: MuscleLayer;
  onSelect: (ids: string[], additive: boolean) => void;
}

const SIDES = [
  { side: "right", short: "R" },
  { side: "left", short: "L" },
] as const;

function MuscleGroupSection({ entry, open, onToggle, selected, peelDepth, onSelect }: MuscleGroupSectionProps) {
  const { group, parts } = entry;
  const allIds = parts.map((p) => p.id);
  const allSelected = allIds.every((id) => selected.has(id));
  const sides = SIDES.map(({ side, short }) => {
    const ids = parts.filter((p) => p.side === side).map((p) => p.id);
    return { side, short, ids, active: ids.length > 0 && ids.every((id) => selected.has(id)) };
  }).filter((s) => s.ids.length > 0);

  return (
    <div>
      <div className={cn("flex items-center gap-1 pl-5 pr-2", allSelected ? "bg-brand-subtle" : "hover:bg-surface-muted")}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Show"} ${group.label} muscles`}
          className="rounded-control p-0.5 text-fg-secondary hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} strokeWidth={1.75} />
        </button>
        <button
          onClick={(e) => onSelect(allIds, isAdditive(e))}
          title="Select this group on both sides"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[14px]",
            allSelected ? "text-brand" : "text-foreground hover:text-foreground"
          )}
        >
          <span className="truncate">{group.label}</span>
          <span className="shrink-0 text-[12px] text-fg-secondary">{parts.length}</span>
        </button>
        {sides.map(({ side, short, ids, active }) => (
          <button
            key={side}
            onClick={(e) => onSelect(ids, isAdditive(e))}
            aria-pressed={active}
            aria-label={`Select ${side} ${group.label}`}
            title={`Select ${side} side`}
            className={cn(
              "h-5 w-5 shrink-0 rounded-control text-[11px] font-medium",
              active ? "bg-brand text-white" : "bg-surface-muted text-fg-secondary hover:bg-brand-subtle hover:text-brand"
            )}
          >
            {short}
          </button>
        ))}
      </div>
      {open && (
        <ul className="pb-1">
          {parts.map((part) => (
            <PartRow key={part.id} part={part} indent="pl-12" selected={selected} peelDepth={peelDepth} onSelect={onSelect} layer="muscles" />
          ))}
        </ul>
      )}
    </div>
  );
}

interface PartRowProps {
  part: AnatomyPart;
  layer: AnatomyLayer;
  indent: string;
  selected: Set<string>;
  peelDepth: MuscleLayer;
  onSelect: (ids: string[], additive: boolean) => void;
}

function PartRow({ part, layer, indent, selected, peelDepth, onSelect }: PartRowProps) {
  const isSelected = selected.has(part.id);
  const peeled = layer === "muscles" && isPeeledAway(part, peelDepth);
  return (
    <li>
      <button
        data-part-id={part.id}
        onClick={(e) => onSelect([part.id], isAdditive(e))}
        className={cn(
          "flex w-full items-center gap-2 py-1 pr-3 text-left text-[14px] transition-colors",
          indent,
          isSelected
            ? "bg-brand-subtle text-brand"
            : peeled
              ? "text-fg-disabled hover:bg-surface-muted hover:text-fg-secondary"
              : "text-fg-secondary hover:bg-surface-muted hover:text-foreground"
        )}
        title={peeled ? "Peeled away — click to reveal this layer" : undefined}
      >
        <span className="flex-1 truncate">{part.label}</span>
        {part.layer && part.layer > 1 && (
          <span className="shrink-0 text-[11px] text-fg-muted">{layerLabel(part.layer)}</span>
        )}
        {part.short && (
          <span className="shrink-0 rounded-full bg-surface-muted px-1.5 font-mono text-[11px] text-fg-secondary">
            {part.short}
          </span>
        )}
      </button>
    </li>
  );
}

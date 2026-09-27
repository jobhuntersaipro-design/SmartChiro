import type { PartCallout } from "@/lib/anatomy/callout";

export function PartLabel({
  callout,
  bounds,
}: {
  callout: PartCallout;
  bounds: { width: number; height: number };
}) {
  const above = callout.y > 64;
  const left = Math.min(Math.max(callout.x, 88), Math.max(88, bounds.width - 88));
  const top = above ? callout.y : Math.min(callout.y + 14, Math.max(bounds.height - 36, 14));
  return (
    <div
      role="status"
      data-testid="anatomy-label"
      className="pointer-events-none absolute z-20 max-w-56 rounded-[4px] bg-[#0A2540] px-2.5 py-1.5 text-[14px] font-medium text-white shadow-md"
      style={{
        left,
        top,
        transform: above ? "translate(-50%, calc(-100% - 12px))" : "translate(-50%, 0)",
      }}
    >
      {callout.name}
    </div>
  );
}

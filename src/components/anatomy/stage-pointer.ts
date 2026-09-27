import type { PartCallout, PickHit } from "@/lib/anatomy/callout";

const TAP_SLOP = 10;

export function bindStagePointer(
  canvas: HTMLCanvasElement,
  pick: (event: PointerEvent) => PickHit | null,
  handlers: {
    onHover: (hit: PickHit | null, point: { x: number; y: number }) => void;
    onTap: (hit: PickHit | null, point: { x: number; y: number }) => void;
  },
): () => void {
  let down: { x: number; y: number; id: number } | null = null;

  function point(event: PointerEvent) {
    const host = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
    return { x: event.clientX - host.left, y: event.clientY - host.top };
  }

  function onMove(event: PointerEvent) {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    handlers.onHover(pick(event), point(event));
  }

  function onDown(event: PointerEvent) {
    down = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onUp(event: PointerEvent) {
    if (!down || down.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > TAP_SLOP) return;
    handlers.onTap(pick(event), point(event));
  }

  function onLeave(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const host = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
    handlers.onHover(null, { x: event.clientX - host.left, y: event.clientY - host.top });
  }

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}

export function calloutFrom(hit: PickHit | null, point: { x: number; y: number }): PartCallout | null {
  if (!hit) return null;
  return { name: hit.name, x: point.x, y: point.y };
}

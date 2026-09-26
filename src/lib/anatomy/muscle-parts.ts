import { MUSCLES } from "./muscles";

export interface MusclePart {
  id: string;
  name: string;
  side: "left" | "right";
  english: string;
  out: [number, number, number];
  path: Array<[number, number, number]>;
  width: number[];
  depth: number[];
}

export function muscleParts(): MusclePart[] {
  const parts: MusclePart[] = [];
  for (const template of MUSCLES) {
    for (const side of ["left", "right"] as const) {
      const sign = side === "left" ? 1 : -1;
      const sideName = side === "left" ? "Left" : "Right";
      parts.push({
        id: `${template.id}-${side}`,
        name: template.name,
        side,
        english: `${sideName} ${template.name}`,
        out: [template.out[0] * sign, template.out[1], template.out[2]],
        path: template.path.map(([x, y, z]) => [x * sign, y, z]),
        width: template.width,
        depth: template.depth,
      });
    }
  }
  return parts;
}

export const MUSCLE_COUNT = MUSCLES.length * 2;

import {
  DRAG_ZONE_BOTTOM,
  DRAG_ZONE_BOTTOM_LEFT,
  DRAG_ZONE_BOTTOM_RIGHT,
  DRAG_ZONE_LEFT,
  DRAG_ZONE_RIGHT,
  DRAG_ZONE_TOP,
  DRAG_ZONE_TOP_LEFT,
  DRAG_ZONE_TOP_RIGHT,
  type DragZonePreset,
} from "../types/index.ts";

/** Hot-zone bitmask composition for the Drag Corner Switcher V2 presets. */
export const PRESET_ZONE_MASKS: Record<DragZonePreset, number> = {
  topRight: DRAG_ZONE_TOP_RIGHT,
  allCorners: DRAG_ZONE_TOP_LEFT | DRAG_ZONE_TOP_RIGHT | DRAG_ZONE_BOTTOM_LEFT | DRAG_ZONE_BOTTOM_RIGHT,
  allEdges: DRAG_ZONE_TOP | DRAG_ZONE_LEFT | DRAG_ZONE_RIGHT | DRAG_ZONE_BOTTOM,
  all:
    DRAG_ZONE_TOP_LEFT |
    DRAG_ZONE_TOP_RIGHT |
    DRAG_ZONE_BOTTOM_LEFT |
    DRAG_ZONE_BOTTOM_RIGHT |
    DRAG_ZONE_TOP |
    DRAG_ZONE_LEFT |
    DRAG_ZONE_RIGHT |
    DRAG_ZONE_BOTTOM,
  custom: 0,
};

/** Match a zone bitmask back to the preset that produced it (else `custom`). */
export function maskToPreset(mask: number): DragZonePreset {
  if (mask === PRESET_ZONE_MASKS.topRight) return "topRight";
  if (mask === PRESET_ZONE_MASKS.allCorners) return "allCorners";
  if (mask === PRESET_ZONE_MASKS.allEdges) return "allEdges";
  if (mask === PRESET_ZONE_MASKS.all) return "all";
  return "custom";
}

export interface DragZoneDef {
  bit: number;
  label: string;
  cls: string;
}

/** The 8 hot zones in picker order (corners and edges, corner bits first). */
export const DRAG_ZONES: DragZoneDef[] = [
  { bit: DRAG_ZONE_TOP_LEFT, label: "Top-left corner", cls: "dz-tl" },
  { bit: DRAG_ZONE_TOP, label: "Top edge", cls: "dz-top" },
  { bit: DRAG_ZONE_TOP_RIGHT, label: "Top-right corner", cls: "dz-tr" },
  { bit: DRAG_ZONE_LEFT, label: "Left edge", cls: "dz-left" },
  { bit: DRAG_ZONE_RIGHT, label: "Right edge", cls: "dz-right" },
  { bit: DRAG_ZONE_BOTTOM_LEFT, label: "Bottom-left corner", cls: "dz-bl" },
  { bit: DRAG_ZONE_BOTTOM, label: "Bottom edge", cls: "dz-bottom" },
  { bit: DRAG_ZONE_BOTTOM_RIGHT, label: "Bottom-right corner", cls: "dz-br" },
];

/** Zones that are active (bit set) for a given mask, in picker order. */
export function activeZones(mask: number): DragZoneDef[] {
  return DRAG_ZONES.filter((z) => (mask & z.bit) !== 0);
}

/** Toggle a single zone bit on/off. */
export function toggleZone(mask: number, bit: number): number {
  return (mask & bit) !== 0 ? mask & ~bit : mask | bit;
}

/** Add a zone bit (idempotent). */
export function addZone(mask: number, bit: number): number {
  return mask | bit;
}

/** Remove a zone bit (idempotent). */
export function removeZone(mask: number, bit: number): number {
  return mask & ~bit;
}

/** Zones are identical if every corner/edge bit matches. */
export function sameZones(a: number, b: number): boolean {
  return a === b;
}

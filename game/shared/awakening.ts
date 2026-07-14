import type { AwakenedCombatPath, GridPosition } from "./types";

/** Stable identifier shared by the renderer and the authoritative realm. */
export const HEADQUARTERS_MASTER_ID = "headquarters-master" as const;

/**
 * The master currently stands on the first walkable tile east of the QG.
 * Keeping this position outside the Phaser scene prevents client/server drift.
 */
export const HEADQUARTERS_MASTER_POSITION: Readonly<GridPosition> = {
  x: 15,
  y: 13,
};

export const AWAKENING_MASTERY_POINTS = 25;

export const AWAKENING_CLASS_NAMES: Readonly<Record<AwakenedCombatPath, string>> = {
  melee: "Épéiste",
  ranged: "Archer",
  magic: "Magicien",
};

export function awakeningClassName(path: AwakenedCombatPath): string {
  return AWAKENING_CLASS_NAMES[path];
}

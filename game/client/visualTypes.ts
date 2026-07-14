/** Shared names and dimensions for the procedural pixel-art pack. */

export const TILE_SIZE = 32;
export const ADVENTURER_FRAME = { width: 48, height: 64 } as const;

export const CARDINAL_DIRECTIONS = ["down", "left", "right", "up"] as const;
export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number];

export const ADVENTURER_ACTIONS = ["idle", "walk", "attack"] as const;
export type AdventurerAction = (typeof ADVENTURER_ACTIONS)[number];

export const ADVENTURER_FRAME_COUNTS: Readonly<Record<AdventurerAction, number>> = {
  idle: 2,
  walk: 4,
  attack: 3,
};

export const CREATURE_KINDS = ["slime", "boar", "wolf", "corrupted", "boss"] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export const CREATURE_FRAME_COUNTS: Readonly<Record<CreatureKind, number>> = {
  slime: 3,
  boar: 2,
  wolf: 2,
  corrupted: 2,
  boss: 3,
};

/**
 * Stable one-frame texture keys. All textures are created by AssetFactory and
 * need no network request.
 */
export const VISUAL_KEYS = {
  terrain: {
    grass: "terrain-grass",
    grassAlt: "terrain-grass-alt",
    dirt: "terrain-dirt",
    path: "terrain-path",
    cobble: "terrain-cobble",
    water: "terrain-water",
    riftGround: "terrain-rift-ground",
  },
  props: {
    rock: "prop-rock",
    tree: "prop-tree",
    pine: "prop-pine",
    bush: "prop-bush",
    fence: "prop-fence",
    sign: "prop-sign",
    lantern: "prop-lantern",
    hqWall: "building-hq-wall",
    hqRoof: "building-hq-roof",
    hqDoor: "building-hq-door",
    hqWindow: "building-hq-window",
  },
  effects: {
    selection: "fx-selection",
    destination: "fx-destination",
    hit: "fx-hit",
    loot: "loot-drop",
  },
} as const;

/** Returns a frame key such as `adventurer-down-walk-2`. */
export function adventurerTextureKey(
  direction: CardinalDirection,
  action: AdventurerAction = "idle",
  frame = 0,
): string {
  return `adventurer-${direction}-${action}-${frame}`;
}

/** Returns a frame key such as `monster-corrupted-1`. */
export function creatureTextureKey(kind: CreatureKind, frame = 0): string {
  return `monster-${kind}-${frame}`;
}

/** Returns a portal frame key such as `portal-rift-2`. */
export function portalTextureKey(frame = 0): string {
  return `portal-rift-${frame}`;
}

/** Phaser animation names registered by `createVisualAnimations`. */
export const VISUAL_ANIMATIONS = {
  adventurer: (direction: CardinalDirection, action: AdventurerAction) =>
    `anim-adventurer-${direction}-${action}`,
  creature: (kind: CreatureKind) => `anim-monster-${kind}`,
  portal: "anim-portal-rift",
} as const;

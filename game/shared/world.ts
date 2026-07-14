import { createCollisionGrid, positionKey } from "./grid";
import type { GridPosition, MonsterBehaviour, PublicMapDefinition } from "./types";

export type WorldLandmarkKind =
  | "headquarters"
  | "inn"
  | "forge"
  | "fountain"
  | "bridge"
  | "portal";

export interface WorldLandmark {
  id: string;
  kind: WorldLandmarkKind;
  name: string;
  position: GridPosition;
  width: number;
  height: number;
  /** Dungeon difficulty displayed by portals. Other landmarks omit it. */
  rank?: WorldRiftRank;
}

export const WORLD_RIFT_RANKS = ["E", "D", "C", "B", "A", "S"] as const;
export type WorldRiftRank = (typeof WORLD_RIFT_RANKS)[number];

export interface WorldRegion {
  id: string;
  name: string;
  rank: WorldRiftRank;
  position: GridPosition;
  width: number;
  height: number;
  tint: number;
}

export interface MonsterDefinition {
  id: string;
  species: string;
  name: string;
  behaviour: MonsterBehaviour;
  spawn: GridPosition;
  level: number;
  maxHp: number;
  defense: number;
  attackDamage: number;
  detectionRange: number;
  leashRange: number;
  moveIntervalMs: number;
  attackIntervalMs: number;
  respawnMs: number;
  xpReward: number;
  lootItemId: string;
  lootChance: number;
  isBoss?: boolean;
}

function border(width: number, height: number): GridPosition[] {
  const positions: GridPosition[] = [];
  for (let x = 0; x < width; x += 1) {
    positions.push({ x, y: 0 }, { x, y: height - 1 });
  }
  for (let y = 1; y < height - 1; y += 1) {
    positions.push({ x: 0, y }, { x: width - 1, y });
  }
  return positions;
}

function rectangle(x: number, y: number, width: number, height: number): GridPosition[] {
  const positions: GridPosition[] = [];
  for (let offsetY = 0; offsetY < height; offsetY += 1) {
    for (let offsetX = 0; offsetX < width; offsetX += 1) {
      positions.push({ x: x + offsetX, y: y + offsetY });
    }
  }
  return positions;
}

function verticalLine(x: number, fromY: number, toY: number): GridPosition[] {
  const positions: GridPosition[] = [];
  for (let y = fromY; y <= toY; y += 1) positions.push({ x, y });
  return positions;
}

export const WORLD_WIDTH = 112;
export const WORLD_HEIGHT = 72;
export const WORLD_TILE_SIZE = 32;

/**
 * Six readable open-world biomes. They deliberately overlap at their edges so
 * players never hit an invisible corridor when travelling between ranks.
 */
export const WORLD_REGIONS: readonly WorldRegion[] = [
  {
    id: "prairies-eveillees",
    name: "Prairies éveillées",
    rank: "E",
    position: { x: 32, y: 1 },
    width: 32,
    height: 46,
    tint: 0x5f8154,
  },
  {
    id: "bois-ambre",
    name: "Bois d’Ambre",
    rank: "D",
    position: { x: 64, y: 1 },
    width: 22,
    height: 25,
    tint: 0x8c7044,
  },
  {
    id: "marais-cendre",
    name: "Marais de Cendre",
    rank: "C",
    position: { x: 86, y: 1 },
    width: 25,
    height: 25,
    tint: 0x5f6e6b,
  },
  {
    id: "plateaux-brises",
    name: "Plateaux Brisés",
    rank: "B",
    position: { x: 64, y: 26 },
    width: 22,
    height: 25,
    tint: 0x755747,
  },
  {
    id: "lande-eclipse",
    name: "Lande de l’Éclipse",
    rank: "A",
    position: { x: 86, y: 26 },
    width: 25,
    height: 25,
    tint: 0x4b4965,
  },
  {
    id: "frontiere-abyssale",
    name: "Frontière Abyssale",
    rank: "S",
    position: { x: 64, y: 51 },
    width: 47,
    height: 20,
    tint: 0x3d355d,
  },
];

/**
 * Stable semantic anchors shared by Phaser and the authoritative simulation.
 * Buildings occupy their full footprint; their doors sit on adjacent walkable
 * road tiles. The bridge is the main route from the city to the hunting field.
 */
export const STARTER_LANDMARKS: readonly WorldLandmark[] = [
  {
    id: "qg-chasseurs",
    kind: "headquarters",
    name: "Quartier général",
    position: { x: 5, y: 5 },
    width: 10,
    height: 7,
  },
  {
    id: "auberge-aube",
    kind: "inn",
    name: "Auberge de l'Aube",
    position: { x: 19, y: 7 },
    width: 7,
    height: 5,
  },
  {
    id: "forge-arden",
    kind: "forge",
    name: "Forge d'Arden",
    position: { x: 5, y: 20 },
    width: 8,
    height: 6,
  },
  {
    id: "fontaine-centrale",
    kind: "fountain",
    name: "Fontaine des Éveillés",
    position: { x: 18, y: 20 },
    width: 3,
    height: 3,
  },
  {
    id: "pont-est",
    kind: "bridge",
    name: "Pont des Prairies",
    position: { x: 30, y: 24 },
    width: 2,
    height: 4,
  },
  {
    id: "faille-nord-est",
    kind: "portal",
    name: "Faille des Prairies",
    position: { x: 54, y: 8 },
    width: 3,
    height: 3,
    rank: "E",
  },
  {
    id: "faille-bois-ambre",
    kind: "portal",
    name: "Faille d’Ambre",
    position: { x: 72, y: 12 },
    width: 3,
    height: 3,
    rank: "D",
  },
  {
    id: "faille-marais-cendre",
    kind: "portal",
    name: "Faille de Cendre",
    position: { x: 96, y: 12 },
    width: 3,
    height: 3,
    rank: "C",
  },
  {
    id: "faille-plateaux-brises",
    kind: "portal",
    name: "Faille des Plateaux",
    position: { x: 73, y: 38 },
    width: 3,
    height: 3,
    rank: "B",
  },
  {
    id: "faille-lande-eclipse",
    kind: "portal",
    name: "Faille de l’Éclipse",
    position: { x: 96, y: 40 },
    width: 3,
    height: 3,
    rank: "A",
  },
  {
    id: "faille-frontiere-abyssale",
    kind: "portal",
    name: "Faille Abyssale",
    position: { x: 88, y: 61 },
    width: 3,
    height: 3,
    rank: "S",
  },
];

const cityBuildings = STARTER_LANDMARKS.filter((landmark) =>
  ["headquarters", "inn", "forge", "fountain"].includes(landmark.kind),
).flatMap((landmark) =>
  rectangle(landmark.position.x, landmark.position.y, landmark.width, landmark.height),
);

// A shallow river separates the west city from the east field. Four tiles are
// left open for the bridge, so the two halves always remain connected.
const river = [
  ...verticalLine(30, 1, 23),
  ...verticalLine(31, 1, 23),
  ...verticalLine(30, 28, WORLD_HEIGHT - 2),
  ...verticalLine(31, 28, WORLD_HEIGHT - 2),
];

/** Every blocked wilderness tile; the renderer uses the same list to avoid invisible walls. */
export const WORLD_FIELD_OBSTACLES: readonly GridPosition[] = [
  ...rectangle(39, 7, 3, 2),
  ...rectangle(46, 15, 2, 3),
  ...rectangle(57, 31, 3, 2),
  ...rectangle(36, 39, 4, 2),
  { x: 37, y: 20 },
  { x: 38, y: 20 },
  { x: 43, y: 28 },
  { x: 49, y: 37 },
  { x: 50, y: 37 },
  { x: 59, y: 18 },
  ...rectangle(67, 5, 3, 2),
  ...rectangle(78, 17, 4, 2),
  ...rectangle(89, 6, 3, 3),
  ...rectangle(103, 18, 4, 2),
  ...rectangle(68, 31, 3, 3),
  ...rectangle(79, 43, 4, 2),
  ...rectangle(90, 31, 4, 2),
  ...rectangle(103, 43, 3, 3),
  ...rectangle(68, 57, 4, 2),
  ...rectangle(99, 59, 4, 3),
  { x: 74, y: 21 },
  { x: 83, y: 8 },
  { x: 92, y: 20 },
  { x: 107, y: 10 },
  { x: 66, y: 46 },
  { x: 82, y: 29 },
  { x: 89, y: 47 },
  { x: 106, y: 34 },
  { x: 78, y: 64 },
  { x: 106, y: 66 },
];

function portalStandingStones(position: GridPosition): GridPosition[] {
  return [
    { x: position.x - 2, y: position.y - 1 },
    { x: position.x - 1, y: position.y - 2 },
    { x: position.x + 1, y: position.y - 2 },
    { x: position.x + 2, y: position.y - 1 },
    { x: position.x - 2, y: position.y + 1 },
    { x: position.x + 2, y: position.y + 1 },
  ];
}

// Standing stones frame every portal while its centre and southern approach stay walkable.
const portalStones = STARTER_LANDMARKS.filter(
  (landmark) => landmark.kind === "portal",
).flatMap((landmark) => portalStandingStones(landmark.position));

const collision = createCollisionGrid(WORLD_WIDTH, WORLD_HEIGHT, [
  ...border(WORLD_WIDTH, WORLD_HEIGHT),
  ...cityBuildings,
  ...river,
  ...WORLD_FIELD_OBSTACLES,
  ...portalStones,
]);

export const STARTER_MAP: PublicMapDefinition = {
  id: "val-d-aube",
  name: "Val d'Aube",
  tileSize: WORLD_TILE_SIZE,
  width: collision.width,
  height: collision.height,
  blocked: collision.blocked,
  playerSpawn: { x: 17, y: 27 },
};

export const STARTER_MONSTERS: readonly MonsterDefinition[] = [
  {
    id: "slime-01",
    species: "slime",
    name: "Gélatine des prés",
    behaviour: "defensive",
    spawn: { x: 38, y: 27 },
    level: 1,
    maxHp: 34,
    defense: 1,
    attackDamage: 7,
    detectionRange: 0,
    leashRange: 5,
    moveIntervalMs: 650,
    attackIntervalMs: 1_200,
    respawnMs: 5_000,
    xpReward: 28,
    lootItemId: "gelee-claire",
    lootChance: 0.65,
  },
  {
    id: "slime-02",
    species: "slime",
    name: "Gélatine des prés",
    behaviour: "defensive",
    spawn: { x: 41, y: 34 },
    level: 1,
    maxHp: 34,
    defense: 1,
    attackDamage: 7,
    detectionRange: 0,
    leashRange: 5,
    moveIntervalMs: 650,
    attackIntervalMs: 1_200,
    respawnMs: 5_000,
    xpReward: 28,
    lootItemId: "gelee-claire",
    lootChance: 0.65,
  },
  {
    id: "boar-01",
    species: "boar",
    name: "Sanglier moussu",
    behaviour: "defensive",
    spawn: { x: 49, y: 29 },
    level: 2,
    maxHp: 58,
    defense: 3,
    attackDamage: 12,
    detectionRange: 0,
    leashRange: 8,
    moveIntervalMs: 520,
    attackIntervalMs: 1_100,
    respawnMs: 7_000,
    xpReward: 48,
    lootItemId: "defense-de-sanglier",
    lootChance: 0.4,
  },
  {
    id: "boar-02",
    species: "boar",
    name: "Sanglier moussu",
    behaviour: "defensive",
    spawn: { x: 54, y: 39 },
    level: 2,
    maxHp: 58,
    defense: 3,
    attackDamage: 12,
    detectionRange: 0,
    leashRange: 8,
    moveIntervalMs: 520,
    attackIntervalMs: 1_100,
    respawnMs: 7_000,
    xpReward: 48,
    lootItemId: "defense-de-sanglier",
    lootChance: 0.4,
  },
  {
    id: "wolf-01",
    species: "wolf",
    name: "Loup des failles",
    behaviour: "aggressive",
    spawn: { x: 56, y: 22 },
    level: 3,
    maxHp: 72,
    defense: 4,
    attackDamage: 15,
    detectionRange: 6,
    leashRange: 10,
    moveIntervalMs: 430,
    attackIntervalMs: 950,
    respawnMs: 8_000,
    xpReward: 65,
    lootItemId: "croc-de-faille",
    lootChance: 0.3,
  },
  {
    id: "warg-ambre-01",
    species: "amber-warg",
    name: "Warg d’Ambre",
    behaviour: "aggressive",
    spawn: { x: 68, y: 18 },
    level: 5,
    maxHp: 118,
    defense: 7,
    attackDamage: 22,
    detectionRange: 6,
    leashRange: 11,
    moveIntervalMs: 410,
    attackIntervalMs: 930,
    respawnMs: 10_000,
    xpReward: 96,
    lootItemId: "resine-ambre",
    lootChance: 0.62,
  },
  {
    id: "scarabee-ambre-01",
    species: "amber-scarab",
    name: "Scarabée résineux",
    behaviour: "defensive",
    spawn: { x: 80, y: 10 },
    level: 6,
    maxHp: 142,
    defense: 10,
    attackDamage: 25,
    detectionRange: 0,
    leashRange: 8,
    moveIntervalMs: 570,
    attackIntervalMs: 1_050,
    respawnMs: 11_000,
    xpReward: 115,
    lootItemId: "resine-ambre",
    lootChance: 0.72,
  },
  {
    id: "gelatine-cendre-01",
    species: "ash-slime",
    name: "Gélatine de cendre",
    behaviour: "defensive",
    spawn: { x: 90, y: 16 },
    level: 8,
    maxHp: 205,
    defense: 14,
    attackDamage: 32,
    detectionRange: 0,
    leashRange: 9,
    moveIntervalMs: 530,
    attackIntervalMs: 1_000,
    respawnMs: 13_000,
    xpReward: 168,
    lootItemId: "cendre-mana",
    lootChance: 0.64,
  },
  {
    id: "molosse-cendre-01",
    species: "ash-hound",
    name: "Molosse de cendre",
    behaviour: "aggressive",
    spawn: { x: 104, y: 12 },
    level: 9,
    maxHp: 232,
    defense: 16,
    attackDamage: 37,
    detectionRange: 7,
    leashRange: 12,
    moveIntervalMs: 385,
    attackIntervalMs: 880,
    respawnMs: 14_000,
    xpReward: 195,
    lootItemId: "cendre-mana",
    lootChance: 0.58,
  },
  {
    id: "sanglier-basalte-01",
    species: "basalt-boar",
    name: "Sanglier de basalte",
    behaviour: "defensive",
    spawn: { x: 69, y: 42 },
    level: 12,
    maxHp: 330,
    defense: 23,
    attackDamage: 48,
    detectionRange: 0,
    leashRange: 10,
    moveIntervalMs: 500,
    attackIntervalMs: 1_000,
    respawnMs: 16_000,
    xpReward: 275,
    lootItemId: "coeur-basalte",
    lootChance: 0.62,
  },
  {
    id: "traqueur-plateaux-01",
    species: "cliff-stalker",
    name: "Traqueur des plateaux",
    behaviour: "aggressive",
    spawn: { x: 81, y: 34 },
    level: 13,
    maxHp: 355,
    defense: 25,
    attackDamage: 54,
    detectionRange: 7,
    leashRange: 13,
    moveIntervalMs: 360,
    attackIntervalMs: 840,
    respawnMs: 17_000,
    xpReward: 310,
    lootItemId: "coeur-basalte",
    lootChance: 0.54,
  },
  {
    id: "spectre-eclipse-01",
    species: "eclipse-wraith",
    name: "Spectre d’éclipse",
    behaviour: "aggressive",
    spawn: { x: 90, y: 44 },
    level: 17,
    maxHp: 490,
    defense: 34,
    attackDamage: 72,
    detectionRange: 8,
    leashRange: 14,
    moveIntervalMs: 340,
    attackIntervalMs: 800,
    respawnMs: 20_000,
    xpReward: 430,
    lootItemId: "eclat-eclipse",
    lootChance: 0.52,
  },
  {
    id: "gelatine-void-01",
    species: "void-slime",
    name: "Gélatine du vide",
    behaviour: "defensive",
    spawn: { x: 104, y: 36 },
    level: 18,
    maxHp: 540,
    defense: 38,
    attackDamage: 78,
    detectionRange: 0,
    leashRange: 11,
    moveIntervalMs: 460,
    attackIntervalMs: 940,
    respawnMs: 21_000,
    xpReward: 475,
    lootItemId: "eclat-eclipse",
    lootChance: 0.6,
  },
  {
    id: "gueule-abyssale-01",
    species: "abyssal-maw",
    name: "Gueule abyssale",
    behaviour: "aggressive",
    spawn: { x: 75, y: 62 },
    level: 23,
    maxHp: 760,
    defense: 52,
    attackDamage: 104,
    detectionRange: 9,
    leashRange: 15,
    moveIntervalMs: 320,
    attackIntervalMs: 760,
    respawnMs: 25_000,
    xpReward: 690,
    lootItemId: "fragment-abyssal",
    lootChance: 0.56,
  },
  {
    id: "sentinelle-abyssale-01",
    species: "abyssal-sentinel",
    name: "Sentinelle abyssale",
    behaviour: "aggressive",
    spawn: { x: 104, y: 64 },
    level: 25,
    maxHp: 1_180,
    defense: 68,
    attackDamage: 126,
    detectionRange: 10,
    leashRange: 17,
    moveIntervalMs: 350,
    attackIntervalMs: 820,
    respawnMs: 35_000,
    xpReward: 980,
    lootItemId: "fragment-abyssal",
    lootChance: 0.82,
    isBoss: true,
  },
];

const importantTiles = [
  STARTER_MAP.playerSpawn,
  ...STARTER_LANDMARKS.filter((landmark) => landmark.kind === "portal").map(
    (landmark) => landmark.position,
  ),
  ...STARTER_MONSTERS.map((monster) => monster.spawn),
];

if (importantTiles.some((position) => STARTER_MAP.blocked.includes(positionKey(position)))) {
  throw new Error("The shared starter world contains a blocked spawn or portal tile.");
}

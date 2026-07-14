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

export const WORLD_WIDTH = 64;
export const WORLD_HEIGHT = 48;
export const WORLD_TILE_SIZE = 32;

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
    name: "Faille instable",
    position: { x: 54, y: 8 },
    width: 3,
    height: 3,
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

const fieldObstacles: GridPosition[] = [
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
];

// Standing stones frame the portal while its centre and southern approach stay walkable.
const portalStones: GridPosition[] = [
  { x: 52, y: 7 },
  { x: 53, y: 6 },
  { x: 55, y: 6 },
  { x: 56, y: 7 },
  { x: 52, y: 9 },
  { x: 56, y: 9 },
];

const collision = createCollisionGrid(WORLD_WIDTH, WORLD_HEIGHT, [
  ...border(WORLD_WIDTH, WORLD_HEIGHT),
  ...cityBuildings,
  ...river,
  ...fieldObstacles,
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
    id: "guardian-01",
    species: "rift-guardian",
    name: "Gardien fissuré",
    behaviour: "aggressive",
    spawn: { x: 54, y: 12 },
    level: 5,
    maxHp: 220,
    defense: 8,
    attackDamage: 22,
    detectionRange: 5,
    leashRange: 8,
    moveIntervalMs: 520,
    attackIntervalMs: 1_250,
    respawnMs: 20_000,
    xpReward: 180,
    lootItemId: "fragment-de-faille",
    lootChance: 1,
    isBoss: true,
  },
];

const importantTiles = [
  STARTER_MAP.playerSpawn,
  { x: 54, y: 8 },
  ...STARTER_MONSTERS.map((monster) => monster.spawn),
];

if (importantTiles.some((position) => STARTER_MAP.blocked.includes(positionKey(position)))) {
  throw new Error("The shared starter world contains a blocked spawn or portal tile.");
}

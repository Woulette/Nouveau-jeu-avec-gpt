export type EntityId = string;

export interface GridPosition {
  x: number;
  y: number;
}

export type Direction = "north" | "south" | "east" | "west";
export type PlayerRank = "E" | "D" | "C" | "B" | "A" | "S" | "SS" | "SSS" | "OMEGA";
export type CombatPath = "adventurer" | "melee" | "ranged" | "magic";
export type MonsterBehaviour = "passive" | "defensive" | "aggressive";
export type EquipmentSlot = "head" | "weapon" | "armor" | "legs" | "boots" | "ring";

export interface InventoryEntrySnapshot {
  itemId: string;
  quantity: number;
}

export type EquipmentSnapshot = Record<EquipmentSlot, string | null>;

export interface CollisionGrid {
  width: number;
  height: number;
  blocked: readonly string[];
}

export interface PublicMapDefinition extends CollisionGrid {
  id: string;
  name: string;
  tileSize: number;
  playerSpawn: GridPosition;
}

export interface MasterySnapshot {
  level: number;
  xp: number;
  xpToNext: number;
}

export interface PlayerMasteries {
  melee: MasterySnapshot;
  ranged: MasterySnapshot;
  magic: MasterySnapshot;
  defense: MasterySnapshot;
}

export interface PlayerSnapshot {
  id: EntityId;
  name: string;
  position: GridPosition;
  direction: Direction;
  moving: boolean;
  alive: boolean;
  targetId: EntityId | null;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  xp: number;
  xpToNext: number;
  /** Null until the level-10 awakening is deliberately completed at headquarters. */
  rank: PlayerRank | null;
  awakened: boolean;
  awakeningEligible: boolean;
  combatPath: CombatPath;
  className: string;
  power: number;
  /** Display stat. Movement timing will be connected to it in a later balance pass. */
  speed: number;
  masteries: PlayerMasteries;
  inventory: InventoryEntrySnapshot[];
  equipment: EquipmentSnapshot;
}

export interface MonsterSnapshot {
  id: EntityId;
  species: string;
  name: string;
  behaviour: MonsterBehaviour;
  position: GridPosition;
  direction: Direction;
  moving: boolean;
  alive: boolean;
  targetId: EntityId | null;
  hp: number;
  maxHp: number;
  level: number;
  isBoss: boolean;
  moveIntervalMs: number;
}

export interface RealmSnapshot {
  zoneId: string;
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
  monsters: MonsterSnapshot[];
}

export type GameEvent =
  | {
      type: "damage";
      sourceId: EntityId;
      targetId: EntityId;
      amount: number;
      remainingHp: number;
    }
  | {
      type: "death";
      entityId: EntityId;
      killerId: EntityId | null;
    }
  | {
      type: "respawn";
      entityId: EntityId;
      position: GridPosition;
    }
  | {
      type: "xp";
      playerId: EntityId;
      general: number;
      mastery: "melee" | "ranged" | "magic" | "defense" | null;
      masteryXp: number;
    }
  | {
      type: "level-up";
      playerId: EntityId;
      level: number;
    }
  | {
      type: "loot";
      playerId: EntityId;
      itemId: string;
      quantity: number;
    };

export type ServerMessage =
  | {
      type: "welcome";
      playerId: EntityId;
      resumeToken: string;
      tickRate: number;
      snapshotRate: number;
      map: PublicMapDefinition;
      snapshot: RealmSnapshot;
    }
  | { type: "snapshot"; snapshot: RealmSnapshot }
  | { type: "event"; event: GameEvent }
  | { type: "error"; code: string; message: string; sequence?: number }
  | { type: "pong"; clientTime: number; serverTime: number };

export function clonePosition(position: GridPosition): GridPosition {
  return { x: position.x, y: position.y };
}

export function samePosition(a: GridPosition, b: GridPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

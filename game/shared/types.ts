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
  /** Persistent soft currency displayed in the inventory wallet. */
  gold: number;
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

export interface RiftSnapshot {
  id: string;
  rank: "E";
  position: GridPosition;
  spawnedAt: number;
  expiresAt: number;
  status: "open" | "boss-escaped";
  /** True while the escaped guardian must be killed in the open world. */
  outsideBossAlive: boolean;
}

export interface RiftRunSnapshot {
  instanceId: string;
  riftId: string;
  rank: "E";
  startedAt: number;
  room: 1 | 2 | 3;
  totalRooms: 3;
  roomCleared: boolean;
}

export interface RealmSnapshot {
  zoneId: string;
  zoneKind: "world" | "rift";
  map: PublicMapDefinition;
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
  monsters: MonsterSnapshot[];
  rifts: RiftSnapshot[];
  riftRun: RiftRunSnapshot | null;
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
    }
  | {
      type: "item-used";
      playerId: EntityId;
      itemId: string;
      quantity: number;
      effectAmount: number;
    }
  | {
      type: "rift-room-cleared";
      playerId: EntityId;
      riftId: string;
      room: 1 | 2 | 3;
      nextRoom: 2 | 3 | null;
    }
  | {
      type: "rift-boss-escaped";
      riftId: string;
      bossId: EntityId;
    }
  | {
      type: "rift-outside-boss-defeated";
      riftId: string;
      playerId: EntityId;
    }
  | {
      type: "rift-complete";
      playerId: EntityId;
      riftId: string;
      rank: "E";
      elapsedMs: number;
      generalXp: number;
      items: Array<{ itemId: string; quantity: number }>;
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

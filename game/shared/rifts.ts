import { createCollisionGrid } from "./grid";
import type { GridPosition, PublicMapDefinition } from "./types";

export const RIFT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const RIFT_SPAWN_MIN_DELAY_MS = 15 * 60 * 1_000;
export const RIFT_SPAWN_MAX_DELAY_MS = 45 * 60 * 1_000;

export const RIFT_MAP_WIDTH = 52;
export const RIFT_MAP_HEIGHT = 19;
export const RIFT_ROOM_ENTRANCES = [4, 20, 38] as const;
export const RIFT_ROOM_GATES = [17, 35] as const;

function riftBorder(): GridPosition[] {
  const blocked: GridPosition[] = [];
  for (let x = 0; x < RIFT_MAP_WIDTH; x += 1) {
    blocked.push({ x, y: 0 }, { x, y: RIFT_MAP_HEIGHT - 1 });
  }
  for (let y = 1; y < RIFT_MAP_HEIGHT - 1; y += 1) {
    blocked.push({ x: 0, y }, { x: RIFT_MAP_WIDTH - 1, y });
  }
  return blocked;
}

const riftCollision = createCollisionGrid(RIFT_MAP_WIDTH, RIFT_MAP_HEIGHT, [
  ...riftBorder(),
  { x: 8, y: 5 },
  { x: 8, y: 13 },
  { x: 26, y: 4 },
  { x: 26, y: 14 },
  { x: 44, y: 4 },
  { x: 44, y: 14 },
]);

/** A long three-room corridor. Authoritative room gates are enforced by the realm. */
export const RIFT_MAP: PublicMapDefinition = {
  id: "faille-e-interieur",
  name: "Faille dimensionnelle · Rang E",
  tileSize: 32,
  width: riftCollision.width,
  height: riftCollision.height,
  blocked: riftCollision.blocked,
  playerSpawn: { x: RIFT_ROOM_ENTRANCES[0], y: 9 },
};

export const RIFT_SPAWN_LOCATIONS: readonly RiftSpawnLocation[] = [
  { id: "nord-est", position: { x: 54, y: 8 } },
  { id: "prairie-centrale", position: { x: 43, y: 23 } },
  { id: "prairie-sud", position: { x: 54, y: 36 } },
] as const;

export type RiftRank = "E";
export type RiftStatus = "open" | "boss-escaped";

export interface RankERift {
  readonly id: string;
  readonly rank: "E";
  readonly position: GridPosition;
  readonly spawnedAt: number;
  readonly expiresAt: number;
  readonly status: RiftStatus;
}

export interface RiftTiming {
  /** Real age since spawning. It keeps growing after the deadline. */
  readonly ageMs: number;
  /** Time before the boss escapes, clamped to zero. */
  readonly remainingMs: number;
  readonly deadlineReached: boolean;
}

export interface RiftSpawnLocation {
  readonly id: string;
  readonly position: GridPosition;
}

export type RiftRandom = () => number;

export interface NextRankERiftInput {
  readonly previous: RankERift;
  readonly locations: readonly RiftSpawnLocation[];
  readonly spawnedAt: number;
  readonly random: RiftRandom;
  /** Optional authoritative id. A deterministic id is generated when omitted. */
  readonly id?: string;
}

export const RIFT_INSTANCE_ROOMS = [
  { number: 1, kind: "wave" },
  { number: 2, kind: "wave" },
  { number: 3, kind: "boss" },
] as const;

export type RiftRoomNumber = (typeof RIFT_INSTANCE_ROOMS)[number]["number"];
export type RiftRoomKind = (typeof RIFT_INSTANCE_ROOMS)[number]["kind"];

export interface RiftItemReward {
  readonly itemId: string;
  readonly quantity: number;
}

/** Fully normalized rewards accumulated during an instance. */
export interface RiftRewardSummary {
  readonly generalXp: number;
  readonly masteryXp: number;
  readonly items: readonly RiftItemReward[];
}

/** Rewards granted by one room before normalization and aggregation. */
export interface RiftRoomRewards {
  readonly generalXp?: number;
  readonly masteryXp?: number;
  readonly items?: readonly RiftItemReward[];
}

export interface ClearedRiftRoom {
  readonly number: RiftRoomNumber;
  readonly kind: RiftRoomKind;
  readonly clearedAt: number;
}

export interface RiftInstance {
  readonly id: string;
  readonly riftId: string;
  readonly rank: "E";
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly clearedRooms: readonly ClearedRiftRoom[];
  readonly rewards: RiftRewardSummary;
}

export interface CompleteRiftRoomInput {
  /** Guards against duplicated or out-of-order room completion commands. */
  readonly room: RiftRoomNumber;
  readonly clearedAt: number;
  readonly rewards?: RiftRoomRewards;
}

export interface RiftInstanceSummary {
  readonly instanceId: string;
  readonly riftId: string;
  readonly rank: "E";
  readonly completed: boolean;
  readonly roomsCleared: number;
  readonly totalRooms: 3;
  readonly currentRoom: (typeof RIFT_INSTANCE_ROOMS)[number] | null;
  readonly durationMs: number;
  readonly rewards: RiftRewardSummary;
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty.`);
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function cloneGridPosition(position: GridPosition): GridPosition {
  if (!Number.isInteger(position.x) || !Number.isInteger(position.y)) {
    throw new RangeError("Rift positions must use integer grid coordinates.");
  }
  return { x: position.x, y: position.y };
}

function sameGridPosition(a: GridPosition, b: GridPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function assertRewardAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function normalizedRoomRewards(rewards: RiftRoomRewards = {}): RiftRewardSummary {
  const generalXp = rewards.generalXp ?? 0;
  const masteryXp = rewards.masteryXp ?? 0;
  assertRewardAmount(generalXp, "generalXp");
  assertRewardAmount(masteryXp, "masteryXp");

  const items = new Map<string, number>();
  for (const reward of rewards.items ?? []) {
    assertIdentifier(reward.itemId, "itemId");
    if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
      throw new RangeError("Item reward quantities must be positive safe integers.");
    }
    items.set(reward.itemId, (items.get(reward.itemId) ?? 0) + reward.quantity);
  }

  return {
    generalXp,
    masteryXp,
    items: [...items].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

function mergeRewards(
  current: RiftRewardSummary,
  addition: RiftRoomRewards | undefined,
): RiftRewardSummary {
  const normalized = normalizedRoomRewards(addition);
  const items = new Map(current.items.map((reward) => [reward.itemId, reward.quantity]));
  for (const reward of normalized.items) {
    items.set(reward.itemId, (items.get(reward.itemId) ?? 0) + reward.quantity);
  }
  return {
    generalXp: current.generalXp + normalized.generalXp,
    masteryXp: current.masteryXp + normalized.masteryXp,
    items: [...items].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

export function createRankERift(input: {
  readonly id: string;
  readonly position: GridPosition;
  readonly spawnedAt: number;
}): RankERift {
  assertIdentifier(input.id, "Rift id");
  assertTimestamp(input.spawnedAt, "spawnedAt");
  return {
    id: input.id,
    rank: "E",
    position: cloneGridPosition(input.position),
    spawnedAt: input.spawnedAt,
    expiresAt: input.spawnedAt + RIFT_LIFETIME_MS,
    status: "open",
  };
}

export function getRiftTiming(rift: RankERift, now: number): RiftTiming {
  assertTimestamp(now, "now");
  return {
    ageMs: Math.max(0, now - rift.spawnedAt),
    remainingMs: Math.max(0, rift.expiresAt - Math.max(now, rift.spawnedAt)),
    deadlineReached: now >= rift.expiresAt,
  };
}

/** Returns a new escaped state at the deadline and never mutates the input. */
export function advanceRankERift(rift: RankERift, now: number): RankERift {
  const timing = getRiftTiming(rift, now);
  if (rift.status === "boss-escaped" || !timing.deadlineReached) return rift;
  return { ...rift, position: { ...rift.position }, status: "boss-escaped" };
}

/**
 * Creates the next cycle spawn after a boss escape. When several locations
 * exist, the previous tile is excluded so a new cycle visibly moves the rift.
 * The injected random source is consumed exactly once.
 */
export function spawnNextRankERift(input: NextRankERiftInput): RankERift {
  if (input.previous.status !== "boss-escaped") {
    throw new Error("The next rift can only spawn after the previous boss escaped.");
  }
  if (input.locations.length === 0) throw new Error("At least one rift spawn location is required.");
  assertTimestamp(input.spawnedAt, "spawnedAt");

  for (const location of input.locations) {
    assertIdentifier(location.id, "Spawn location id");
    cloneGridPosition(location.position);
  }

  const alternatives = input.locations.filter(
    (location) => !sameGridPosition(location.position, input.previous.position),
  );
  const candidates = alternatives.length > 0 ? alternatives : input.locations;
  const roll = input.random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError("The injected rift random value must be in the [0, 1) interval.");
  }
  const selected = candidates[Math.floor(roll * candidates.length)];
  const id = input.id ?? `rift-e-${selected.id}-${Math.trunc(input.spawnedAt)}`;
  return createRankERift({ id, position: selected.position, spawnedAt: input.spawnedAt });
}

export function createRiftInstance(input: {
  readonly id: string;
  readonly riftId: string;
  readonly startedAt: number;
}): RiftInstance {
  assertIdentifier(input.id, "Instance id");
  assertIdentifier(input.riftId, "Rift id");
  assertTimestamp(input.startedAt, "startedAt");
  return {
    id: input.id,
    riftId: input.riftId,
    rank: "E",
    startedAt: input.startedAt,
    completedAt: null,
    clearedRooms: [],
    rewards: { generalXp: 0, masteryXp: 0, items: [] },
  };
}

export function currentRiftRoom(
  instance: RiftInstance,
): (typeof RIFT_INSTANCE_ROOMS)[number] | null {
  return RIFT_INSTANCE_ROOMS[instance.clearedRooms.length] ?? null;
}

export function completeRiftRoom(
  instance: RiftInstance,
  input: CompleteRiftRoomInput,
): RiftInstance {
  const currentRoom = currentRiftRoom(instance);
  if (!currentRoom || instance.completedAt !== null) {
    throw new Error("This rift instance is already complete.");
  }
  if (input.room !== currentRoom.number) {
    throw new Error(`Room ${currentRoom.number} must be cleared next.`);
  }
  assertTimestamp(input.clearedAt, "clearedAt");
  const lastProgressAt = instance.clearedRooms.at(-1)?.clearedAt ?? instance.startedAt;
  if (input.clearedAt < lastProgressAt) {
    throw new RangeError("Room completion time cannot move backwards.");
  }

  const clearedRooms = [
    ...instance.clearedRooms,
    { number: currentRoom.number, kind: currentRoom.kind, clearedAt: input.clearedAt },
  ];
  const completedAt = clearedRooms.length === RIFT_INSTANCE_ROOMS.length
    ? input.clearedAt
    : null;
  return {
    ...instance,
    completedAt,
    clearedRooms,
    rewards: mergeRewards(instance.rewards, input.rewards),
  };
}

/** Active instances use `now`; completed instances keep their final duration. */
export function getRiftInstanceDuration(instance: RiftInstance, now: number): number {
  assertTimestamp(now, "now");
  const end = instance.completedAt ?? Math.max(instance.startedAt, now);
  return Math.max(0, end - instance.startedAt);
}

export function summarizeRiftInstance(
  instance: RiftInstance,
  now: number,
): RiftInstanceSummary {
  const currentRoom = currentRiftRoom(instance);
  return {
    instanceId: instance.id,
    riftId: instance.riftId,
    rank: instance.rank,
    completed: instance.completedAt !== null,
    roomsCleared: instance.clearedRooms.length,
    totalRooms: 3,
    currentRoom,
    durationMs: getRiftInstanceDuration(instance, now),
    rewards: {
      generalXp: instance.rewards.generalXp,
      masteryXp: instance.rewards.masteryXp,
      items: instance.rewards.items.map((reward) => ({ ...reward })),
    },
  };
}

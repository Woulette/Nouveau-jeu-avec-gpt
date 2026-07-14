import { createCollisionGrid } from "./grid";
import type { GridPosition, PublicMapDefinition } from "./types";

export const RIFT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
export const RIFT_SPAWN_MIN_DELAY_MS = 15 * 60 * 1_000;
export const RIFT_SPAWN_MAX_DELAY_MS = 45 * 60 * 1_000;

export const RIFT_MAP_WIDTH = 52;
export const RIFT_MAP_HEIGHT = 19;
export const RIFT_ROOM_ENTRANCES = [4, 20, 38] as const;
export const RIFT_ROOM_GATES = [17, 35] as const;

export const RIFT_RANKS = ["E", "D", "C", "B", "A", "S"] as const;
export type RiftRank = (typeof RIFT_RANKS)[number];

export interface RiftItemReward {
  readonly itemId: string;
  readonly quantity: number;
}

export interface RiftMonsterMultipliers {
  /** Multiplies maximum health. */
  readonly hp: number;
  /** Multiplies raw attack damage. */
  readonly damage: number;
  /** Multiplies defense. */
  readonly defense: number;
  /** Multiplies the general XP carried by each creature. */
  readonly xp: number;
  /** Multiplies movement and attack delays; lower values are faster. */
  readonly tempo: number;
  /** Multiplies optional loot chances, which remain capped below 100%. */
  readonly loot: number;
}

export interface RiftRankConfig {
  readonly rank: RiftRank;
  /** Informational value used by the HUD; it never hard-locks entry. */
  readonly recommendedPower: number;
  /** Authoritative XP awarded once, after the final room. */
  readonly completionXp: number;
  /** Added to every baseline rank-E creature level. */
  readonly levelOffset: number;
  readonly monsterMultipliers: RiftMonsterMultipliers;
  /** Guaranteed items granted after the boss, in addition to creature loot. */
  readonly guaranteedRewards: readonly RiftItemReward[];
}

/**
 * Provisional but exhaustive balance for the first six playable rift ranks.
 * The same three-room rules are shared by every rank; only content and rewards
 * scale. Existing catalogue items are deliberately reused until rank-specific
 * art and equipment are introduced.
 */
export const RIFT_RANK_CONFIG = {
  E: {
    rank: "E",
    recommendedPower: 800,
    completionXp: 100,
    levelOffset: 0,
    monsterMultipliers: { hp: 1, damage: 1, defense: 1, xp: 1, tempo: 1, loot: 1 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 3 },
      { itemId: "croc-de-faille", quantity: 1 },
    ],
  },
  D: {
    rank: "D",
    recommendedPower: 1_500,
    completionXp: 180,
    levelOffset: 5,
    monsterMultipliers: { hp: 1.65, damage: 1.5, defense: 1.5, xp: 1.65, tempo: 0.97, loot: 1.1 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 5 },
      { itemId: "fragment-de-faille", quantity: 1 },
    ],
  },
  C: {
    rank: "C",
    recommendedPower: 2_500,
    completionXp: 300,
    levelOffset: 12,
    monsterMultipliers: { hp: 2.6, damage: 2.25, defense: 2.5, xp: 2.6, tempo: 0.94, loot: 1.25 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 8 },
      { itemId: "fragment-de-faille", quantity: 2 },
    ],
  },
  B: {
    rank: "B",
    recommendedPower: 4_000,
    completionXp: 480,
    levelOffset: 22,
    monsterMultipliers: { hp: 4.1, damage: 3.5, defense: 4, xp: 4.1, tempo: 0.9, loot: 1.45 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 12 },
      { itemId: "fragment-de-faille", quantity: 3 },
    ],
  },
  A: {
    rank: "A",
    recommendedPower: 6_000,
    completionXp: 750,
    levelOffset: 34,
    monsterMultipliers: { hp: 6.5, damage: 5.25, defense: 6, xp: 6.5, tempo: 0.86, loot: 1.7 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 18 },
      { itemId: "fragment-de-faille", quantity: 4 },
    ],
  },
  S: {
    rank: "S",
    recommendedPower: 9_000,
    completionXp: 1_150,
    levelOffset: 48,
    monsterMultipliers: { hp: 10, damage: 7.75, defense: 9, xp: 10, tempo: 0.82, loot: 2 },
    guaranteedRewards: [
      { itemId: "poussiere-dimensionnelle", quantity: 25 },
      { itemId: "fragment-de-faille", quantity: 5 },
    ],
  },
} as const satisfies Readonly<Record<RiftRank, RiftRankConfig>>;

/** Short compatibility alias for callers that prefer a content-table name. */
export const RIFT_CONFIG: Readonly<Record<RiftRank, RiftRankConfig>> = RIFT_RANK_CONFIG;

export function isRiftRank(value: unknown): value is RiftRank {
  return typeof value === "string" && (RIFT_RANKS as readonly string[]).includes(value);
}

export function getRiftRankConfig(rank: RiftRank): RiftRankConfig {
  return RIFT_RANK_CONFIG[rank];
}

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
  // Stable identifiers keep existing sessions and the current renderer compatible.
  // The active instance rank carries the actual difficulty.
  id: "faille-e-interieur",
  name: "Faille dimensionnelle · Rang E",
  tileSize: 32,
  width: riftCollision.width,
  height: riftCollision.height,
  blocked: riftCollision.blocked,
  playerSpawn: { x: RIFT_ROOM_ENTRANCES[0], y: 9 },
};

/** Fixed regional anchors used by every fresh E-to-S world. */
export const RIFT_SPAWN_LOCATIONS: readonly RiftSpawnLocation[] = [
  { id: "prairies-eveillees", rank: "E", position: { x: 54, y: 8 } },
  { id: "bois-ambre", rank: "D", position: { x: 72, y: 12 } },
  { id: "marais-cendre", rank: "C", position: { x: 96, y: 12 } },
  { id: "plateaux-brises", rank: "B", position: { x: 73, y: 38 } },
  { id: "lande-eclipse", rank: "A", position: { x: 96, y: 40 } },
  { id: "frontiere-abyssale", rank: "S", position: { x: 88, y: 61 } },
] as const;

/** Accepted only while migrating already deployed v1 rank-E saves. */
export const LEGACY_RIFT_SPAWN_LOCATIONS: readonly RiftSpawnLocation[] = [
  { id: "nord-est", rank: "E", position: { x: 54, y: 8 } },
  { id: "prairie-centrale", rank: "E", position: { x: 43, y: 23 } },
  { id: "prairie-sud", rank: "E", position: { x: 54, y: 36 } },
] as const;

export type RiftStatus = "open" | "boss-escaped";

export interface WorldRift {
  readonly id: string;
  readonly rank: RiftRank;
  readonly position: GridPosition;
  readonly spawnedAt: number;
  readonly expiresAt: number;
  readonly status: RiftStatus;
}

/** Backward-compatible narrowed type used by the existing rank-E realm. */
export interface RankERift extends WorldRift {
  readonly rank: "E";
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
  /** Omitted only by low-level factory tests or future neutral locations. */
  readonly rank?: RiftRank;
  readonly position: GridPosition;
}

export type RiftRandom = () => number;

export interface NextRiftInput {
  readonly previous: WorldRift;
  readonly locations: readonly RiftSpawnLocation[];
  readonly spawnedAt: number;
  readonly random: RiftRandom;
  /** Defaults to the previous rift rank. */
  readonly rank?: RiftRank;
  /** Optional authoritative id. A deterministic id is generated when omitted. */
  readonly id?: string;
}

export interface NextRankERiftInput {
  readonly previous: RankERift;
  readonly locations: readonly RiftSpawnLocation[];
  readonly spawnedAt: number;
  readonly random: RiftRandom;
  readonly id?: string;
}

export const RIFT_INSTANCE_ROOMS = [
  { number: 1, kind: "wave" },
  { number: 2, kind: "wave" },
  { number: 3, kind: "boss" },
] as const;

export type RiftRoomNumber = (typeof RIFT_INSTANCE_ROOMS)[number]["number"];
export type RiftRoomKind = (typeof RIFT_INSTANCE_ROOMS)[number]["kind"];

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

export interface RiftInstance<R extends RiftRank = RiftRank> {
  readonly id: string;
  readonly riftId: string;
  readonly rank: R;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly clearedRooms: readonly ClearedRiftRoom[];
  readonly rewards: RiftRewardSummary;
}

export type RankERiftInstance = RiftInstance<"E">;

export interface CompleteRiftRoomInput {
  /** Guards against duplicated or out-of-order room completion commands. */
  readonly room: RiftRoomNumber;
  readonly clearedAt: number;
  readonly rewards?: RiftRoomRewards;
}

export interface RiftInstanceSummary<R extends RiftRank = RiftRank> {
  readonly instanceId: string;
  readonly riftId: string;
  readonly rank: R;
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

function assertRiftRank(value: unknown): asserts value is RiftRank {
  if (!isRiftRank(value)) throw new RangeError("Unknown rift rank.");
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

export function createRift(input: {
  readonly id: string;
  readonly rank: RiftRank;
  readonly position: GridPosition;
  readonly spawnedAt: number;
}): WorldRift {
  assertIdentifier(input.id, "Rift id");
  assertRiftRank(input.rank);
  assertTimestamp(input.spawnedAt, "spawnedAt");
  return {
    id: input.id,
    rank: input.rank,
    position: cloneGridPosition(input.position),
    spawnedAt: input.spawnedAt,
    expiresAt: input.spawnedAt + RIFT_LIFETIME_MS,
    status: "open",
  };
}

/** Existing rank-E entry point retained while the realm migrates to `createRift`. */
export function createRankERift(input: {
  readonly id: string;
  readonly position: GridPosition;
  readonly spawnedAt: number;
}): RankERift {
  return createRift({ ...input, rank: "E" }) as RankERift;
}

export function getRiftTiming(rift: WorldRift, now: number): RiftTiming {
  assertTimestamp(now, "now");
  return {
    ageMs: Math.max(0, now - rift.spawnedAt),
    remainingMs: Math.max(0, rift.expiresAt - Math.max(now, rift.spawnedAt)),
    deadlineReached: now >= rift.expiresAt,
  };
}

/** Returns a new escaped state at the deadline and never mutates the input. */
export function advanceRift<R extends WorldRift>(rift: R, now: number): R {
  const timing = getRiftTiming(rift, now);
  if (rift.status === "boss-escaped" || !timing.deadlineReached) return rift;
  return { ...rift, position: { ...rift.position }, status: "boss-escaped" } as R;
}

export function advanceRankERift(rift: RankERift, now: number): RankERift {
  return advanceRift(rift, now);
}

/**
 * Creates the next cycle spawn after a boss escape. When several locations
 * exist, the previous tile is excluded so a new cycle visibly moves the rift.
 * The injected random source is consumed exactly once.
 */
export function spawnNextRift(input: NextRiftInput): WorldRift {
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
  const rank = input.rank ?? input.previous.rank;
  assertRiftRank(rank);
  const id = input.id ?? `rift-${rank.toLowerCase()}-${selected.id}-${Math.trunc(input.spawnedAt)}`;
  return createRift({ id, rank, position: selected.position, spawnedAt: input.spawnedAt });
}

export function spawnNextRankERift(input: NextRankERiftInput): RankERift {
  return spawnNextRift({ ...input, rank: "E" }) as RankERift;
}

interface CreateRiftInstanceBase {
  readonly id: string;
  readonly riftId: string;
  readonly startedAt: number;
}

export function createRiftInstance(input: CreateRiftInstanceBase): RiftInstance<"E">;
export function createRiftInstance<R extends RiftRank>(
  input: CreateRiftInstanceBase & { readonly rank: R },
): RiftInstance<R>;
export function createRiftInstance(
  input: CreateRiftInstanceBase & { readonly rank?: RiftRank },
): RiftInstance {
  assertIdentifier(input.id, "Instance id");
  assertIdentifier(input.riftId, "Rift id");
  assertTimestamp(input.startedAt, "startedAt");
  const rank = input.rank ?? "E";
  assertRiftRank(rank);
  return {
    id: input.id,
    riftId: input.riftId,
    rank,
    startedAt: input.startedAt,
    completedAt: null,
    clearedRooms: [],
    rewards: { generalXp: 0, masteryXp: 0, items: [] },
  };
}

export function createRankERiftInstance(input: CreateRiftInstanceBase): RankERiftInstance {
  return createRiftInstance(input);
}

export function currentRiftRoom(
  instance: RiftInstance,
): (typeof RIFT_INSTANCE_ROOMS)[number] | null {
  return RIFT_INSTANCE_ROOMS[instance.clearedRooms.length] ?? null;
}

export function completeRiftRoom<R extends RiftRank>(
  instance: RiftInstance<R>,
  input: CompleteRiftRoomInput,
): RiftInstance<R> {
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

export function summarizeRiftInstance<R extends RiftRank>(
  instance: RiftInstance<R>,
  now: number,
): RiftInstanceSummary<R> {
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

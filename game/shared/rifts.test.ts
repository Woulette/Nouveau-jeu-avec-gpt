import { describe, expect, it, vi } from "vitest";

import {
  RIFT_RANK_CONFIG,
  RIFT_RANKS,
  RIFT_INSTANCE_ROOMS,
  RIFT_LIFETIME_MS,
  advanceRift,
  advanceRankERift,
  completeRiftRoom,
  createRift,
  createRankERift,
  createRiftInstance,
  currentRiftRoom,
  getRiftRankConfig,
  getRiftInstanceDuration,
  getRiftTiming,
  spawnNextRift,
  spawnNextRankERift,
  summarizeRiftInstance,
} from "./rifts";

const HOUR = 60 * 60 * 1_000;

describe("rank-E dynamic rift cycle", () => {
  it("creates an open rank-E rift with an exact 24-hour deadline", () => {
    const position = { x: 54, y: 8 };
    const rift = createRankERift({ id: "rift-e-1", position, spawnedAt: 1_000 });

    expect(rift).toEqual({
      id: "rift-e-1",
      rank: "E",
      position: { x: 54, y: 8 },
      spawnedAt: 1_000,
      expiresAt: 1_000 + RIFT_LIFETIME_MS,
      status: "open",
    });
    position.x = 1;
    expect(rift.position).toEqual({ x: 54, y: 8 });
  });

  it("calculates age and remaining time before, at, and after the deadline", () => {
    const rift = createRankERift({ id: "rift-e-1", position: { x: 1, y: 2 }, spawnedAt: 10_000 });

    expect(getRiftTiming(rift, 9_000)).toEqual({
      ageMs: 0,
      remainingMs: RIFT_LIFETIME_MS,
      deadlineReached: false,
    });
    expect(getRiftTiming(rift, 10_000 + 6 * HOUR)).toEqual({
      ageMs: 6 * HOUR,
      remainingMs: 18 * HOUR,
      deadlineReached: false,
    });
    expect(getRiftTiming(rift, rift.expiresAt)).toEqual({
      ageMs: RIFT_LIFETIME_MS,
      remainingMs: 0,
      deadlineReached: true,
    });
    expect(getRiftTiming(rift, rift.expiresAt + HOUR)).toEqual({
      ageMs: 25 * HOUR,
      remainingMs: 0,
      deadlineReached: true,
    });
  });

  it("lets the boss escape exactly at expiry and keeps the transition idempotent", () => {
    const rift = createRankERift({ id: "rift-e-1", position: { x: 4, y: 5 }, spawnedAt: 0 });

    expect(advanceRankERift(rift, rift.expiresAt - 1)).toBe(rift);
    const escaped = advanceRankERift(rift, rift.expiresAt);
    expect(escaped).not.toBe(rift);
    expect(escaped).toMatchObject({ status: "boss-escaped", position: { x: 4, y: 5 } });
    expect(rift.status).toBe("open");
    expect(advanceRankERift(escaped, escaped.expiresAt + HOUR)).toBe(escaped);
  });

  it("spawns the next rift deterministically, away from the previous tile", () => {
    const previous = advanceRankERift(
      createRankERift({ id: "old", position: { x: 10, y: 10 }, spawnedAt: 0 }),
      RIFT_LIFETIME_MS,
    );
    const locations = [
      { id: "old-tile", position: { x: 10, y: 10 } },
      { id: "north", position: { x: 20, y: 4 } },
      { id: "south", position: { x: 22, y: 35 } },
    ] as const;
    const firstRandom = vi.fn(() => 0);
    const lastRandom = vi.fn(() => 0.999_999);

    expect(spawnNextRankERift({ previous, locations, spawnedAt: 90_000, random: firstRandom })).toMatchObject({
      id: "rift-e-north-90000",
      position: { x: 20, y: 4 },
      status: "open",
      expiresAt: 90_000 + RIFT_LIFETIME_MS,
    });
    expect(spawnNextRankERift({ previous, locations, spawnedAt: 90_000, random: lastRandom })).toMatchObject({
      id: "rift-e-south-90000",
      position: { x: 22, y: 35 },
    });
    expect(firstRandom).toHaveBeenCalledTimes(1);
    expect(lastRandom).toHaveBeenCalledTimes(1);
  });

  it("supports a sole spawn tile and an explicit authoritative id", () => {
    const previous = advanceRankERift(
      createRankERift({ id: "old", position: { x: 10, y: 10 }, spawnedAt: 0 }),
      RIFT_LIFETIME_MS,
    );
    const next = spawnNextRankERift({
      previous,
      locations: [{ id: "only", position: { x: 10, y: 10 } }],
      spawnedAt: RIFT_LIFETIME_MS,
      random: () => 0.42,
      id: "authoritative-rift-id",
    });
    expect(next.id).toBe("authoritative-rift-id");
    expect(next.position).toEqual(previous.position);
  });

  it("rejects invalid cycle inputs instead of hiding authoritative errors", () => {
    const open = createRankERift({ id: "open", position: { x: 1, y: 1 }, spawnedAt: 0 });
    const escaped = advanceRankERift(open, open.expiresAt);

    expect(() => spawnNextRankERift({ previous: open, locations: [{ id: "a", position: { x: 2, y: 2 } }], spawnedAt: 1, random: () => 0 })).toThrow(/escaped/i);
    expect(() => spawnNextRankERift({ previous: escaped, locations: [], spawnedAt: 1, random: () => 0 })).toThrow(/location/i);
    expect(() => spawnNextRankERift({ previous: escaped, locations: [{ id: "a", position: { x: 2, y: 2 } }], spawnedAt: 1, random: () => 1 })).toThrow(/\[0, 1\)/i);
    expect(() => createRankERift({ id: " ", position: { x: 1, y: 1 }, spawnedAt: 0 })).toThrow(/empty/i);
    expect(() => createRankERift({ id: "bad-position", position: { x: 1.5, y: 1 }, spawnedAt: 0 })).toThrow(/integer/i);
  });
});

describe("generic E-to-S rift core", () => {
  it("defines complete, strictly increasing balance and known guaranteed rewards", () => {
    expect(Object.keys(RIFT_RANK_CONFIG)).toEqual(RIFT_RANKS);

    let previousPower = 0;
    let previousCompletionXp = 0;
    let previousHpMultiplier = 0;
    for (const rank of RIFT_RANKS) {
      const config = getRiftRankConfig(rank);
      expect(config.rank).toBe(rank);
      expect(config.recommendedPower).toBeGreaterThan(previousPower);
      expect(config.completionXp).toBeGreaterThan(previousCompletionXp);
      expect(config.monsterMultipliers.hp).toBeGreaterThan(previousHpMultiplier);
      expect(config.guaranteedRewards.length).toBeGreaterThan(0);
      expect(config.guaranteedRewards.every((reward) => reward.quantity > 0)).toBe(true);
      previousPower = config.recommendedPower;
      previousCompletionXp = config.completionXp;
      previousHpMultiplier = config.monsterMultipliers.hp;
    }
  });

  it.each(RIFT_RANKS)("creates, advances, and summarizes a rank-%s run without losing its rank", (rank) => {
    const rift = createRift({
      id: `rift-${rank.toLowerCase()}-1`,
      rank,
      position: { x: 10, y: 10 },
      spawnedAt: 1_000,
    });
    expect(rift).toMatchObject({ rank, status: "open", expiresAt: 1_000 + RIFT_LIFETIME_MS });
    expect(advanceRift(rift, rift.expiresAt)).toMatchObject({ rank, status: "boss-escaped" });

    let instance = createRiftInstance({
      id: `instance-${rank.toLowerCase()}`,
      riftId: rift.id,
      rank,
      startedAt: 2_000,
    });
    instance = completeRiftRoom(instance, { room: 1, clearedAt: 3_000 });
    instance = completeRiftRoom(instance, { room: 2, clearedAt: 4_000 });
    instance = completeRiftRoom(instance, {
      room: 3,
      clearedAt: 5_000,
      rewards: {
        generalXp: getRiftRankConfig(rank).completionXp,
        items: getRiftRankConfig(rank).guaranteedRewards,
      },
    });
    expect(summarizeRiftInstance(instance, 10_000)).toMatchObject({
      rank,
      completed: true,
      roomsCleared: 3,
      rewards: {
        generalXp: getRiftRankConfig(rank).completionXp,
        items: getRiftRankConfig(rank).guaranteedRewards,
      },
    });
  });

  it("can change rank explicitly between two generic cycle spawns", () => {
    const previous = advanceRift(
      createRift({ id: "rift-e-old", rank: "E", position: { x: 10, y: 10 }, spawnedAt: 0 }),
      RIFT_LIFETIME_MS,
    );
    const next = spawnNextRift({
      previous,
      rank: "S",
      locations: [{ id: "citadel", position: { x: 20, y: 20 } }],
      spawnedAt: RIFT_LIFETIME_MS,
      random: () => 0,
    });
    expect(next).toMatchObject({
      id: `rift-s-citadel-${RIFT_LIFETIME_MS}`,
      rank: "S",
      position: { x: 20, y: 20 },
      status: "open",
    });
  });

  it("keeps all legacy rank-E wrappers byte-for-byte compatible", () => {
    const rift = createRankERift({ id: "legacy-e", position: { x: 4, y: 5 }, spawnedAt: 0 });
    const escaped = advanceRankERift(rift, RIFT_LIFETIME_MS);
    const next = spawnNextRankERift({
      previous: escaped,
      locations: [{ id: "legacy", position: { x: 8, y: 9 } }],
      spawnedAt: RIFT_LIFETIME_MS,
      random: () => 0,
    });
    const instance = createRiftInstance({ id: "legacy-instance", riftId: next.id, startedAt: 0 });
    expect(next.rank).toBe("E");
    expect(next.id).toBe(`rift-e-legacy-${RIFT_LIFETIME_MS}`);
    expect(instance.rank).toBe("E");
  });
});

describe("three-room rift instance progression", () => {
  it("starts in wave one with an empty typed reward summary", () => {
    const instance = createRiftInstance({ id: "instance-1", riftId: "rift-e-1", startedAt: 5_000 });

    expect(RIFT_INSTANCE_ROOMS).toEqual([
      { number: 1, kind: "wave" },
      { number: 2, kind: "wave" },
      { number: 3, kind: "boss" },
    ]);
    expect(currentRiftRoom(instance)).toEqual({ number: 1, kind: "wave" });
    expect(instance).toMatchObject({
      rank: "E",
      completedAt: null,
      clearedRooms: [],
      rewards: { generalXp: 0, masteryXp: 0, items: [] },
    });
  });

  it("advances through two waves and one boss while aggregating rewards", () => {
    const initial = createRiftInstance({ id: "instance-1", riftId: "rift-e-1", startedAt: 1_000 });
    const afterWaveOne = completeRiftRoom(initial, {
      room: 1,
      clearedAt: 11_000,
      rewards: { generalXp: 20, masteryXp: 3, items: [{ itemId: "gelee-claire", quantity: 1 }] },
    });
    const afterWaveTwo = completeRiftRoom(afterWaveOne, {
      room: 2,
      clearedAt: 25_000,
      rewards: {
        generalXp: 30,
        masteryXp: 4,
        items: [
          { itemId: "gelee-claire", quantity: 2 },
          { itemId: "pierre-e", quantity: 1 },
        ],
      },
    });
    const completed = completeRiftRoom(afterWaveTwo, {
      room: 3,
      clearedAt: 41_000,
      rewards: { generalXp: 100, masteryXp: 12, items: [{ itemId: "pierre-e", quantity: 2 }] },
    });

    expect(currentRiftRoom(afterWaveOne)).toEqual({ number: 2, kind: "wave" });
    expect(currentRiftRoom(afterWaveTwo)).toEqual({ number: 3, kind: "boss" });
    expect(currentRiftRoom(completed)).toBeNull();
    expect(completed.completedAt).toBe(41_000);
    expect(completed.clearedRooms.map(({ number, kind }) => ({ number, kind }))).toEqual(RIFT_INSTANCE_ROOMS);
    expect(completed.rewards).toEqual({
      generalXp: 150,
      masteryXp: 19,
      items: [
        { itemId: "gelee-claire", quantity: 3 },
        { itemId: "pierre-e", quantity: 3 },
      ],
    });
    expect(initial.clearedRooms).toEqual([]);
    expect(initial.rewards.items).toEqual([]);
  });

  it("tracks live duration and freezes final duration in the typed summary", () => {
    let instance = createRiftInstance({ id: "instance-1", riftId: "rift-e-1", startedAt: 10_000 });
    expect(getRiftInstanceDuration(instance, 8_000)).toBe(0);
    expect(getRiftInstanceDuration(instance, 18_000)).toBe(8_000);

    instance = completeRiftRoom(instance, { room: 1, clearedAt: 20_000 });
    instance = completeRiftRoom(instance, { room: 2, clearedAt: 30_000 });
    instance = completeRiftRoom(instance, { room: 3, clearedAt: 42_000 });
    expect(getRiftInstanceDuration(instance, 100_000)).toBe(32_000);
    expect(summarizeRiftInstance(instance, 100_000)).toEqual({
      instanceId: "instance-1",
      riftId: "rift-e-1",
      rank: "E",
      completed: true,
      roomsCleared: 3,
      totalRooms: 3,
      currentRoom: null,
      durationMs: 32_000,
      rewards: { generalXp: 0, masteryXp: 0, items: [] },
    });
  });

  it("rejects skipped, duplicated, retroactive, or post-completion clears", () => {
    const initial = createRiftInstance({ id: "instance-1", riftId: "rift-e-1", startedAt: 1_000 });
    expect(() => completeRiftRoom(initial, { room: 2, clearedAt: 2_000 })).toThrow(/room 1/i);
    expect(() => completeRiftRoom(initial, { room: 1, clearedAt: 999 })).toThrow(/backwards/i);

    const roomOne = completeRiftRoom(initial, { room: 1, clearedAt: 2_000 });
    expect(() => completeRiftRoom(roomOne, { room: 1, clearedAt: 3_000 })).toThrow(/room 2/i);
    const roomTwo = completeRiftRoom(roomOne, { room: 2, clearedAt: 3_000 });
    const completed = completeRiftRoom(roomTwo, { room: 3, clearedAt: 4_000 });
    expect(() => completeRiftRoom(completed, { room: 3, clearedAt: 5_000 })).toThrow(/complete/i);
  });

  it("normalizes duplicate item rewards and rejects invalid reward values", () => {
    const initial = createRiftInstance({ id: "instance-1", riftId: "rift-e-1", startedAt: 0 });
    const advanced = completeRiftRoom(initial, {
      room: 1,
      clearedAt: 1,
      rewards: {
        items: [
          { itemId: "fragment", quantity: 1 },
          { itemId: "fragment", quantity: 2 },
        ],
      },
    });
    expect(advanced.rewards.items).toEqual([{ itemId: "fragment", quantity: 3 }]);

    expect(() => completeRiftRoom(initial, { room: 1, clearedAt: 1, rewards: { generalXp: -1 } })).toThrow(/generalXp/i);
    expect(() => completeRiftRoom(initial, { room: 1, clearedAt: 1, rewards: { masteryXp: 1.5 } })).toThrow(/masteryXp/i);
    expect(() => completeRiftRoom(initial, { room: 1, clearedAt: 1, rewards: { items: [{ itemId: "fragment", quantity: 0 }] } })).toThrow(/quantities/i);
  });
});

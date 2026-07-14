import { describe, expect, it } from "vitest";

import { RIFT_LIFETIME_MS, RIFT_RANKS, getRiftRankConfig } from "../shared/rifts";
import {
  LEGACY_RIFT_WORLD_SAVE_VERSION,
  persistedRiftWorldStateSchema,
  type PersistedRiftWorldState,
} from "../shared/rift-persistence";
import type { PersistedPlayerProfile } from "../shared/save";
import type { RealmSnapshot, ServerMessage } from "../shared/types";
import { InMemoryRealm } from "./realm";

function savedAdventurer(overrides: Partial<PersistedPlayerProfile> = {}): PersistedPlayerProfile {
  return {
    name: "Aube",
    position: { x: 54, y: 9 },
    hp: 340,
    mp: 130,
    level: 20,
    xp: 0,
    gold: 0,
    rank: null,
    combatPath: "adventurer",
    className: "Aventurier",
    masteries: {
      melee: { level: 0, xp: 0 },
      ranged: { level: 0, xp: 0 },
      magic: { level: 0, xp: 0 },
      defense: { level: 0, xp: 0 },
    },
    inventory: [{ itemId: "starter-potion", quantity: 2 }],
    equipment: {
      head: null,
      weapon: null,
      armor: null,
      legs: null,
      boots: null,
      ring: null,
    },
    ...overrides,
  };
}

function latestSnapshot(messages: ServerMessage[]): RealmSnapshot {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type === "snapshot" || message.type === "welcome") return message.snapshot;
  }
  throw new Error("No realm snapshot received");
}

function stepUntil(
  realm: InMemoryRealm,
  clock: { now: number },
  predicate: () => boolean,
  maximum = 500,
): void {
  for (let index = 0; index < maximum && !predicate(); index += 1) {
    clock.now += 250;
    realm.step(clock.now);
  }
  expect(predicate()).toBe(true);
}

describe("authoritative ranked-rift vertical slice", () => {
  it("seeds every D-to-S portal without discarding three deployed v1 E rifts", () => {
    const migrated = persistedRiftWorldStateSchema.parse({
      version: LEGACY_RIFT_WORLD_SAVE_VERSION,
      savedAt: 1_000,
      nextRiftSpawnAt: 900_000,
      riftSequence: 1,
      rifts: [
        { x: 54, y: 8 },
        { x: 43, y: 23 },
        { x: 54, y: 36 },
      ].map((position, index) => ({
        id: `rift-e-${index + 1}`,
        rank: "E" as const,
        position,
        spawnedAt: index * 100,
        expiresAt: index * 100 + RIFT_LIFETIME_MS,
        status: "open" as const,
        outsideBossAlive: false,
        outsideBoss: null,
      })),
    });
    const realm = new InMemoryRealm({
      now: () => 1_000,
      autoStart: false,
      persistedRiftWorldState: migrated,
    });

    const snapshot = realm.snapshot();
    expect(snapshot.rifts).toHaveLength(8);
    expect(new Set(snapshot.rifts.map((rift) => rift.rank))).toEqual(new Set(RIFT_RANKS));
    expect(snapshot.rifts.filter((rift) => rift.rank === "E")).toHaveLength(3);
    const exported = realm.exportRiftWorldState();
    expect(exported).not.toHaveProperty("migratedFromVersion");
    expect(persistedRiftWorldStateSchema.safeParse(exported).success).toBe(true);
  });

  it("keeps local portal deadlines, the next spawn, and an escaped boss across realm restarts", () => {
    const clock = { now: 0 };
    const checkpoints: PersistedRiftWorldState[] = [];
    const realm = new InMemoryRealm({
      now: () => clock.now,
      random: () => 0.5,
      autoStart: false,
      onRiftWorldStateChange: (state) => checkpoints.push(state),
    });
    const initial = checkpoints.at(-1);
    expect(initial).toBeDefined();
    if (!initial) return;
    expect(initial.rifts.map((rift) => rift.rank)).toEqual(RIFT_RANKS);
    const originalRift = initial.rifts[0];
    const originalRankS = initial.rifts.find((rift) => rift.rank === "S");
    expect(originalRankS).toBeDefined();
    if (!originalRankS) return;
    realm.stop();

    clock.now = 5 * 60 * 1_000;
    const resumed = new InMemoryRealm({
      now: () => clock.now,
      random: () => 0.5,
      autoStart: false,
      persistedRiftWorldState: initial,
      onRiftWorldStateChange: (state) => checkpoints.push(state),
    });
    const resumedState = resumed.exportRiftWorldState();
    expect(resumedState.rifts.map((rift) => rift.rank)).toEqual(RIFT_RANKS);
    expect(resumedState.nextRiftSpawnAt).toBe(initial.nextRiftSpawnAt);
    expect(resumedState.rifts[0]).toMatchObject({
      id: originalRift.id,
      spawnedAt: originalRift.spawnedAt,
      expiresAt: originalRift.expiresAt,
      status: "open",
    });

    clock.now = RIFT_LIFETIME_MS;
    resumed.step(clock.now);
    const escapedState = resumed.exportRiftWorldState();
    const escapedRift = escapedState.rifts.find((rift) => rift.id === originalRift.id);
    expect(escapedRift).toMatchObject({
      spawnedAt: originalRift.spawnedAt,
      expiresAt: originalRift.expiresAt,
      status: "boss-escaped",
      outsideBossAlive: true,
      outsideBoss: { hp: 260 },
    });
    const escapedRankS = escapedState.rifts.find((rift) => rift.rank === "S");
    expect(escapedRankS).toMatchObject({
      id: originalRankS.id,
      rank: "S",
      status: "boss-escaped",
      outsideBossAlive: true,
      outsideBoss: { hp: 2_600 },
    });

    const restarted = new InMemoryRealm({
      now: () => clock.now,
      random: () => 0.5,
      autoStart: false,
      persistedRiftWorldState: escapedState,
    });
    expect(restarted.snapshot().rifts.find((rift) => rift.id === originalRift.id)).toMatchObject({
      rank: "E",
      status: "boss-escaped",
      outsideBossAlive: true,
    });
    expect(restarted.snapshot().monsters).toContainEqual(
      expect.objectContaining({ id: `escaped-${originalRift.id}`, hp: 260, alive: true }),
    );
    expect(restarted.snapshot().monsters).toContainEqual(
      expect.objectContaining({
        id: `escaped-${originalRankS.id}`,
        name: "Souverain échappé",
        hp: 2_600,
        alive: true,
      }),
    );
  });

  it("restores multiple ranks and replaces a missing rank before creating duplicates", () => {
    const clock = { now: 1_000 };
    const fresh = new InMemoryRealm({ now: () => 0, autoStart: false, random: () => 0.5 });
    const completeState = fresh.exportRiftWorldState(0);
    const missingRankState: PersistedRiftWorldState = {
      ...completeState,
      nextRiftSpawnAt: 0,
      rifts: completeState.rifts.filter((rift) => rift.rank !== "C"),
    };

    const restored = new InMemoryRealm({
      now: () => clock.now,
      autoStart: false,
      random: () => 0.5,
      persistedRiftWorldState: missingRankState,
    });
    const restoredState = restored.exportRiftWorldState(clock.now);
    expect(restoredState.rifts.map((rift) => rift.rank)).toEqual(RIFT_RANKS);
    expect(restoredState.rifts.find((rift) => rift.rank === "C")).toMatchObject({
      position: { x: 96, y: 12 },
      spawnedAt: clock.now,
      status: "open",
    });
    expect(new Set(restoredState.rifts.map((rift) => rift.rank)).size).toBe(6);
  });

  it("restores a validated local save and enters a private three-room map", () => {
    const clock = { now: 1_000 };
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => clock.now,
      random: () => 0.5,
      autoStart: false,
      allowClientSaves: true,
    });
    realm.registerPeer("local", (message) => messages.push(message));
    realm.joinPeer("local", {
      type: "join",
      name: "Aube",
      clientVersion: "test-local",
      savedProfile: savedAdventurer(),
    });

    const world = latestSnapshot(messages);
    expect(world.players[0]).toMatchObject({ level: 20, position: { x: 54, y: 9 } });
    expect(world.rifts.map((rift) => rift.rank)).toEqual(RIFT_RANKS);
    const riftId = world.rifts[0].id;

    realm.handleMessage("local", { type: "rift", action: "enter", riftId, sequence: 0 });
    const dungeon = latestSnapshot(messages);
    expect(dungeon).toMatchObject({ zoneKind: "rift", map: { id: "faille-e-interieur" } });
    expect(dungeon.riftRun).toMatchObject({
      riftId,
      rank: "E",
      room: 1,
      totalRooms: 3,
      roomCleared: false,
    });
    expect(dungeon.monsters).toHaveLength(2);
    expect(dungeon.players[0].position).toEqual({ x: 4, y: 9 });
  });

  it("enters and completes a genuinely scaled rank-D rift with rank-D rewards", () => {
    const clock = { now: 10_000 };
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => clock.now,
      random: () => 1,
      autoStart: false,
      allowClientSaves: true,
    });
    realm.registerPeer("local", (message) => messages.push(message));
    realm.joinPeer("local", {
      type: "join",
      name: "Aube",
      clientVersion: "test-local",
      savedProfile: savedAdventurer({ position: { x: 72, y: 13 } }),
    });

    const rankDRift = latestSnapshot(messages).rifts.find((rift) => rift.rank === "D");
    expect(rankDRift).toMatchObject({ rank: "D", position: { x: 72, y: 12 } });
    if (!rankDRift) return;

    let sequence = 0;
    realm.handleMessage("local", {
      type: "rift",
      action: "enter",
      riftId: rankDRift.id,
      sequence: sequence++,
    });
    const entered = latestSnapshot(messages);
    expect(entered.riftRun).toMatchObject({
      riftId: rankDRift.id,
      rank: "D",
      room: 1,
      totalRooms: 3,
    });
    expect(entered.monsters).toHaveLength(2);
    expect(entered.monsters[0]).toMatchObject({
      name: "Gelée instable",
      level: 7,
      maxHp: 69,
    });

    function clearCurrentRoom(): void {
      const monsterIds = latestSnapshot(messages).monsters
        .filter((monster) => monster.alive)
        .map((monster) => monster.id);
      for (const monsterId of monsterIds) {
        realm.handleMessage("local", {
          type: "target",
          targetId: monsterId,
          sequence: sequence++,
        });
        stepUntil(
          realm,
          clock,
          () => {
            const snapshot = latestSnapshot(messages);
            return snapshot.zoneKind === "world" ||
              snapshot.monsters.find((monster) => monster.id === monsterId)?.alive === false;
          },
        );
      }
    }

    clearCurrentRoom();
    realm.handleMessage("local", {
      type: "move",
      destination: { x: 20, y: 9 },
      sequence: sequence++,
    });
    stepUntil(realm, clock, () => latestSnapshot(messages).riftRun?.room === 2);
    clearCurrentRoom();
    realm.handleMessage("local", {
      type: "move",
      destination: { x: 38, y: 9 },
      sequence: sequence++,
    });
    stepUntil(realm, clock, () => latestSnapshot(messages).riftRun?.room === 3);
    clearCurrentRoom();
    stepUntil(realm, clock, () => latestSnapshot(messages).zoneKind === "world");

    const completion = messages.find(
      (message) =>
        message.type === "event" &&
        message.event.type === "rift-complete" &&
        message.event.riftId === rankDRift.id,
    );
    expect(completion?.type).toBe("event");
    if (completion?.type === "event" && completion.event.type === "rift-complete") {
      expect(completion.event).toMatchObject({
        rank: "D",
        generalXp: 656,
        items: getRiftRankConfig("D").guaranteedRewards,
      });
    }
    expect(
      messages
        .filter((message) => message.type === "event")
        .map((message) => message.event)
        .filter((event) => event.type === "rift-room-cleared")
        .every((event) => event.rank === "D"),
    ).toBe(true);
    const inventory = Object.fromEntries(
      latestSnapshot(messages).players[0].inventory.map((entry) => [entry.itemId, entry.quantity]),
    );
    expect(inventory).toMatchObject({
      "poussiere-dimensionnelle": 5,
      "fragment-de-faille": 1,
    });
  });

  it("clears two waves and the boss, closes the portal, and reports all rewards", () => {
    const clock = { now: 10_000 };
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => clock.now,
      random: () => 1,
      autoStart: false,
      allowClientSaves: true,
    });
    realm.registerPeer("local", (message) => messages.push(message));
    realm.joinPeer("local", {
      type: "join",
      name: "Aube",
      clientVersion: "test-local",
      savedProfile: savedAdventurer(),
    });
    const riftId = latestSnapshot(messages).rifts[0].id;
    let sequence = 0;
    realm.handleMessage("local", { type: "rift", action: "enter", riftId, sequence: sequence++ });

    function clearCurrentRoom(): void {
      const monsterIds = latestSnapshot(messages).monsters
        .filter((monster) => monster.alive)
        .map((monster) => monster.id);
      for (const monsterId of monsterIds) {
        realm.handleMessage("local", { type: "target", targetId: monsterId, sequence: sequence++ });
        stepUntil(
          realm,
          clock,
          () => {
            const snapshot = latestSnapshot(messages);
            return snapshot.zoneKind === "world" ||
              snapshot.monsters.find((monster) => monster.id === monsterId)?.alive === false;
          },
        );
      }
    }

    clearCurrentRoom();
    expect(latestSnapshot(messages).riftRun).toMatchObject({ room: 1, roomCleared: true });
    realm.handleMessage("local", {
      type: "move",
      destination: { x: 20, y: 9 },
      sequence: sequence++,
    });
    stepUntil(realm, clock, () => latestSnapshot(messages).riftRun?.room === 2);

    clearCurrentRoom();
    realm.handleMessage("local", {
      type: "move",
      destination: { x: 38, y: 9 },
      sequence: sequence++,
    });
    stepUntil(realm, clock, () => latestSnapshot(messages).riftRun?.room === 3);

    clearCurrentRoom();
    stepUntil(realm, clock, () => latestSnapshot(messages).zoneKind === "world");

    const completion = messages.find(
      (message) => message.type === "event" && message.event.type === "rift-complete",
    );
    expect(completion?.type).toBe("event");
    if (completion?.type === "event" && completion.event.type === "rift-complete") {
      expect(completion.event).toMatchObject({
        riftId,
        rank: "E",
        generalXp: 388,
        items: [
          { itemId: "poussiere-dimensionnelle", quantity: 3 },
          { itemId: "croc-de-faille", quantity: 1 },
        ],
      });
      expect(completion.event.elapsedMs).toBeGreaterThan(0);
    }
    const world = latestSnapshot(messages);
    expect(world.rifts.some((rift) => rift.id === riftId)).toBe(false);
    const inventory = Object.fromEntries(
      world.players[0].inventory.map((entry) => [entry.itemId, entry.quantity]),
    );
    expect(inventory).toMatchObject({ "poussiere-dimensionnelle": 3, "croc-de-faille": 1 });
  });

  it("releases an aggressive guardian when a portal remains open for 24 hours", () => {
    const clock = { now: 0 };
    const realm = new InMemoryRealm({ now: () => clock.now, autoStart: false, random: () => 0.5 });
    realm.registerPeer("peer", () => undefined);
    realm.joinPeer("peer", { type: "join", name: "Aube" });
    const riftId = realm.snapshot().rifts[0].id;

    clock.now = RIFT_LIFETIME_MS;
    realm.step(clock.now);

    const snapshot = realm.snapshot();
    expect(snapshot.rifts.find((rift) => rift.id === riftId)).toMatchObject({
      status: "boss-escaped",
      outsideBossAlive: true,
    });
    expect(snapshot.monsters).toContainEqual(
      expect.objectContaining({
        id: `escaped-${riftId}`,
        name: "Gardien échappé",
        behaviour: "aggressive",
        isBoss: true,
      }),
    );
  });

  it("ejects an active run and keeps the portal open when its outside boss escapes", () => {
    const clock = { now: 0 };
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => clock.now,
      random: () => 0.5,
      autoStart: false,
      allowClientSaves: true,
    });
    realm.registerPeer("local", (message) => messages.push(message));
    realm.joinPeer("local", {
      type: "join",
      name: "Aube",
      savedProfile: savedAdventurer(),
    });
    const riftId = realm.snapshot().rifts[0].id;
    realm.handleMessage("local", { type: "rift", action: "enter", riftId, sequence: 0 });
    expect(latestSnapshot(messages).zoneKind).toBe("rift");

    clock.now = RIFT_LIFETIME_MS;
    realm.step(clock.now);

    const world = realm.snapshot();
    expect(world.players[0]).toBeDefined();
    expect(world.rifts.find((rift) => rift.id === riftId)).toMatchObject({
      status: "boss-escaped",
      outsideBossAlive: true,
    });
    expect(
      messages.some(
        (message) => message.type === "event" && message.event.type === "rift-complete",
      ),
    ).toBe(false);
    expect(
      messages.some(
        (message) => message.type === "error" && message.code === "RIFT_BOSS_ESCAPED",
      ),
    ).toBe(true);

    realm.handleMessage("local", { type: "rift", action: "enter", riftId, sequence: 1 });
    expect(
      messages.some(
        (message) => message.type === "error" && message.code === "RIFT_BOSS_OUTSIDE",
      ),
    ).toBe(true);
  });
});

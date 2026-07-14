import { describe, expect, it } from "vitest";
import { manhattanDistance } from "../shared/grid";
import type { GridPosition, ServerMessage } from "../shared/types";
import { STARTER_MAP, STARTER_MONSTERS } from "../shared/world";
import {
  InMemoryRealm,
  PLAYER_COMBAT_TIMEOUT_MS,
  PLAYER_HEALTH_REGEN_PER_SECOND,
} from "./realm";

interface RuntimePlayerForTest {
  id: string;
  level: number;
  hp: number;
  alive: boolean;
  position: GridPosition;
}

interface RuntimeMonsterForTest {
  definition: { spawn: GridPosition };
  position: GridPosition;
  path: GridPosition[];
  targetId: string | null;
  provokedById: string | null;
  nextAttackAt: number;
  nextWanderAt: number;
}

function runtimeState(realm: InMemoryRealm): {
  player: RuntimePlayerForTest;
  slime: RuntimeMonsterForTest;
} {
  const internal = realm as unknown as {
    players: Map<string, RuntimePlayerForTest>;
    monsters: Map<string, RuntimeMonsterForTest>;
  };
  const player = internal.players.values().next().value;
  const slime = internal.monsters.get("slime-01");
  if (!player || !slime) throw new Error("Expected joined player and starter slime");
  return { player, slime };
}

function provokeSlimeBesidePlayer(realm: InMemoryRealm): {
  player: RuntimePlayerForTest;
  slime: RuntimeMonsterForTest;
} {
  const state = runtimeState(realm);
  state.slime.position = { x: state.player.position.x + 1, y: state.player.position.y };
  state.slime.path = [];
  state.slime.targetId = null;
  state.slime.provokedById = state.player.id;
  state.slime.nextAttackAt = 0;
  return state;
}

describe("authoritative in-memory realm", () => {
  it("accepts a joined player's valid grid movement", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ now: () => now, autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    const welcome = messages.find((message) => message.type === "welcome");
    expect(welcome?.type).toBe("welcome");
    const playerId = welcome!.type === "welcome" ? welcome!.playerId : "";

    realm.handleMessage("peer-1", {
      type: "move",
      destination: { x: STARTER_MAP.playerSpawn.x, y: STARTER_MAP.playerSpawn.y + 1 },
      sequence: 0,
    });
    now = 250;
    realm.step(now);

    const player = realm.snapshot().players.find((candidate) => candidate.id === playerId);
    expect(player?.position).toEqual({
      x: STARTER_MAP.playerSpawn.x,
      y: STARTER_MAP.playerSpawn.y + 1,
    });
  });

  it("advances player movement on the 200 ms visual cadence", () => {
    let now = 0;
    const realm = new InMemoryRealm({ now: () => now, autoStart: false });
    realm.registerPeer("peer-1", () => undefined);
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    realm.handleMessage("peer-1", {
      type: "move",
      destination: { x: 19, y: 27 },
      sequence: 0,
    });

    realm.step(now);
    expect(realm.snapshot().players[0].position).toEqual({ x: 18, y: 27 });
    now = 100;
    realm.step(now);
    expect(realm.snapshot().players[0].position).toEqual({ x: 18, y: 27 });
    now = 200;
    realm.step(now);
    expect(realm.snapshot().players[0].position).toEqual({ x: 19, y: 27 });
  });

  it("makes a slime ignore players until hit, then retaliate for real damage", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ now: () => now, random: () => 1, autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    for (let step = 0; step < 20; step += 1) {
      now += 250;
      realm.step(now);
    }
    expect(
      messages.some(
        (message) =>
          message.type === "event" &&
          message.event.type === "damage" &&
          message.event.sourceId === "slime-01",
      ),
    ).toBe(false);

    realm.handleMessage("peer-1", { type: "target", targetId: "slime-01", sequence: 0 });

    for (let step = 0; step < 80; step += 1) {
      now += 250;
      realm.step(now);
      const slain = messages.some(
        (message) =>
          message.type === "event" &&
          message.event.type === "death" &&
          message.event.entityId === "slime-01",
      );
      if (slain) break;
    }

    const death = messages.find(
      (message) =>
        message.type === "event" &&
        message.event.type === "death" &&
        message.event.entityId === "slime-01",
    );
    expect(death).toBeDefined();

    const snapshot = realm.snapshot();
    const player = snapshot.players[0];
    const slime = snapshot.monsters.find((monster) => monster.id === "slime-01")!;
    expect(slime.alive).toBe(false);
    expect(player.targetId).toBeNull();
    expect(player.masteries.melee.xp).toBeGreaterThan(0);
    const retaliation = messages.find(
      (message) =>
        message.type === "event" &&
        message.event.type === "damage" &&
        message.event.sourceId === "slime-01",
    );
    expect(retaliation?.type).toBe("event");
    if (retaliation?.type === "event" && retaliation.event.type === "damage") {
      expect(retaliation.event.amount).toBeGreaterThan(0);
    }
  });

  it("regenerates two HP per complete second after five seconds without combat", () => {
    let now = 0;
    const realm = new InMemoryRealm({ now: () => now, random: () => 1, autoStart: false });
    realm.registerPeer("peer-1", () => undefined);
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    const { player, slime } = provokeSlimeBesidePlayer(realm);
    player.hp = 80;

    now = 100;
    realm.step(now);
    const damaged = realm.snapshot().players[0];
    expect(damaged.hp).toBeLessThan(damaged.maxHp);
    const hpAfterCombat = damaged.hp;

    // End the provoked chase without creating another combat action.
    slime.position = { ...slime.definition.spawn };
    slime.path = [];
    slime.targetId = null;
    slime.provokedById = null;
    slime.nextWanderAt = Number.MAX_SAFE_INTEGER;

    now = 100 + PLAYER_COMBAT_TIMEOUT_MS;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(hpAfterCombat);

    now += 999;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(hpAfterCombat);

    now += 1;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(
      hpAfterCombat + PLAYER_HEALTH_REGEN_PER_SECOND,
    );

    // A delayed tick resolves the three additional full seconds exactly once.
    now += 3_000;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(
      hpAfterCombat + PLAYER_HEALTH_REGEN_PER_SECOND * 4,
    );

    now += 100_000;
    realm.step(now);
    const healed = realm.snapshot().players[0];
    expect(healed.hp).toBe(healed.maxHp);
  });

  it("never regenerates a dead player", () => {
    let now = 0;
    const realm = new InMemoryRealm({ now: () => now, autoStart: false });
    realm.registerPeer("peer-1", () => undefined);
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    const { player } = provokeSlimeBesidePlayer(realm);
    player.hp = 1;

    now = 100;
    realm.step(now);
    expect(realm.snapshot().players[0]).toMatchObject({ alive: false, hp: 0 });

    now += PLAYER_COMBAT_TIMEOUT_MS + 60_000;
    realm.step(now);
    expect(realm.snapshot().players[0]).toMatchObject({ alive: false, hp: 0 });
  });

  it("awards offensive and defensive mastery XP against monsters far below the player", () => {
    let now = 0;
    const realm = new InMemoryRealm({ now: () => now, random: () => 1, autoStart: false });
    realm.registerPeer("peer-1", () => undefined);
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    const runtime = runtimeState(realm);
    runtime.player.level = 50;

    // A level-1 slime is outside the former level filter for a level-50 player.
    realm.handleMessage("peer-1", { type: "target", targetId: "slime-01", sequence: 0 });
    for (let step = 0; step < 120; step += 1) {
      now += 250;
      realm.step(now);
      if (realm.snapshot().players[0].masteries.melee.xp > 0) break;
    }
    expect(realm.snapshot().players[0].masteries.melee.xp).toBe(5);

    // The one-shot slime never retaliates, so this also proves that giving an
    // attack by itself restarts the same five-second combat window.
    const hpAfterPlayerAttack = realm.snapshot().players[0].hp;
    now += PLAYER_COMBAT_TIMEOUT_MS;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(hpAfterPlayerAttack);
    now += 1_000;
    realm.step(now);
    expect(realm.snapshot().players[0].hp).toBe(
      hpAfterPlayerAttack + PLAYER_HEALTH_REGEN_PER_SECOND,
    );

    // Use the second slime to verify received hits train defense under the
    // same no-level-filter rule.
    const internal = realm as unknown as {
      monsters: Map<string, RuntimeMonsterForTest>;
    };
    const secondSlime = internal.monsters.get("slime-02");
    if (!secondSlime) throw new Error("Expected second starter slime");
    secondSlime.position = {
      x: runtime.player.position.x + 1,
      y: runtime.player.position.y,
    };
    secondSlime.path = [];
    secondSlime.targetId = null;
    secondSlime.provokedById = runtime.player.id;
    secondSlime.nextAttackAt = 0;

    now += 100;
    realm.step(now);
    expect(realm.snapshot().players[0].masteries.defense.xp).toBe(3);
  });

  it("makes idle monsters patrol deterministically inside their spawn area", () => {
    let now = 0;
    const realm = new InMemoryRealm({
      now: () => now,
      random: () => 0.5,
      autoStart: false,
    });
    const slimeDefinition = STARTER_MONSTERS.find((monster) => monster.id === "slime-01")!;
    const visited = new Set<string>();

    for (let step = 0; step < 24; step += 1) {
      now += 700;
      realm.step(now);
      const slime = realm.snapshot().monsters.find((monster) => monster.id === "slime-01")!;
      visited.add(`${slime.position.x},${slime.position.y}`);
      expect(manhattanDistance(slime.position, slimeDefinition.spawn)).toBeLessThanOrEqual(3);
      expect(slime.targetId).toBeNull();
    }

    expect(visited.size).toBeGreaterThan(1);
  });

  it("only lets a defensive monster retaliate after it is attacked", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => now,
      random: () => 0.25,
      autoStart: false,
    });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    for (let step = 0; step < 12; step += 1) {
      now += 250;
      realm.step(now);
    }
    expect(
      messages.some(
        (message) =>
          message.type === "event" &&
          message.event.type === "damage" &&
          message.event.sourceId === "boar-01",
      ),
    ).toBe(false);

    realm.handleMessage("peer-1", { type: "target", targetId: "boar-01", sequence: 0 });
    for (let step = 0; step < 180; step += 1) {
      now += 250;
      realm.step(now);
      const retaliated = messages.some(
        (message) =>
          message.type === "event" &&
          message.event.type === "damage" &&
          message.event.sourceId === "boar-01",
      );
      if (retaliated) break;
    }

    expect(
      messages.some(
        (message) =>
          message.type === "event" &&
          message.event.type === "damage" &&
          message.event.sourceId === "boar-01",
      ),
    ).toBe(true);
  });

  it("lets aggressive monsters detect nearby players and abandon an overlong chase", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({
      now: () => now,
      random: () => 0.75,
      autoStart: false,
    });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    const welcome = messages.find((message) => message.type === "welcome");
    const playerId = welcome?.type === "welcome" ? welcome.playerId : "";
    realm.handleMessage("peer-1", { type: "target", targetId: "wolf-01", sequence: 0 });

    let detected = false;
    for (let step = 0; step < 180; step += 1) {
      now += 250;
      realm.step(now);
      const wolf = realm.snapshot().monsters.find((monster) => monster.id === "wolf-01")!;
      if (wolf.targetId === playerId) {
        detected = true;
        break;
      }
    }
    expect(detected).toBe(true);

    realm.handleMessage("peer-1", {
      type: "move",
      destination: { x: 34, y: 25 },
      sequence: 1,
    });
    let maxDistanceFromSpawn = 0;
    const wolfDefinition = STARTER_MONSTERS.find((monster) => monster.id === "wolf-01")!;
    for (let step = 0; step < 220; step += 1) {
      now += 250;
      realm.step(now);
      const wolf = realm.snapshot().monsters.find((monster) => monster.id === "wolf-01")!;
      maxDistanceFromSpawn = Math.max(
        maxDistanceFromSpawn,
        manhattanDistance(wolf.position, wolfDefinition.spawn),
      );
    }

    const wolf = realm.snapshot().monsters.find((monster) => monster.id === "wolf-01")!;
    expect(maxDistanceFromSpawn).toBeGreaterThanOrEqual(3);
    expect(wolf.targetId).toBeNull();
    expect(manhattanDistance(wolf.position, wolfDefinition.spawn)).toBeLessThanOrEqual(3);
  });

  it("starts rankless and equips all six unrestricted adventurer slots", () => {
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    const initial = realm.snapshot().players[0];
    expect(Object.fromEntries(initial.inventory.map((entry) => [entry.itemId, entry.quantity]))).toMatchObject({
      "starter-potion": 2,
      "coiffe-aventurier": 1,
      "dague-emoussee": 1,
      "tunique-aventurier": 1,
      "pantalon-aventurier": 1,
      "bottes-aventurier": 1,
      "anneau-cuivre": 1,
    });
    expect(initial.rank).toBeNull();
    expect(initial.awakened).toBe(false);
    expect(initial.awakeningEligible).toBe(false);
    expect(initial.speed).toBe(100);
    expect(initial.maxHp).toBe(112);
    expect(initial.equipment).toEqual({
      head: null,
      weapon: null,
      armor: null,
      legs: null,
      boots: null,
      ring: null,
    });

    [
      "coiffe-aventurier",
      "dague-emoussee",
      "tunique-aventurier",
      "pantalon-aventurier",
      "bottes-aventurier",
      "anneau-cuivre",
    ].forEach((itemId, sequence) => {
      realm.handleMessage("peer-1", { type: "equip", itemId, sequence });
    });

    const equipped = realm.snapshot().players[0];
    expect(equipped.equipment).toEqual({
      head: "coiffe-aventurier",
      weapon: "dague-emoussee",
      armor: "tunique-aventurier",
      legs: "pantalon-aventurier",
      boots: "bottes-aventurier",
      ring: "anneau-cuivre",
    });
    expect(equipped.power).toBeGreaterThan(initial.power);
    expect(equipped.maxHp).toBeGreaterThan(initial.maxHp);
    expect(equipped.maxMp).toBeGreaterThan(initial.maxMp);
    expect(equipped.hp).toBe(equipped.maxHp);
    expect(equipped.mp).toBe(equipped.maxMp);

    realm.handleMessage("peer-1", { type: "unequip", slot: "boots", sequence: 6 });
    const withoutBoots = realm.snapshot().players[0];
    expect(withoutBoots.equipment.boots).toBeNull();
    expect(withoutBoots.equipment.ring).toBe("anneau-cuivre");
    expect(withoutBoots.maxHp).toBeGreaterThan(initial.maxHp);
    expect(withoutBoots.maxMp).toBeGreaterThan(initial.maxMp);
    expect(withoutBoots.hp).toBe(withoutBoots.maxHp);
    expect(withoutBoots.mp).toBe(withoutBoots.maxMp);
  });

  it("rejects consumables, unknown items, ranked gear before awakening, and empty slots", () => {
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    realm.handleMessage("peer-1", { type: "equip", itemId: "starter-potion", sequence: 0 });
    realm.handleMessage("peer-1", { type: "equip", itemId: "fragment-de-faille", sequence: 1 });
    realm.handleMessage("peer-1", { type: "equip", itemId: "objet-inconnu", sequence: 2 });
    realm.handleMessage("peer-1", { type: "unequip", slot: "head", sequence: 3 });

    const errors = messages
      .filter((message) => message.type === "error")
      .map((message) => message.code);
    expect(errors).toEqual([
      "ITEM_NOT_EQUIPPABLE",
      "RANK_REQUIRED",
      "UNKNOWN_ITEM",
      "SLOT_EMPTY",
    ]);
    expect(realm.snapshot().players[0].equipment).toEqual({
      head: null,
      weapon: null,
      armor: null,
      legs: null,
      boots: null,
      ring: null,
    });
  });

  it("applies weapon and armor bonuses to real combat damage", () => {
    function firstPlayerHit(equipWeapon: boolean): number {
      let now = 0;
      const messages: ServerMessage[] = [];
      const realm = new InMemoryRealm({ now: () => now, random: () => 1, autoStart: false });
      realm.registerPeer("peer-1", (message) => messages.push(message));
      realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
      const welcome = messages.find((message) => message.type === "welcome");
      const playerId = welcome?.type === "welcome" ? welcome.playerId : "";
      let sequence = 0;
      if (equipWeapon) {
        realm.handleMessage("peer-1", {
          type: "equip",
          itemId: "dague-emoussee",
          sequence: sequence++,
        });
      }
      realm.handleMessage("peer-1", {
        type: "target",
        targetId: "slime-01",
        sequence,
      });
      for (let step = 0; step < 120; step += 1) {
        now += 250;
        realm.step(now);
        const hit = messages.find(
          (message) =>
            message.type === "event" &&
            message.event.type === "damage" &&
            message.event.sourceId === playerId &&
            message.event.targetId === "slime-01",
        );
        if (hit?.type === "event" && hit.event.type === "damage") return hit.event.amount;
      }
      throw new Error("Expected the player to hit the slime");
    }

    function firstBoarHit(equipArmor: boolean): number {
      let now = 0;
      const messages: ServerMessage[] = [];
      const realm = new InMemoryRealm({ now: () => now, random: () => 0.25, autoStart: false });
      realm.registerPeer("peer-1", (message) => messages.push(message));
      realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
      let sequence = 0;
      if (equipArmor) {
        for (const itemId of ["coiffe-aventurier", "tunique-aventurier"]) {
          realm.handleMessage("peer-1", { type: "equip", itemId, sequence: sequence++ });
        }
      }
      realm.handleMessage("peer-1", { type: "target", targetId: "boar-01", sequence });
      for (let step = 0; step < 200; step += 1) {
        now += 250;
        realm.step(now);
        const hit = messages.find(
          (message) =>
            message.type === "event" &&
            message.event.type === "damage" &&
            message.event.sourceId === "boar-01",
        );
        if (hit?.type === "event" && hit.event.type === "damage") return hit.event.amount;
      }
      throw new Error("Expected the boar to retaliate");
    }

    expect(firstPlayerHit(true)).toBeGreaterThan(firstPlayerHit(false));
    expect(firstBoarHit(true)).toBeLessThan(firstBoarHit(false));
  });

  it("adds one looted item to authoritative inventory before emitting its event", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ now: () => now, random: () => 0, autoStart: false });
    let quantityWhenLootEventArrived = 0;
    realm.registerPeer("peer-1", (message) => {
      messages.push(message);
      if (message.type === "event" && message.event.type === "loot") {
        const lootItemId = message.event.itemId;
        quantityWhenLootEventArrived =
          realm
            .snapshot()
            .players[0]?.inventory.find((entry) => entry.itemId === lootItemId)
            ?.quantity ?? 0;
      }
    });
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    realm.handleMessage("peer-1", { type: "target", targetId: "slime-01", sequence: 0 });

    for (let step = 0; step < 120; step += 1) {
      now += 250;
      realm.step(now);
      if (!realm.snapshot().monsters.find((monster) => monster.id === "slime-01")?.alive) break;
    }

    const gel = realm
      .snapshot()
      .players[0].inventory.find((entry) => entry.itemId === "gelee-claire");
    expect(gel?.quantity).toBe(1);
    expect(quantityWhenLootEventArrived).toBe(1);
    expect(
      messages.filter(
        (message) =>
          message.type === "event" &&
          message.event.type === "loot" &&
          message.event.itemId === "gelee-claire",
      ),
    ).toHaveLength(1);
  });

  it("rejects replayed sequence numbers", () => {
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });

    const move = {
      type: "move" as const,
      destination: { x: STARTER_MAP.playerSpawn.x, y: STARTER_MAP.playerSpawn.y + 1 },
      sequence: 4,
    };
    realm.handleMessage("peer-1", move);
    realm.handleMessage("peer-1", move);

    expect(
      messages.some((message) => message.type === "error" && message.code === "STALE_SEQUENCE"),
    ).toBe(true);
  });

  it("accepts sequence zero again when a refreshed client resumes its player", () => {
    const firstMessages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ autoStart: false });
    realm.registerPeer("peer-1", (message) => firstMessages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
    const firstWelcome = firstMessages.find((message) => message.type === "welcome");
    if (!firstWelcome || firstWelcome.type !== "welcome") throw new Error("Welcome expected");

    realm.handleMessage("peer-1", {
      type: "move",
      destination: { x: STARTER_MAP.playerSpawn.x, y: STARTER_MAP.playerSpawn.y + 1 },
      sequence: 12,
    });
    realm.disconnectPeer("peer-1");

    const refreshedMessages: ServerMessage[] = [];
    realm.registerPeer("peer-2", (message) => refreshedMessages.push(message));
    realm.joinPeer("peer-2", {
      type: "join",
      name: "Testeur",
      resumeToken: firstWelcome.resumeToken,
    });
    realm.handleMessage("peer-2", {
      type: "move",
      destination: { x: STARTER_MAP.playerSpawn.x + 1, y: STARTER_MAP.playerSpawn.y },
      sequence: 0,
    });

    expect(
      refreshedMessages.some(
        (message) => message.type === "error" && message.code === "STALE_SEQUENCE",
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { manhattanDistance } from "../shared/grid";
import type { ServerMessage } from "../shared/types";
import { STARTER_MAP, STARTER_MONSTERS } from "../shared/world";
import { InMemoryRealm } from "./realm";

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
});

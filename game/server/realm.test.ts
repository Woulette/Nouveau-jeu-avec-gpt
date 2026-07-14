import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../shared/types";
import { STARTER_MAP } from "../shared/world";
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

  it("pursues the current target tile and resolves combat on the server", () => {
    let now = 0;
    const messages: ServerMessage[] = [];
    const realm = new InMemoryRealm({ now: () => now, random: () => 1, autoStart: false });
    realm.registerPeer("peer-1", (message) => messages.push(message));
    realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
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

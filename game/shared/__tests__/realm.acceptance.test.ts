import { describe, expect, it } from "vitest";

import { InMemoryRealm } from "@/game/server/realm";
import type { ServerMessage } from "../types";

interface PeerHarness {
  messages: ServerMessage[];
  playerId: string;
  resumeToken: string;
}

function joinPeer(realm: InMemoryRealm, peerId: string, name = peerId): PeerHarness {
  const messages: ServerMessage[] = [];
  realm.registerPeer(peerId, (message) => messages.push(message));
  realm.joinPeer(peerId, { type: "join", name });
  const welcome = messages.find((message) => message.type === "welcome");
  if (!welcome || welcome.type !== "welcome") throw new Error("Expected a welcome message");
  return { messages, playerId: welcome.playerId, resumeToken: welcome.resumeToken };
}

function stepUntil(
  realm: InMemoryRealm,
  clock: { now: number },
  predicate: () => boolean,
  maximumSteps = 240,
): void {
  for (let index = 0; index < maximumSteps && !predicate(); index += 1) {
    clock.now += 250;
    realm.step(clock.now);
  }
  expect(predicate()).toBe(true);
}

describe("authoritative realm acceptance", () => {
  it("makes both players visible and gives a late joiner the current shared state", () => {
    const realm = new InMemoryRealm({ autoStart: false });
    const first = joinPeer(realm, "peer-1", "Aube");
    const second = joinPeer(realm, "peer-2", "Silex");

    const snapshot = realm.snapshot();
    expect(snapshot.players.map((player) => player.id).sort()).toEqual(
      [first.playerId, second.playerId].sort(),
    );

    const secondWelcome = second.messages.find((message) => message.type === "welcome");
    expect(secondWelcome?.type).toBe("welcome");
    if (secondWelcome?.type === "welcome") {
      expect(secondWelcome.snapshot.players.map((player) => player.id).sort()).toEqual(
        [first.playerId, second.playerId].sort(),
      );
    }
  });

  it("resumes the same authoritative player instead of duplicating an avatar", () => {
    const now = 0;
    const realm = new InMemoryRealm({ now: () => now, autoStart: false });
    const first = joinPeer(realm, "peer-1", "Aube");
    realm.disconnectPeer("peer-1");

    const resumedMessages: ServerMessage[] = [];
    realm.registerPeer("peer-2", (message) => resumedMessages.push(message));
    realm.joinPeer("peer-2", {
      type: "join",
      name: "Aube",
      resumeToken: first.resumeToken,
    });

    const welcome = resumedMessages.find((message) => message.type === "welcome");
    expect(welcome?.type).toBe("welcome");
    if (welcome?.type === "welcome") expect(welcome.playerId).toBe(first.playerId);
    expect(realm.snapshot().players).toHaveLength(1);
    expect(realm.snapshot().players[0].id).toBe(first.playerId);
  });

  it("keeps action mastery XP separate from general kill XP and across level-up", () => {
    const clock = { now: 0 };
    const realm = new InMemoryRealm({ now: () => clock.now, random: () => 1, autoStart: false });
    const peer = joinPeer(realm, "peer-1", "Aube");

    for (let kill = 0; kill < 3; kill += 1) {
      realm.handleMessage("peer-1", {
        type: "target",
        targetId: "slime-01",
        sequence: kill,
      });
      stepUntil(
        realm,
        clock,
        () => realm.snapshot().monsters.find((monster) => monster.id === "slime-01")?.alive === false,
      );

      if (kill < 2) {
        stepUntil(
          realm,
          clock,
          () => realm.snapshot().monsters.find((monster) => monster.id === "slime-01")?.alive === true,
          40,
        );
      }
    }

    const player = realm.snapshot().players.find((candidate) => candidate.id === peer.playerId)!;
    expect(player.level).toBe(2);
    expect(player.xp).toBe(4);
    expect(player.masteries.melee.level).toBe(1);
    // Rankless damage has no hidden +5% bonus. The XP earned from the resulting
    // extra combat action is still preserved when the general level advances.
    expect(player.masteries.melee.xp).toBe(40);
    expect(player.masteries.ranged).toMatchObject({ level: 0, xp: 0 });
    expect(player.masteries.magic).toMatchObject({ level: 0, xp: 0 });
  });

  it("keeps the adventurer rankless and rejects skills before the QG awakening", () => {
    const realm = new InMemoryRealm({ autoStart: false });
    const peer = joinPeer(realm, "peer-1", "Aube");
    const player = realm.snapshot().players[0];

    expect(player.rank).toBeNull();
    expect(player.awakened).toBe(false);
    expect(player.awakeningEligible).toBe(false);
    realm.handleMessage("peer-1", { type: "cast", slot: 0, sequence: 0 });

    expect(
      peer.messages.some((message) => message.type === "error" && message.code === "SKILL_LOCKED"),
    ).toBe(true);
  });
});

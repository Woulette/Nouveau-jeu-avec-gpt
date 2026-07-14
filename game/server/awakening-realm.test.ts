import { describe, expect, it } from "vitest";

import {
  AWAKENING_CLASS_NAMES,
  AWAKENING_MASTERY_POINTS,
  HEADQUARTERS_MASTER_ID,
  HEADQUARTERS_MASTER_POSITION,
} from "../shared/awakening";
import { manhattanDistance } from "../shared/grid";
import { profileFromPlayerSnapshot } from "../shared/save";
import type {
  AwakenedCombatPath,
  CombatPath,
  GridPosition,
  PlayerRank,
  ServerMessage,
} from "../shared/types";
import { STARTER_MAP } from "../shared/world";
import { InMemoryRealm } from "./realm";

interface RuntimeMasteryForTest {
  level: number;
  xp: number;
}

interface RuntimePlayerForTest {
  id: string;
  position: GridPosition;
  path: GridPosition[];
  alive: boolean;
  hp: number;
  level: number;
  rank: PlayerRank | null;
  combatPath: CombatPath;
  className: string;
  zoneId: string;
  pendingNpcId: string | null;
  masteries: Record<"melee" | "ranged" | "magic" | "defense", RuntimeMasteryForTest>;
}

function createHarness() {
  const clock = { now: 0 };
  const messages: ServerMessage[] = [];
  const realm = new InMemoryRealm({
    now: () => clock.now,
    random: () => 1,
    autoStart: false,
  });
  realm.registerPeer("peer-1", (message) => messages.push(message));
  realm.joinPeer("peer-1", { type: "join", name: "Testeur" });
  const internal = realm as unknown as { players: Map<string, RuntimePlayerForTest> };
  const player = internal.players.values().next().value;
  if (!player) throw new Error("Expected a joined player");
  return { clock, messages, player, realm };
}

function awakeningDialogues(messages: ServerMessage[]) {
  return messages.flatMap((message) =>
    message.type === "event" && message.event.type === "awakening-dialogue"
      ? [message.event]
      : [],
  );
}

describe("headquarters awakening", () => {
  it("walks to the headquarters master and sends the eligible dialogue once", () => {
    const { clock, messages, player, realm } = createHarness();
    player.level = 10;

    realm.handleMessage("peer-1", {
      type: "interact-npc",
      npcId: HEADQUARTERS_MASTER_ID,
      sequence: 0,
    });

    expect(awakeningDialogues(messages)).toHaveLength(0);
    expect(player.pendingNpcId).toBe(HEADQUARTERS_MASTER_ID);

    for (let step = 0; step < 160 && awakeningDialogues(messages).length === 0; step += 1) {
      clock.now += 100;
      realm.step(clock.now);
    }

    expect(manhattanDistance(player.position, HEADQUARTERS_MASTER_POSITION)).toBeLessThanOrEqual(1);
    expect(player.pendingNpcId).toBeNull();
    expect(awakeningDialogues(messages)).toEqual([
      expect.objectContaining({
        playerId: player.id,
        npcId: HEADQUARTERS_MASTER_ID,
        status: "eligible",
        requiredLevel: 10,
        currentLevel: 10,
        rank: null,
      }),
    ]);

    for (let step = 0; step < 10; step += 1) {
      clock.now += 100;
      realm.step(clock.now);
    }
    expect(awakeningDialogues(messages)).toHaveLength(1);
  });

  it("answers below level 10 and after an already completed awakening", () => {
    const { messages, player, realm } = createHarness();
    player.position = { x: HEADQUARTERS_MASTER_POSITION.x, y: HEADQUARTERS_MASTER_POSITION.y + 1 };
    player.level = 9;

    realm.handleMessage("peer-1", {
      type: "interact-npc",
      npcId: HEADQUARTERS_MASTER_ID,
      sequence: 0,
    });
    expect(awakeningDialogues(messages).at(-1)).toMatchObject({
      status: "level-required",
      currentLevel: 9,
      requiredLevel: 10,
    });

    player.level = 10;
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "melee",
      sequence: 1,
    });
    realm.handleMessage("peer-1", {
      type: "interact-npc",
      npcId: HEADQUARTERS_MASTER_ID,
      sequence: 2,
    });
    expect(awakeningDialogues(messages).at(-1)).toMatchObject({
      status: "completed",
      className: "Épéiste",
      rank: "E",
    });
  });

  it.each([
    ["melee", "Épéiste"],
    ["ranged", "Archer"],
    ["magic", "Magicien"],
  ] as const)(
    "assigns the irreversible %s path, rank E and its 25 mastery points",
    (combatPath, expectedClass) => {
      const { messages, player, realm } = createHarness();
      player.level = 10;
      player.position = {
        x: HEADQUARTERS_MASTER_POSITION.x,
        y: HEADQUARTERS_MASTER_POSITION.y + 1,
      };
      player.hp = realm.snapshot().players[0].maxHp;
      player.masteries.melee = { level: 8, xp: 21 };
      player.masteries.ranged = { level: 3, xp: 9 };
      player.masteries.magic = { level: 2, xp: 7 };
      player.masteries.defense = { level: 6, xp: 13 };

      realm.handleMessage("peer-1", {
        type: "awaken",
        npcId: HEADQUARTERS_MASTER_ID,
        combatPath,
        sequence: 0,
      });

      const awakened = realm.snapshot().players[0];
      expect(awakened).toMatchObject({
        rank: "E",
        awakened: true,
        awakeningEligible: false,
        combatPath,
        className: expectedClass,
      });
      expect(awakened.hp).toBe(awakened.maxHp);
      for (const key of ["melee", "ranged", "magic"] as const) {
        expect(awakened.masteries[key]).toMatchObject({
          level: key === combatPath ? AWAKENING_MASTERY_POINTS : 0,
          xp: 0,
        });
      }
      expect(awakened.masteries.defense).toMatchObject({ level: 6, xp: 13 });
      expect(
        messages.some(
          (message) =>
            message.type === "event" &&
            message.event.type === "awakening-complete" &&
            message.event.combatPath === combatPath &&
            message.event.className === AWAKENING_CLASS_NAMES[combatPath] &&
            message.event.rank === "E",
        ),
      ).toBe(true);

      const otherPath: AwakenedCombatPath = combatPath === "melee" ? "ranged" : "melee";
      realm.handleMessage("peer-1", {
        type: "awaken",
        npcId: HEADQUARTERS_MASTER_ID,
        combatPath: otherPath,
        sequence: 1,
      });
      expect(
        messages.some(
          (message) => message.type === "error" && message.code === "ALREADY_AWAKENED",
        ),
      ).toBe(true);
      expect(realm.snapshot().players[0]).toMatchObject({
        rank: "E",
        combatPath,
        className: expectedClass,
      });
    },
  );

  it("enforces level, life, world zone, proximity and the known NPC", () => {
    const { messages, player, realm } = createHarness();
    player.level = 10;

    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "magic",
      sequence: 0,
    });
    player.position = { x: HEADQUARTERS_MASTER_POSITION.x, y: HEADQUARTERS_MASTER_POSITION.y + 1 };
    player.level = 9;
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "magic",
      sequence: 1,
    });
    player.level = 10;
    player.alive = false;
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "magic",
      sequence: 2,
    });
    player.alive = true;
    player.zoneId = "rift:test";
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "magic",
      sequence: 3,
    });
    player.zoneId = STARTER_MAP.id;
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: "unknown-npc",
      combatPath: "magic",
      sequence: 4,
    });

    const errorCodes = messages.flatMap((message) =>
      message.type === "error" ? [message.code] : [],
    );
    expect(errorCodes).toEqual([
      "NPC_TOO_FAR",
      "AWAKENING_LEVEL_REQUIRED",
      "PLAYER_DEAD",
      "NPC_UNAVAILABLE",
      "NPC_NOT_FOUND",
    ]);
    expect(player.rank).toBeNull();
    expect(player.combatPath).toBe("adventurer");
  });

  it("restores the chosen path and rank from the portable offline save", () => {
    const { player, realm } = createHarness();
    player.level = 10;
    player.position = {
      x: HEADQUARTERS_MASTER_POSITION.x,
      y: HEADQUARTERS_MASTER_POSITION.y + 1,
    };
    player.masteries.defense = { level: 4, xp: 12 };
    realm.handleMessage("peer-1", {
      type: "awaken",
      npcId: HEADQUARTERS_MASTER_ID,
      combatPath: "ranged",
      sequence: 0,
    });
    const savedProfile = profileFromPlayerSnapshot(realm.snapshot().players[0]);

    const restored = new InMemoryRealm({ allowClientSaves: true, autoStart: false });
    restored.registerPeer("peer-restored", () => undefined);
    restored.joinPeer("peer-restored", {
      type: "join",
      name: savedProfile.name,
      savedProfile,
    });

    expect(restored.snapshot().players[0]).toMatchObject({
      level: 10,
      rank: "E",
      awakened: true,
      combatPath: "ranged",
      className: "Archer",
      masteries: {
        melee: { level: 0, xp: 0 },
        ranged: { level: 25, xp: 0 },
        magic: { level: 0, xp: 0 },
        defense: { level: 4, xp: 12 },
      },
    });
  });
});

import { describe, expect, it } from "vitest";

import { isKnownItem } from "../shared/items";
import { RIFT_RANKS } from "../shared/rifts";
import {
  RIFT_CREATURE_NAMES,
  escapedRiftBoss,
  escapedRiftBossForRank,
  riftRoomMonsters,
  riftRoomMonstersForRank,
} from "./rift-content";

describe("ranked rift creature content", () => {
  it("keeps the existing rank-E room and escaped-boss values compatible", () => {
    expect(riftRoomMonsters("instance-e", 1)).toEqual([
      expect.objectContaining({
        id: "instance-e-r1-a",
        name: "Gelée distordue",
        spawn: { x: 10, y: 7 },
        level: 2,
        maxHp: 42,
        defense: 2,
        attackDamage: 8,
        xpReward: 32,
        lootItemId: "gelee-claire",
        lootChance: 0.75,
      }),
      expect.objectContaining({ id: "instance-e-r1-b", spawn: { x: 12, y: 11 } }),
    ]);
    expect(riftRoomMonsters("instance-e", 2)[0]).toMatchObject({
      name: "Traqueur fracturé",
      maxHp: 68,
      attackDamage: 12,
      xpReward: 52,
    });
    expect(riftRoomMonsters("instance-e", 3)[0]).toMatchObject({
      name: "Gardien de la Brèche",
      maxHp: 190,
      attackDamage: 18,
      xpReward: 120,
      isBoss: true,
    });
    expect(escapedRiftBoss("rift-e-1", { x: 54, y: 11 })).toMatchObject({
      id: "escaped-rift-e-1",
      name: "Gardien échappé",
      spawn: { x: 54, y: 11 },
      level: 6,
      maxHp: 260,
      defense: 7,
      attackDamage: 22,
      xpReward: 170,
    });
  });

  it("provides named, valid three-room content for every playable rank", () => {
    expect(Object.keys(RIFT_CREATURE_NAMES)).toEqual(RIFT_RANKS);
    for (const rank of RIFT_RANKS) {
      const first = riftRoomMonstersForRank(`instance-${rank}`, rank, 1);
      const second = riftRoomMonstersForRank(`instance-${rank}`, rank, 2);
      const boss = riftRoomMonstersForRank(`instance-${rank}`, rank, 3);
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      expect(boss).toHaveLength(1);
      expect(new Set([...first, ...second, ...boss].map((monster) => monster.id)).size).toBe(5);
      expect(first.every((monster) => monster.name === RIFT_CREATURE_NAMES[rank].firstWave)).toBe(true);
      expect(second.every((monster) => monster.name === RIFT_CREATURE_NAMES[rank].secondWave)).toBe(true);
      expect(boss[0]).toMatchObject({ name: RIFT_CREATURE_NAMES[rank].boss, isBoss: true });
      expect([...first, ...second, ...boss].every((monster) => isKnownItem(monster.lootItemId))).toBe(true);
    }
  });

  it("raises combat values monotonically from E through S", () => {
    let previousRoomHp = 0;
    let previousRoomDamage = 0;
    let previousBossHp = 0;
    let previousBossXp = 0;
    let previousEscapedHp = 0;

    for (const rank of RIFT_RANKS) {
      const first = riftRoomMonstersForRank(`instance-${rank}`, rank, 1)[0];
      const boss = riftRoomMonstersForRank(`instance-${rank}`, rank, 3)[0];
      const escaped = escapedRiftBossForRank(`rift-${rank}`, rank, { x: 54, y: 11 });
      expect(first.maxHp).toBeGreaterThan(previousRoomHp);
      expect(first.attackDamage).toBeGreaterThan(previousRoomDamage);
      expect(boss.maxHp).toBeGreaterThan(previousBossHp);
      expect(boss.xpReward).toBeGreaterThan(previousBossXp);
      expect(escaped.maxHp).toBeGreaterThan(previousEscapedHp);
      previousRoomHp = first.maxHp;
      previousRoomDamage = first.attackDamage;
      previousBossHp = boss.maxHp;
      previousBossXp = boss.xpReward;
      previousEscapedHp = escaped.maxHp;
    }
  });

  it("copies caller positions into ranked escaped guardians", () => {
    const position = { x: 43, y: 26 };
    const boss = escapedRiftBossForRank("rift-s-1", "S", position);
    position.x = 1;
    expect(boss.spawn).toEqual({ x: 43, y: 26 });
  });
});

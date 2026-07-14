import { describe, expect, it } from "vitest";

import {
  combatStatForPath,
  generalXpToNext,
  masteryXpToNext,
  outgoingPlayerDamage,
  playerMaxHp,
  RANK_BONUS,
  RANK_TRAINING_MULTIPLIER,
  trainingXpForAction,
} from "../formulas";
import type { PlayerRank } from "../types";

const RANKS: readonly PlayerRank[] = ["E", "D", "C", "B", "A", "S", "SS", "SSS", "OMEGA"];

describe("rank formula acceptance", () => {
  it("keeps the validated, non-exponential training multipliers", () => {
    expect(RANK_TRAINING_MULTIPLIER).toEqual({
      E: 1,
      D: 2,
      C: 3,
      B: 4,
      A: 6,
      S: 8,
      SS: 12,
      SSS: 16,
      OMEGA: 20,
    });

    expect(RANKS.map((rank) => trainingXpForAction(10, rank))).toEqual([
      10, 20, 30, 40, 60, 80, 120, 160, 200,
    ]);
  });

  it("uses each rank bonus as a total replacement, not a cumulative stack", () => {
    expect(RANK_BONUS).toEqual({
      E: 0.05,
      D: 0.1,
      C: 0.15,
      B: 0.25,
      A: 0.35,
      S: 0.5,
      SS: 0.65,
      SSS: 0.8,
      OMEGA: 1,
    });

    const hpBeforeRank = 100 + 10 * 12;
    expect(playerMaxHp(10, "C")).toBe(Math.floor(hpBeforeRank * 1.15));
    expect(playerMaxHp(10, "OMEGA")).toBe(hpBeforeRank * 2);

    const rawDamageBeforeRank = 5 + 10 * 1.8;
    expect(outgoingPlayerDamage(10, "D")).toBe(Math.floor(rawDamageBeforeRank * 1.1));
    expect(outgoingPlayerDamage(10, "OMEGA")).toBe(Math.floor(rawDamageBeforeRank * 2));
  });
});

describe("independent general and mastery progression", () => {
  it("uses separate thresholds whose inputs cannot influence each other", () => {
    const generalAtLevel20 = generalXpToNext(20);
    const masteryAtLevel20 = masteryXpToNext(20);

    expect(generalAtLevel20).not.toBe(masteryAtLevel20);
    expect(generalXpToNext(20)).toBe(generalAtLevel20);
    expect(masteryXpToNext(500)).toBeGreaterThan(masteryAtLevel20);
    expect(generalXpToNext(20)).toBe(generalAtLevel20);
  });

  it("adds only the mastery selected by the active combat path", () => {
    const trained = { melee: 12, ranged: 34, magic: 56 };

    expect(combatStatForPath("adventurer", 20, trained)).toBe(32);
    expect(combatStatForPath("melee", 20, trained)).toBe(32);
    expect(combatStatForPath("ranged", 20, trained)).toBe(54);
    expect(combatStatForPath("magic", 20, trained)).toBe(76);
  });
});

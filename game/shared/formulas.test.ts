import { describe, expect, it } from "vitest";
import {
  BASE_MOVE_INTERVAL_MS,
  BASE_SPEED,
  damageAfterDefense,
  generalXpToNext,
  isAwakeningEligible,
  MAX_SPEED,
  masteryXpToNext,
  playerMaxHp,
  playerMoveIntervalMs,
  playerSpeed,
  rankBonus,
  RANK_TRAINING_MULTIPLIER,
  trainingXpForAction,
} from "./formulas";

describe("progression formulas", () => {
  it("keeps XP curves strictly increasing", () => {
    for (let level = 1; level < 100; level += 1) {
      expect(generalXpToNext(level + 1)).toBeGreaterThan(generalXpToNext(level));
      expect(masteryXpToNext(level + 1)).toBeGreaterThan(masteryXpToNext(level));
    }
  });

  it("applies the validated rank training multipliers", () => {
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
  });

  it("raises rank-E health by five percent", () => {
    expect(playerMaxHp(1, "E")).toBe(Math.floor((100 + 12) * 1.05));
  });

  it("gives a rankless adventurer no hidden rank bonus", () => {
    expect(rankBonus(null)).toBe(0);
    expect(playerMaxHp(1, null)).toBe(112);
    expect(trainingXpForAction(10, null)).toBe(10);
  });

  it("starts speed at 100, grants one point every ten levels, and caps it at 300", () => {
    expect(playerSpeed(1)).toBe(BASE_SPEED);
    expect(playerSpeed(9)).toBe(100);
    expect(playerSpeed(10)).toBe(101);
    expect(playerSpeed(19)).toBe(101);
    expect(playerSpeed(20)).toBe(102);
    expect(playerSpeed(1_999)).toBe(299);
    expect(playerSpeed(2_000)).toBe(MAX_SPEED);
    expect(playerSpeed(50_000)).toBe(MAX_SPEED);
  });

  it("turns Speed into a real movement cadence without changing level-1 movement", () => {
    expect(playerMoveIntervalMs(1)).toBe(BASE_MOVE_INTERVAL_MS);
    expect(playerMoveIntervalMs(10)).toBeCloseTo(20_000 / 101, 5);
    expect(playerMoveIntervalMs(2_000)).toBeCloseTo(200 / 3, 5);
  });

  it("only marks a rankless level-10 player as eligible for the future QG awakening", () => {
    expect(isAwakeningEligible(9, null)).toBe(false);
    expect(isAwakeningEligible(10, null)).toBe(true);
    expect(isAwakeningEligible(10, "E")).toBe(false);
  });

  it("never reduces valid incoming damage to zero", () => {
    expect(damageAfterDefense(10, 10_000)).toBe(1);
  });
});

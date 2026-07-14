import { describe, expect, it } from "vitest";
import {
  damageAfterDefense,
  generalXpToNext,
  masteryXpToNext,
  playerMaxHp,
  RANK_TRAINING_MULTIPLIER,
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

  it("never reduces valid incoming damage to zero", () => {
    expect(damageAfterDefense(10, 10_000)).toBe(1);
  });
});

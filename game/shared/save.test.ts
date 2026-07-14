import { describe, expect, it } from "vitest";

import {
  isProfileProgressRegression,
  localPlayerSaveSchema,
  persistedPlayerProfileSchema,
  type PersistedPlayerProfile,
} from "./save";

const validProfile: PersistedPlayerProfile = {
  name: "Aube",
  position: { x: 17, y: 27 },
  hp: 100,
  mp: 35,
  level: 2,
  xp: 12,
  rank: null,
  combatPath: "adventurer",
  className: "Aventurier",
  masteries: {
    melee: { level: 1, xp: 4 },
    ranged: { level: 0, xp: 0 },
    magic: { level: 0, xp: 0 },
    defense: { level: 1, xp: 7 },
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
};

describe("versioned player saves", () => {
  it("accepts a bounded portable player profile", () => {
    expect(persistedPlayerProfileSchema.parse(validProfile)).toEqual(validProfile);
    expect(
      localPlayerSaveSchema.parse({ version: 2, savedAt: 123, profile: validProfile }),
    ).toMatchObject({ version: 2, savedAt: 123 });
  });

  it("rejects unknown save versions and unreasonable quantities", () => {
    expect(
      localPlayerSaveSchema.safeParse({ version: 1, savedAt: 123, profile: validProfile }).success,
    ).toBe(false);
    expect(
      persistedPlayerProfileSchema.safeParse({
        ...validProfile,
        inventory: [{ itemId: "starter-potion", quantity: 1_000_000 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a restarted realm snapshot that would erase local progression", () => {
    const resetProfile = {
      ...validProfile,
      level: 1,
      xp: 0,
      masteries: {
        melee: { level: 0, xp: 0 },
        ranged: { level: 0, xp: 0 },
        magic: { level: 0, xp: 0 },
        defense: { level: 0, xp: 0 },
      },
    };

    expect(isProfileProgressRegression(resetProfile, validProfile)).toBe(true);
    expect(isProfileProgressRegression(validProfile, resetProfile)).toBe(false);
  });

  it("accepts mutable state changes when permanent progression did not go backwards", () => {
    const afterCombat = {
      ...validProfile,
      position: { x: 22, y: 31 },
      hp: 12,
      inventory: [],
    };

    expect(isProfileProgressRegression(afterCombat, validProfile)).toBe(false);
  });

  it("understands mastery XP resets when the mastery level increases", () => {
    const levelledMastery = {
      ...validProfile,
      masteries: {
        ...validProfile.masteries,
        melee: { level: 2, xp: 0 },
      },
    };

    expect(isProfileProgressRegression(levelledMastery, validProfile)).toBe(false);
    expect(isProfileProgressRegression(validProfile, levelledMastery)).toBe(true);
  });
});

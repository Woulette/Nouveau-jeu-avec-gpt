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
  gold: 87,
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

  it("migrates an existing v2 profile without currency to zero gold", () => {
    const legacyProfile: Partial<PersistedPlayerProfile> = { ...validProfile };
    delete legacyProfile.gold;
    expect(persistedPlayerProfileSchema.parse(legacyProfile).gold).toBe(0);
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

  it("accepts the designed awakening transfer while protecting its irreversible path", () => {
    const eligible: PersistedPlayerProfile = {
      ...validProfile,
      level: 10,
      xp: 42,
      masteries: {
        melee: { level: 8, xp: 17 },
        ranged: { level: 0, xp: 0 },
        magic: { level: 0, xp: 0 },
        defense: { level: 6, xp: 11 },
      },
    };
    const awakenedArcher: PersistedPlayerProfile = {
      ...eligible,
      rank: "E",
      combatPath: "ranged",
      className: "Archer",
      masteries: {
        melee: { level: 0, xp: 0 },
        ranged: { level: 25, xp: 0 },
        magic: { level: 0, xp: 0 },
        defense: { level: 6, xp: 11 },
      },
    };

    expect(persistedPlayerProfileSchema.safeParse(awakenedArcher).success).toBe(true);
    expect(isProfileProgressRegression(awakenedArcher, eligible)).toBe(false);
    expect(isProfileProgressRegression(eligible, awakenedArcher)).toBe(true);
    expect(
      isProfileProgressRegression(
        { ...awakenedArcher, combatPath: "magic", className: "Magicien" },
        awakenedArcher,
      ),
    ).toBe(true);
    expect(
      isProfileProgressRegression(
        { ...awakenedArcher, rank: "D" },
        awakenedArcher,
      ),
    ).toBe(false);
    expect(
      isProfileProgressRegression(
        { ...awakenedArcher, rank: "E" },
        { ...awakenedArcher, rank: "D" },
      ),
    ).toBe(true);
  });

  it("rejects impossible rank, path and level combinations", () => {
    expect(
      persistedPlayerProfileSchema.safeParse({
        ...validProfile,
        rank: "E",
      }).success,
    ).toBe(false);
    expect(
      persistedPlayerProfileSchema.safeParse({
        ...validProfile,
        combatPath: "melee",
      }).success,
    ).toBe(false);
    expect(
      persistedPlayerProfileSchema.safeParse({
        ...validProfile,
        rank: "E",
        combatPath: "melee",
        className: "Épéiste",
      }).success,
    ).toBe(false);
  });
});

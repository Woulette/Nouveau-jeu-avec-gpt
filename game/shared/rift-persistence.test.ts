import { describe, expect, it } from "vitest";

import { RIFT_LIFETIME_MS, RIFT_RANKS, RIFT_SPAWN_LOCATIONS } from "./rifts";
import {
  LEGACY_RIFT_WORLD_SAVE_VERSION,
  RIFT_WORLD_SAVE_VERSION,
  legacyPersistedRiftWorldStateSchema,
  migrateRiftWorldState,
  persistedRiftWorldStateSchema,
} from "./rift-persistence";

function persistedWorld() {
  return {
    version: RIFT_WORLD_SAVE_VERSION,
    savedAt: 10_000,
    nextRiftSpawnAt: 900_000,
    riftSequence: 1,
    rifts: [
      {
        id: "rift-e-1",
        rank: "E" as const,
        position: { ...RIFT_SPAWN_LOCATIONS[0].position },
        spawnedAt: 0,
        expiresAt: RIFT_LIFETIME_MS,
        status: "open" as const,
        outsideBossAlive: false,
        outsideBoss: null,
      },
    ],
  };
}

describe("versioned local rift world persistence", () => {
  it("accepts stable timestamps and an escaped boss payload", () => {
    const open = persistedRiftWorldStateSchema.parse(persistedWorld());
    expect(open.rifts[0].expiresAt - open.rifts[0].spawnedAt).toBe(RIFT_LIFETIME_MS);

    const escaped = persistedRiftWorldStateSchema.parse({
      ...persistedWorld(),
      savedAt: RIFT_LIFETIME_MS,
      rifts: [
        {
          ...persistedWorld().rifts[0],
          status: "boss-escaped",
          outsideBossAlive: true,
          outsideBoss: { position: { x: 54, y: 11 }, hp: 123 },
        },
      ],
    });
    expect(escaped.rifts[0]).toMatchObject({
      status: "boss-escaped",
      outsideBoss: { hp: 123 },
    });
  });

  it("rejects reset deadlines, unknown spawn tiles, and incoherent boss flags", () => {
    const base = persistedWorld();
    expect(
      persistedRiftWorldStateSchema.safeParse({
        ...base,
        rifts: [{ ...base.rifts[0], expiresAt: RIFT_LIFETIME_MS + 1 }],
      }).success,
    ).toBe(false);
    expect(
      persistedRiftWorldStateSchema.safeParse({
        ...base,
        rifts: [{ ...base.rifts[0], position: { x: 1, y: 1 } }],
      }).success,
    ).toBe(false);
    expect(
      persistedRiftWorldStateSchema.safeParse({
        ...base,
        rifts: [{ ...base.rifts[0], status: "boss-escaped", outsideBossAlive: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate ids or occupied portal tiles", () => {
    const base = persistedWorld();
    expect(
      persistedRiftWorldStateSchema.safeParse({
        ...base,
        rifts: [base.rifts[0], { ...base.rifts[0] }],
      }).success,
    ).toBe(false);
  });

  it.each(RIFT_RANKS)("round-trips an authoritative rank-%s portal in v2", (rank) => {
    const location = RIFT_SPAWN_LOCATIONS.find((candidate) => candidate.rank === rank);
    expect(location).toBeDefined();
    if (!location) return;
    const state = persistedRiftWorldStateSchema.parse({
      ...persistedWorld(),
      rifts: [{
        ...persistedWorld().rifts[0],
        id: `rift-${rank.toLowerCase()}-1`,
        rank,
        position: { ...location.position },
      }],
    });
    expect(state.version).toBe(2);
    expect(state.rifts[0].rank).toBe(rank);
    expect(state.rifts[0].expiresAt).toBe(state.rifts[0].spawnedAt + RIFT_LIFETIME_MS);
  });

  it("migrates the deployed v1 payload without resetting time or escaped-boss progress", () => {
    const legacy = {
      ...persistedWorld(),
      version: LEGACY_RIFT_WORLD_SAVE_VERSION,
      savedAt: RIFT_LIFETIME_MS + 12_345,
      nextRiftSpawnAt: RIFT_LIFETIME_MS + 90_000,
      rifts: [
        {
          ...persistedWorld().rifts[0],
          position: { x: 43, y: 23 },
          status: "boss-escaped" as const,
          outsideBossAlive: true,
          outsideBoss: { position: { x: 43, y: 26 }, hp: 77 },
        },
      ],
    };
    expect(legacyPersistedRiftWorldStateSchema.safeParse(legacy).success).toBe(true);

    const migratedDirectly = migrateRiftWorldState(legacy);
    const migratedByPublicParser = persistedRiftWorldStateSchema.parse(legacy);
    expect(migratedDirectly).toEqual(migratedByPublicParser);
    expect(migratedByPublicParser).toMatchObject({
      version: RIFT_WORLD_SAVE_VERSION,
      migratedFromVersion: LEGACY_RIFT_WORLD_SAVE_VERSION,
      savedAt: legacy.savedAt,
      nextRiftSpawnAt: legacy.nextRiftSpawnAt,
      riftSequence: legacy.riftSequence,
      rifts: [
        {
          id: legacy.rifts[0].id,
          rank: "E",
          spawnedAt: legacy.rifts[0].spawnedAt,
          expiresAt: legacy.rifts[0].expiresAt,
          status: "boss-escaped",
          outsideBoss: { position: { x: 43, y: 26 }, hp: 77 },
        },
      ],
    });
  });

  it("does not launder an invalid v1 deadline through migration", () => {
    const invalidLegacy = {
      ...persistedWorld(),
      version: LEGACY_RIFT_WORLD_SAVE_VERSION,
      rifts: [{ ...persistedWorld().rifts[0], expiresAt: RIFT_LIFETIME_MS + 1 }],
    };
    expect(legacyPersistedRiftWorldStateSchema.safeParse(invalidLegacy).success).toBe(false);
    expect(persistedRiftWorldStateSchema.safeParse(invalidLegacy).success).toBe(false);
  });

  it("rejects a rank stored on another rank's regional anchor", () => {
    expect(
      persistedRiftWorldStateSchema.safeParse({
        ...persistedWorld(),
        rifts: [{ ...persistedWorld().rifts[0], rank: "S" }],
      }).success,
    ).toBe(false);
  });
});

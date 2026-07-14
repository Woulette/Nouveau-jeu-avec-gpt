import { describe, expect, it } from "vitest";

import { RIFT_LIFETIME_MS, RIFT_SPAWN_LOCATIONS } from "./rifts";
import {
  RIFT_WORLD_SAVE_VERSION,
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
});

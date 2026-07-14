import { z } from "zod";

import { RIFT_LIFETIME_MS, RIFT_SPAWN_LOCATIONS } from "./rifts";
import { STARTER_MAP } from "./world";

export const RIFT_WORLD_SAVE_VERSION = 1 as const;

const persistedWorldPositionSchema = z.object({
  x: z.number().int().min(0).max(STARTER_MAP.width - 1),
  y: z.number().int().min(0).max(STARTER_MAP.height - 1),
});

const persistedEscapedBossSchema = z.object({
  position: persistedWorldPositionSchema,
  hp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const persistedRankERiftSchema = z.object({
  id: z.string().trim().min(1).max(80),
  rank: z.literal("E"),
  position: persistedWorldPositionSchema,
  spawnedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  status: z.enum(["open", "boss-escaped"]),
  outsideBossAlive: z.boolean(),
  outsideBoss: persistedEscapedBossSchema.nullable(),
}).superRefine((rift, context) => {
  if (rift.expiresAt !== rift.spawnedAt + RIFT_LIFETIME_MS) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "The rift deadline must remain exactly 24 hours after its spawn.",
    });
  }

  const knownLocation = RIFT_SPAWN_LOCATIONS.some(
    (location) =>
      location.position.x === rift.position.x && location.position.y === rift.position.y,
  );
  if (!knownLocation) {
    context.addIssue({
      code: "custom",
      path: ["position"],
      message: "The rift must use a known world spawn location.",
    });
  }

  const shouldHaveOutsideBoss = rift.status === "boss-escaped" && rift.outsideBossAlive;
  if (shouldHaveOutsideBoss !== (rift.outsideBoss !== null)) {
    context.addIssue({
      code: "custom",
      path: ["outsideBoss"],
      message: "The escaped boss payload must match the authoritative rift state.",
    });
  }
  if (rift.status === "open" && rift.outsideBossAlive) {
    context.addIssue({
      code: "custom",
      path: ["outsideBossAlive"],
      message: "An open rift cannot already own an escaped boss.",
    });
  }
});

/**
 * Durable state for the local/offline world only. Active player dungeon runs
 * deliberately remain outside this save and resume from the last safe world
 * snapshot after a reload.
 */
export const persistedRiftWorldStateSchema = z.object({
  version: z.literal(RIFT_WORLD_SAVE_VERSION),
  savedAt: z.number().int().nonnegative(),
  nextRiftSpawnAt: z.number().int().nonnegative(),
  riftSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  rifts: z.array(persistedRankERiftSchema).max(RIFT_SPAWN_LOCATIONS.length),
}).superRefine((state, context) => {
  const ids = new Set<string>();
  const positions = new Set<string>();
  for (const [index, rift] of state.rifts.entries()) {
    const position = `${rift.position.x},${rift.position.y}`;
    if (ids.has(rift.id)) {
      context.addIssue({
        code: "custom",
        path: ["rifts", index, "id"],
        message: "Rift identifiers must be unique.",
      });
    }
    if (positions.has(position)) {
      context.addIssue({
        code: "custom",
        path: ["rifts", index, "position"],
        message: "Only one active rift may occupy a spawn location.",
      });
    }
    ids.add(rift.id);
    positions.add(position);
  }
});

export type PersistedRiftWorldState = z.infer<typeof persistedRiftWorldStateSchema>;

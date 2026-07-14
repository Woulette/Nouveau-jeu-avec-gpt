import { z } from "zod";

import {
  LEGACY_RIFT_SPAWN_LOCATIONS,
  RIFT_LIFETIME_MS,
  RIFT_RANKS,
  RIFT_SPAWN_LOCATIONS,
  type RiftRank,
} from "./rifts";
import { STARTER_MAP } from "./world";

export const RIFT_WORLD_SAVE_VERSION = 2 as const;
export const LEGACY_RIFT_WORLD_SAVE_VERSION = 1 as const;
// A v1 world could have three E rifts. During its lossless migration we keep
// those three and add the five missing ranks, for at most eight unique anchors.
export const MAX_PERSISTED_RIFTS =
  RIFT_SPAWN_LOCATIONS.length + LEGACY_RIFT_SPAWN_LOCATIONS.length - 1;

const persistedWorldPositionSchema = z.object({
  x: z.number().int().min(0).max(STARTER_MAP.width - 1),
  y: z.number().int().min(0).max(STARTER_MAP.height - 1),
});

const persistedEscapedBossSchema = z.object({
  position: persistedWorldPositionSchema,
  hp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

interface PersistedRiftValidationShape {
  readonly rank: RiftRank;
  readonly position: { readonly x: number; readonly y: number };
  readonly spawnedAt: number;
  readonly expiresAt: number;
  readonly status: "open" | "boss-escaped";
  readonly outsideBossAlive: boolean;
  readonly outsideBoss: { readonly position: { readonly x: number; readonly y: number }; readonly hp: number } | null;
}

function validatePersistedRift(
  rift: PersistedRiftValidationShape,
  context: z.RefinementCtx,
): void {
  if (rift.expiresAt !== rift.spawnedAt + RIFT_LIFETIME_MS) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "The rift deadline must remain exactly 24 hours after its spawn.",
    });
  }

  const knownLocation = RIFT_SPAWN_LOCATIONS.some(
    (location) =>
      location.position.x === rift.position.x &&
      location.position.y === rift.position.y &&
      (location.rank === undefined || location.rank === rift.rank),
  );
  const knownLegacyLocation = rift.rank === "E" && LEGACY_RIFT_SPAWN_LOCATIONS.some(
    (location) =>
      location.position.x === rift.position.x && location.position.y === rift.position.y,
  );
  if (!knownLocation && !knownLegacyLocation) {
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
}

const persistedRiftFields = {
  id: z.string().trim().min(1).max(80),
  position: persistedWorldPositionSchema,
  spawnedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  status: z.enum(["open", "boss-escaped"]),
  outsideBossAlive: z.boolean(),
  outsideBoss: persistedEscapedBossSchema.nullable(),
};

const persistedLegacyRankERiftSchema = z.object({
  ...persistedRiftFields,
  rank: z.literal("E"),
}).superRefine(validatePersistedRift);

const persistedRiftSchema = z.object({
  ...persistedRiftFields,
  rank: z.enum(RIFT_RANKS),
}).superRefine(validatePersistedRift);

function validateWorldUniqueness(
  state: { readonly rifts: readonly { readonly id: string; readonly position: { readonly x: number; readonly y: number } }[] },
  context: z.RefinementCtx,
): void {
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
}

/** Exact schema used by the already deployed local rank-E save format. */
export const legacyPersistedRiftWorldStateSchema = z.object({
  version: z.literal(LEGACY_RIFT_WORLD_SAVE_VERSION),
  savedAt: z.number().int().nonnegative(),
  nextRiftSpawnAt: z.number().int().nonnegative(),
  riftSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  rifts: z.array(persistedLegacyRankERiftSchema).max(LEGACY_RIFT_SPAWN_LOCATIONS.length),
}).superRefine(validateWorldUniqueness);

const persistedRiftWorldStateV2Schema = z.object({
  version: z.literal(RIFT_WORLD_SAVE_VERSION),
  /** Ephemeral marker consumed by the realm to seed the newly added ranks once. */
  migratedFromVersion: z.literal(LEGACY_RIFT_WORLD_SAVE_VERSION).optional(),
  savedAt: z.number().int().nonnegative(),
  nextRiftSpawnAt: z.number().int().nonnegative(),
  riftSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  rifts: z.array(persistedRiftSchema).max(MAX_PERSISTED_RIFTS),
}).superRefine(validateWorldUniqueness);

export type LegacyPersistedRiftWorldState = z.infer<typeof legacyPersistedRiftWorldStateSchema>;
export type PersistedRiftWorldStateV2 = z.infer<typeof persistedRiftWorldStateV2Schema>;

/**
 * Converts the deployed v1/E-only payload without changing deadlines, ids,
 * positions, boss HP or the next scheduled spawn. Invalid legacy payloads are
 * deliberately left untouched so the final v2 schema rejects them.
 */
export function migrateRiftWorldState(input: unknown): unknown {
  const legacy = legacyPersistedRiftWorldStateSchema.safeParse(input);
  if (!legacy.success) return input;
  return {
    ...legacy.data,
    version: RIFT_WORLD_SAVE_VERSION,
    migratedFromVersion: LEGACY_RIFT_WORLD_SAVE_VERSION,
    rifts: legacy.data.rifts.map((rift) => ({ ...rift, rank: "E" as RiftRank })),
  } satisfies PersistedRiftWorldStateV2;
}

/**
 * Durable state for the local/offline world only. The preprocess keeps the
 * existing storage reader compatible: parsing a valid v1 payload directly
 * returns its migrated v2 representation.
 *
 * Active player dungeon runs deliberately remain outside this save and resume
 * from the last safe world snapshot after a reload.
 */
export const persistedRiftWorldStateSchema = z.preprocess(
  migrateRiftWorldState,
  persistedRiftWorldStateV2Schema,
);

export type PersistedRiftWorldState = z.infer<typeof persistedRiftWorldStateSchema>;

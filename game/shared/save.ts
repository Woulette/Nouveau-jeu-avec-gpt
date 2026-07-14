import { z } from "zod";

import type { PlayerRank, PlayerSnapshot } from "./types";

export const PLAYER_SAVE_VERSION = 2 as const;
export const PLAYER_SAVE_STORAGE_KEY = "nouveau-mmo-player-save-v2";
export const CONNECTION_MODE_STORAGE_KEY = "nouveau-mmo-connection-mode-v1";

export type PreferredConnectionMode = "online" | "offline";

const savedPositionSchema = z.object({
  x: z.number().int().min(0).max(4095),
  y: z.number().int().min(0).max(4095),
});

const savedMasterySchema = z.object({
  level: z.number().int().min(0).max(100_000),
  xp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const savedEquipmentSchema = z.object({
  head: z.string().max(80).nullable(),
  weapon: z.string().max(80).nullable(),
  armor: z.string().max(80).nullable(),
  legs: z.string().max(80).nullable(),
  boots: z.string().max(80).nullable(),
  ring: z.string().max(80).nullable(),
});

export const persistedPlayerProfileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  position: savedPositionSchema,
  hp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  level: z.number().int().min(1).max(100_000),
  xp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  gold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  rank: z.enum(["E", "D", "C", "B", "A", "S", "SS", "SSS", "OMEGA"]).nullable(),
  combatPath: z.enum(["adventurer", "melee", "ranged", "magic"]),
  className: z.string().trim().min(1).max(48),
  masteries: z.object({
    melee: savedMasterySchema,
    ranged: savedMasterySchema,
    magic: savedMasterySchema,
    defense: savedMasterySchema,
  }),
  inventory: z.array(
    z.object({
      itemId: z.string().min(1).max(80),
      quantity: z.number().int().min(1).max(9_999),
    }),
  ).max(200),
  equipment: savedEquipmentSchema,
}).superRefine((profile, context) => {
  const rankless = profile.rank === null;
  const adventurer = profile.combatPath === "adventurer";
  if (rankless !== adventurer) {
    context.addIssue({
      code: "custom",
      path: ["combatPath"],
      message: "Un Aventurier doit être sans rang et une voie éveillée doit avoir un rang.",
    });
  }
  if (!rankless && profile.level < 10) {
    context.addIssue({
      code: "custom",
      path: ["level"],
      message: "L’éveil exige le niveau général 10.",
    });
  }
});

export type PersistedPlayerProfile = z.infer<typeof persistedPlayerProfileSchema>;

const MASTERY_KEYS = ["melee", "ranged", "magic", "defense"] as const;
const RANK_ORDER: Readonly<Record<PlayerRank, number>> = {
  E: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
  SS: 6,
  SSS: 7,
  OMEGA: 8,
};

/**
 * Browser saves are portable fallbacks, not authoritative multiplayer state.
 * Never let a freshly restarted online realm replace a profile that already
 * contains more irreversible progression. Mutable state at the same progress
 * point (HP, position, inventory and equipment) may still be saved normally.
 */
export function isProfileProgressRegression(
  candidate: PersistedPlayerProfile,
  current: PersistedPlayerProfile,
): boolean {
  const currentAwakened = current.rank !== null && current.combatPath !== "adventurer";
  const candidateAwakened = candidate.rank !== null && candidate.combatPath !== "adventurer";

  // Awakening and the selected combat path are irreversible. Check them before
  // general levels, otherwise a higher-level reset snapshot could erase them.
  if (currentAwakened && !candidateAwakened) return true;
  if (currentAwakened && candidateAwakened) {
    if (candidate.combatPath !== current.combatPath) return true;
    if (RANK_ORDER[candidate.rank!] < RANK_ORDER[current.rank!]) return true;
  }

  if (candidate.level !== current.level) return candidate.level < current.level;
  if (candidate.xp !== current.xp) return candidate.xp < current.xp;

  // The level-10 awakening intentionally resets provisional offensive
  // masteries before assigning 25 points to the chosen one. Only Defense must
  // remain monotonic during this one legitimate transfer.
  if (!currentAwakened && candidateAwakened) {
    const next = candidate.masteries.defense;
    const previous = current.masteries.defense;
    if (next.level !== previous.level) return next.level < previous.level;
    return next.xp < previous.xp;
  }

  return MASTERY_KEYS.some((key) => {
    const next = candidate.masteries[key];
    const previous = current.masteries[key];
    if (next.level !== previous.level) return next.level < previous.level;
    return next.xp < previous.xp;
  });
}

export const localPlayerSaveSchema = z.object({
  version: z.literal(PLAYER_SAVE_VERSION),
  savedAt: z.number().int().nonnegative(),
  profile: persistedPlayerProfileSchema,
});

export type LocalPlayerSave = z.infer<typeof localPlayerSaveSchema>;

/**
 * Creates the portable, versioned part of a player snapshot.
 * Server-only values (resume token, command sequence and combat timers) never
 * enter browser storage.
 */
export function profileFromPlayerSnapshot(player: PlayerSnapshot): PersistedPlayerProfile {
  return {
    name: player.name,
    position: { ...player.position },
    hp: Math.max(0, Math.floor(player.hp)),
    mp: Math.max(0, Math.floor(player.mp)),
    level: Math.max(1, Math.floor(player.level)),
    xp: Math.max(0, Math.floor(player.xp)),
    gold: Math.max(0, Math.floor(player.gold)),
    rank: player.rank,
    combatPath: player.combatPath,
    className: player.className,
    masteries: {
      melee: { level: player.masteries.melee.level, xp: player.masteries.melee.xp },
      ranged: { level: player.masteries.ranged.level, xp: player.masteries.ranged.xp },
      magic: { level: player.masteries.magic.level, xp: player.masteries.magic.xp },
      defense: { level: player.masteries.defense.level, xp: player.masteries.defense.xp },
    },
    inventory: player.inventory.map((entry) => ({ ...entry })),
    equipment: { ...player.equipment },
  };
}

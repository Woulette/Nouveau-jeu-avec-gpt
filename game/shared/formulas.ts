import type { CombatPath, PlayerRank } from "./types";

export const AWAKENING_LEVEL = 10;
export const BASE_SPEED = 100;
export const MAX_SPEED = 300;
export const LEVELS_PER_SPEED_POINT = 10;
export const BASE_MOVE_INTERVAL_MS = 200;

export const RANK_BONUS: Readonly<Record<PlayerRank, number>> = {
  E: 0.05,
  D: 0.1,
  C: 0.15,
  B: 0.25,
  A: 0.35,
  S: 0.5,
  SS: 0.65,
  SSS: 0.8,
  OMEGA: 1,
};

export const RANK_TRAINING_MULTIPLIER: Readonly<Record<PlayerRank, number>> = {
  E: 1,
  D: 2,
  C: 3,
  B: 4,
  A: 6,
  S: 8,
  SS: 12,
  SSS: 16,
  OMEGA: 20,
};

/** A player has no rank bonus before completing awakening at headquarters. */
export function rankBonus(rank: PlayerRank | null): number {
  return rank === null ? 0 : RANK_BONUS[rank];
}

/** Rankless adventurers train at the normal x1 rate. */
export function rankTrainingMultiplier(rank: PlayerRank | null): number {
  return rank === null ? 1 : RANK_TRAINING_MULTIPLIER[rank];
}

/** Eligibility is deliberately separate from awakening: reaching level 10 never auto-awakens. */
export function isAwakeningEligible(level: number, rank: PlayerRank | null): boolean {
  return rank === null && Math.max(1, Math.floor(level)) >= AWAKENING_LEVEL;
}

/** Base 100, +1 every ten general levels, hard-capped at 300. */
export function playerSpeed(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.min(MAX_SPEED, BASE_SPEED + Math.floor(safeLevel / LEVELS_PER_SPEED_POINT));
}

/** Converts the displayed Speed stat into the authoritative delay between two tiles. */
export function playerMoveIntervalMs(level: number): number {
  return (BASE_MOVE_INTERVAL_MS * BASE_SPEED) / playerSpeed(level);
}

export function generalXpToNext(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(80 + 45 * Math.pow(safeLevel - 1, 1.35));
}

export function masteryXpToNext(level: number): number {
  const safeLevel = Math.max(0, Math.floor(level));
  return Math.floor(50 + 24 * Math.pow(safeLevel, 1.45));
}

export function playerMaxHp(energy: number, rank: PlayerRank | null): number {
  const beforeRank = 100 + Math.max(1, energy) * 12;
  return Math.floor(beforeRank * (1 + rankBonus(rank)));
}

export function playerMaxMp(energy: number): number {
  return 30 + Math.max(1, energy) * 5;
}

export function outgoingPlayerDamage(
  offensiveStat: number,
  rank: PlayerRank | null,
  coefficient = 1,
): number {
  const beforeRank = (5 + Math.max(1, offensiveStat) * 1.8) * Math.max(0, coefficient);
  return Math.max(1, Math.floor(beforeRank * (1 + rankBonus(rank))));
}

/** Smooth mitigation without a hard immunity threshold. */
export function damageAfterDefense(rawDamage: number, defense: number): number {
  const mitigation = 100 / (100 + Math.max(0, defense) * 4);
  return Math.max(1, Math.floor(Math.max(0, rawDamage) * mitigation));
}

export function trainingXpForAction(baseXp: number, rank: PlayerRank | null): number {
  return Math.max(0, Math.floor(baseXp * rankTrainingMultiplier(rank)));
}

export function isValidTrainingTarget(playerLevel: number, targetLevel: number): boolean {
  const minimumLevel = Math.max(1, Math.floor(playerLevel * 0.5));
  return targetLevel >= minimumLevel && targetLevel <= playerLevel + 20;
}

export function combatStatForPath(
  combatPath: CombatPath,
  baseLevel: number,
  trained: { melee: number; ranged: number; magic: number },
): number {
  if (combatPath === "ranged") return baseLevel + trained.ranged;
  if (combatPath === "magic") return baseLevel + trained.magic;
  return baseLevel + trained.melee;
}

export function powerIndex(input: {
  level: number;
  combatStat: number;
  defense: number;
  energy: number;
  equipmentScore?: number;
}): number {
  return Math.floor(
    input.level * 25 +
      input.combatStat * 18 +
      input.defense * 15 +
      input.energy * 12 +
      Math.max(0, input.equipmentScore ?? 0),
  );
}

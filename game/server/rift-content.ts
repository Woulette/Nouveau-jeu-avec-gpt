import {
  getRiftRankConfig,
  type RiftRank,
  type RiftRoomNumber,
} from "../shared/rifts";
import type { GridPosition } from "../shared/types";
import type { MonsterDefinition } from "../shared/world";

interface RiftCreatureNames {
  readonly firstWave: string;
  readonly secondWave: string;
  readonly boss: string;
  readonly escapedBoss: string;
}

/** Names are content only; procedural silhouettes remain shared until new assets arrive. */
export const RIFT_CREATURE_NAMES = {
  E: {
    firstWave: "Gelée distordue",
    secondWave: "Traqueur fracturé",
    boss: "Gardien de la Brèche",
    escapedBoss: "Gardien échappé",
  },
  D: {
    firstWave: "Gelée instable",
    secondWave: "Traqueur voilé",
    boss: "Sentinelle fracturée",
    escapedBoss: "Sentinelle échappée",
  },
  C: {
    firstWave: "Aberration cristalline",
    secondWave: "Chasseur spectral",
    boss: "Vigile du Prisme",
    escapedBoss: "Vigile échappé",
  },
  B: {
    firstWave: "Masse du Néant",
    secondWave: "Prédateur abyssal",
    boss: "Colosse abyssal",
    escapedBoss: "Colosse échappé",
  },
  A: {
    firstWave: "Écho astral",
    secondWave: "Limier céleste",
    boss: "Archonte dimensionnel",
    escapedBoss: "Archonte échappé",
  },
  S: {
    firstWave: "Entité souveraine",
    secondWave: "Faucheur dimensionnel",
    boss: "Souverain de la Brèche",
    escapedBoss: "Souverain échappé",
  },
} as const satisfies Readonly<Record<RiftRank, RiftCreatureNames>>;

function monster(
  instanceId: string,
  suffix: string,
  input: Omit<MonsterDefinition, "id">,
): MonsterDefinition {
  return { ...input, id: `${instanceId}-${suffix}` };
}

function scaledInteger(base: number, multiplier: number, minimum = 1): number {
  return Math.max(minimum, Math.round(base * multiplier));
}

function scaledChance(base: number, multiplier: number): number {
  return Math.min(0.95, Math.max(0, base * multiplier));
}

function scaleDefinition(
  rank: RiftRank,
  definition: Omit<MonsterDefinition, "id" | "name">,
  name: string,
  higherRankLoot?: { readonly itemId: string; readonly baseChance: number },
): Omit<MonsterDefinition, "id"> {
  const config = getRiftRankConfig(rank);
  const multipliers = config.monsterMultipliers;
  const loot = rank === "E" || !higherRankLoot
    ? { itemId: definition.lootItemId, chance: definition.lootChance }
    : {
        itemId: higherRankLoot.itemId,
        chance: higherRankLoot.baseChance,
      };

  return {
    ...definition,
    name,
    level: definition.level + config.levelOffset,
    maxHp: scaledInteger(definition.maxHp, multipliers.hp),
    defense: scaledInteger(definition.defense, multipliers.defense, 0),
    attackDamage: scaledInteger(definition.attackDamage, multipliers.damage),
    moveIntervalMs: scaledInteger(definition.moveIntervalMs, multipliers.tempo, 250),
    attackIntervalMs: scaledInteger(definition.attackIntervalMs, multipliers.tempo, 500),
    xpReward: scaledInteger(definition.xpReward, multipliers.xp),
    lootItemId: loot.itemId,
    lootChance: scaledChance(loot.chance, rank === "E" ? 1 : multipliers.loot),
  };
}

const FIRST_WAVE_BASE: Omit<MonsterDefinition, "id" | "name"> = {
  species: "slime",
  behaviour: "aggressive",
  spawn: { x: 10, y: 7 },
  level: 2,
  maxHp: 42,
  defense: 2,
  attackDamage: 8,
  detectionRange: 10,
  leashRange: 12,
  moveIntervalMs: 590,
  attackIntervalMs: 1_150,
  respawnMs: Number.MAX_SAFE_INTEGER,
  xpReward: 32,
  lootItemId: "gelee-claire",
  lootChance: 0.75,
};

const SECOND_WAVE_BASE: Omit<MonsterDefinition, "id" | "name"> = {
  species: "wolf",
  behaviour: "aggressive",
  spawn: { x: 27, y: 6 },
  level: 3,
  maxHp: 68,
  defense: 4,
  attackDamage: 12,
  detectionRange: 12,
  leashRange: 14,
  moveIntervalMs: 450,
  attackIntervalMs: 1_000,
  respawnMs: Number.MAX_SAFE_INTEGER,
  xpReward: 52,
  lootItemId: "croc-de-faille",
  lootChance: 0.12,
};

const BOSS_BASE: Omit<MonsterDefinition, "id" | "name"> = {
  species: "rift-guardian",
  behaviour: "aggressive",
  spawn: { x: 44, y: 9 },
  level: 5,
  maxHp: 190,
  defense: 6,
  attackDamage: 18,
  detectionRange: 16,
  leashRange: 18,
  moveIntervalMs: 430,
  attackIntervalMs: 950,
  respawnMs: Number.MAX_SAFE_INTEGER,
  xpReward: 120,
  lootItemId: "fragment-de-faille",
  lootChance: 0.2,
  isBoss: true,
};

const ESCAPED_BOSS_BASE: Omit<MonsterDefinition, "id" | "name" | "spawn"> = {
  species: "rift-guardian",
  behaviour: "aggressive",
  level: 6,
  maxHp: 260,
  defense: 7,
  attackDamage: 22,
  detectionRange: 12,
  leashRange: 16,
  moveIntervalMs: 410,
  attackIntervalMs: 900,
  respawnMs: Number.MAX_SAFE_INTEGER,
  xpReward: 170,
  lootItemId: "fragment-de-faille",
  lootChance: 0.35,
  isBoss: true,
};

export function riftRoomMonstersForRank(
  instanceId: string,
  rank: RiftRank,
  room: RiftRoomNumber,
): MonsterDefinition[] {
  const names = RIFT_CREATURE_NAMES[rank];

  if (room === 1) {
    const first = scaleDefinition(
      rank,
      FIRST_WAVE_BASE,
      names.firstWave,
      { itemId: "poussiere-dimensionnelle", baseChance: 0.18 },
    );
    return [
      monster(instanceId, "r1-a", first),
      monster(instanceId, "r1-b", { ...first, spawn: { x: 12, y: 11 } }),
    ];
  }

  if (room === 2) {
    const second = scaleDefinition(
      rank,
      SECOND_WAVE_BASE,
      names.secondWave,
      { itemId: "fragment-de-faille", baseChance: 0.08 },
    );
    return [
      monster(instanceId, "r2-a", second),
      monster(instanceId, "r2-b", { ...second, spawn: { x: 29, y: 12 } }),
    ];
  }

  return [
    monster(
      instanceId,
      "boss",
      scaleDefinition(rank, BOSS_BASE, names.boss),
    ),
  ];
}

/** Existing realm wrapper: omitted ranks remain exactly rank E. */
export function riftRoomMonsters(
  instanceId: string,
  room: RiftRoomNumber,
): MonsterDefinition[] {
  return riftRoomMonstersForRank(instanceId, "E", room);
}

export function escapedRiftBossForRank(
  riftId: string,
  rank: RiftRank,
  spawn: GridPosition,
): MonsterDefinition {
  const definition = scaleDefinition(
    rank,
    { ...ESCAPED_BOSS_BASE, spawn: { ...spawn } },
    RIFT_CREATURE_NAMES[rank].escapedBoss,
  );
  return { ...definition, id: `escaped-${riftId}` };
}

/** Existing realm wrapper: omitted ranks remain exactly rank E. */
export function escapedRiftBoss(
  riftId: string,
  spawn: GridPosition,
): MonsterDefinition {
  return escapedRiftBossForRank(riftId, "E", spawn);
}

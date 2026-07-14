import type { RiftRoomNumber } from "../shared/rifts";
import type { GridPosition } from "../shared/types";
import type { MonsterDefinition } from "../shared/world";

function monster(
  instanceId: string,
  suffix: string,
  input: Omit<MonsterDefinition, "id">,
): MonsterDefinition {
  return { ...input, id: `${instanceId}-${suffix}` };
}

export function riftRoomMonsters(
  instanceId: string,
  room: RiftRoomNumber,
): MonsterDefinition[] {
  if (room === 1) {
    return [
      monster(instanceId, "r1-a", {
        species: "slime",
        name: "Gelée distordue",
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
      }),
      monster(instanceId, "r1-b", {
        species: "slime",
        name: "Gelée distordue",
        behaviour: "aggressive",
        spawn: { x: 12, y: 11 },
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
      }),
    ];
  }

  if (room === 2) {
    return [
      monster(instanceId, "r2-a", {
        species: "wolf",
        name: "Traqueur fracturé",
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
      }),
      monster(instanceId, "r2-b", {
        species: "wolf",
        name: "Traqueur fracturé",
        behaviour: "aggressive",
        spawn: { x: 29, y: 12 },
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
      }),
    ];
  }

  return [
    monster(instanceId, "boss", {
      species: "rift-guardian",
      name: "Gardien de la Brèche",
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
    }),
  ];
}

export function escapedRiftBoss(
  riftId: string,
  spawn: GridPosition,
): MonsterDefinition {
  return {
    id: `escaped-${riftId}`,
    species: "rift-guardian",
    name: "Gardien échappé",
    behaviour: "aggressive",
    spawn,
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
}

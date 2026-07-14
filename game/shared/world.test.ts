import { describe, expect, it } from "vitest";
import { isWalkable } from "./grid";
import { findPath } from "./pathfinding";
import { RIFT_SPAWN_LOCATIONS } from "./rifts";
import {
  STARTER_LANDMARKS,
  STARTER_MAP,
  STARTER_MONSTERS,
  WORLD_REGIONS,
  WORLD_RIFT_RANKS,
} from "./world";

describe("shared starter world", () => {
  it("expands the starter world to six connected rank regions", () => {
    expect(STARTER_MAP.width).toBe(112);
    expect(STARTER_MAP.height).toBe(72);
    expect(WORLD_REGIONS.map((region) => region.rank)).toEqual(WORLD_RIFT_RANKS);
  });

  it("keeps player, monsters, and portal centre walkable", () => {
    expect(isWalkable(STARTER_MAP, STARTER_MAP.playerSpawn)).toBe(true);
    for (const monster of STARTER_MONSTERS) {
      expect(isWalkable(STARTER_MAP, monster.spawn)).toBe(true);
    }
    const portals = STARTER_LANDMARKS.filter((landmark) => landmark.kind === "portal");
    expect(portals.map((portal) => portal.rank)).toEqual(WORLD_RIFT_RANKS);
    expect(portals.map((portal) => ({ rank: portal.rank, position: portal.position }))).toEqual(
      RIFT_SPAWN_LOCATIONS.map((location) => ({
        rank: location.rank,
        position: location.position,
      })),
    );
    for (const portal of portals) {
      expect(isWalkable(STARTER_MAP, portal.position)).toBe(true);
      expect(findPath(STARTER_MAP, STARTER_MAP.playerSpawn, portal.position)).not.toBeNull();
    }
  });

  it("makes slimes defensive while keeping true aggressive monsters distinct", () => {
    const slimes = STARTER_MONSTERS.filter((monster) => monster.species === "slime");
    expect(slimes).toHaveLength(2);
    expect(slimes.every((monster) => monster.behaviour === "defensive")).toBe(true);
    expect(slimes.every((monster) => monster.attackDamage > 0)).toBe(true);
    expect(new Set(STARTER_MONSTERS.map((monster) => monster.behaviour))).toEqual(
      new Set(["defensive", "aggressive"]),
    );
    expect(STARTER_MONSTERS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(STARTER_MONSTERS.map((monster) => monster.species)).size).toBeGreaterThanOrEqual(10);
  });
});

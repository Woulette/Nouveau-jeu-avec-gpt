import { describe, expect, it } from "vitest";
import { isWalkable } from "./grid";
import { STARTER_LANDMARKS, STARTER_MAP, STARTER_MONSTERS } from "./world";

describe("shared starter world", () => {
  it("is the agreed 64 by 48 world", () => {
    expect(STARTER_MAP.width).toBe(64);
    expect(STARTER_MAP.height).toBe(48);
  });

  it("keeps player, monsters, and portal centre walkable", () => {
    expect(isWalkable(STARTER_MAP, STARTER_MAP.playerSpawn)).toBe(true);
    for (const monster of STARTER_MONSTERS) {
      expect(isWalkable(STARTER_MAP, monster.spawn)).toBe(true);
    }
    const portal = STARTER_LANDMARKS.find((landmark) => landmark.kind === "portal")!;
    expect(isWalkable(STARTER_MAP, portal.position)).toBe(true);
  });

  it("contains all three initial behaviour families", () => {
    expect(new Set(STARTER_MONSTERS.map((monster) => monster.behaviour))).toEqual(
      new Set(["passive", "defensive", "aggressive"]),
    );
  });
});

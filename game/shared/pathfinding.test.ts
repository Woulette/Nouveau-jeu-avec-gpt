import { describe, expect, it } from "vitest";
import { createCollisionGrid, hasLineOfSight, manhattanDistance, positionKey } from "./grid";
import { findPath, findPathToAttackRange } from "./pathfinding";

describe("grid pathfinding", () => {
  it("routes around blocking tiles without entering them", () => {
    const grid = createCollisionGrid(7, 5, [
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    const path = findPath(grid, { x: 1, y: 2 }, { x: 5, y: 2 });

    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 5, y: 2 });
    expect(path?.some((tile) => grid.blocked.includes(positionKey(tile)))).toBe(false);
  });

  it("returns null when a destination is sealed", () => {
    const grid = createCollisionGrid(5, 5, [
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
    ]);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it("stops next to a melee target instead of entering its tile", () => {
    const grid = createCollisionGrid(10, 4);
    const target = { x: 7, y: 2 };
    const path = findPathToAttackRange(grid, { x: 1, y: 2 }, target, 1);

    expect(path).not.toBeNull();
    expect(path?.at(-1)).not.toEqual(target);
    expect(manhattanDistance(path!.at(-1)!, target)).toBe(1);
  });

  it("requires clear line of sight for ranged attack positions", () => {
    const grid = createCollisionGrid(8, 5, [{ x: 4, y: 2 }]);
    expect(hasLineOfSight(grid, { x: 2, y: 2 }, { x: 6, y: 2 })).toBe(false);

    const path = findPathToAttackRange(grid, { x: 2, y: 2 }, { x: 6, y: 2 }, 5);
    expect(path).not.toBeNull();
    expect(hasLineOfSight(grid, path!.at(-1)!, { x: 6, y: 2 })).toBe(true);
  });
});

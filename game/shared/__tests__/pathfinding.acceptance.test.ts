import { describe, expect, it } from "vitest";

import { createCollisionGrid, isWalkable, manhattanDistance, positionKey } from "../grid";
import { findPath, findPathToAttackRange } from "../pathfinding";

describe("pathfinding acceptance", () => {
  it("rejects blocked and fully unreachable destinations", () => {
    const blockedGoal = createCollisionGrid(5, 5, [{ x: 3, y: 3 }]);
    expect(findPath(blockedGoal, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull();

    const sealedGoal = createCollisionGrid(7, 7, [
      { x: 3, y: 2 },
      { x: 4, y: 3 },
      { x: 3, y: 4 },
      { x: 2, y: 3 },
    ]);
    expect(findPath(sealedGoal, { x: 1, y: 1 }, { x: 3, y: 3 })).toBeNull();
  });

  it("chooses a shortest reachable attack tile when the direct tile is blocked", () => {
    const grid = createCollisionGrid(9, 7, [{ x: 5, y: 3 }]);
    const start = { x: 1, y: 3 };
    const target = { x: 6, y: 3 };
    const path = findPathToAttackRange(grid, start, target, 1);

    expect(path).not.toBeNull();
    expect(path).toHaveLength(6);

    const attackTile = path!.at(-1)!;
    expect(manhattanDistance(attackTile, target)).toBe(1);
    expect(attackTile).not.toEqual(target);
    expect(isWalkable(grid, attackTile)).toBe(true);
    expect(path!.some((tile) => positionKey(tile) === "5,3")).toBe(false);
  });

  it.each([
    ["melee", { x: 4, y: 3 }, { x: 5, y: 3 }, 1],
    ["ranged", { x: 2, y: 3 }, { x: 5, y: 3 }, 3],
  ])("does not move an actor already in %s range", (_label, start, target, range) => {
    const grid = createCollisionGrid(8, 7);
    expect(findPathToAttackRange(grid, start, target, range)).toEqual([]);
  });

  it("treats occupied tiles as unavailable while preserving the actor's start tile", () => {
    const grid = createCollisionGrid(6, 3);
    const occupied = new Set(["1,1", "2,1"]);
    const path = findPath(grid, { x: 1, y: 1 }, { x: 4, y: 1 }, { occupied });

    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 4, y: 1 });
    expect(path?.some((tile) => positionKey(tile) === "2,1")).toBe(false);
  });
});

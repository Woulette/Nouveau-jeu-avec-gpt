import type { CollisionGrid, Direction, GridPosition } from "./types";

export function positionKey(position: GridPosition): string {
  return `${position.x},${position.y}`;
}

export function parsePositionKey(key: string): GridPosition {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function isIntegerPosition(position: GridPosition): boolean {
  return Number.isInteger(position.x) && Number.isInteger(position.y);
}

export function isInsideGrid(grid: CollisionGrid, position: GridPosition): boolean {
  return (
    isIntegerPosition(position) &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < grid.width &&
    position.y < grid.height
  );
}

export function blockedSet(grid: CollisionGrid): ReadonlySet<string> {
  return new Set(grid.blocked);
}

export function isWalkable(
  grid: CollisionGrid,
  position: GridPosition,
  occupied: ReadonlySet<string> = new Set(),
): boolean {
  return (
    isInsideGrid(grid, position) &&
    !grid.blocked.includes(positionKey(position)) &&
    !occupied.has(positionKey(position))
  );
}

export function cardinalNeighbours(position: GridPosition): GridPosition[] {
  return [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y },
  ];
}

export function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function directionBetween(from: GridPosition, to: GridPosition): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "east" : "west";
  }

  return dy >= 0 ? "south" : "north";
}

/**
 * Grid line-of-sight using an integer Bresenham trace. The destination may be
 * occupied by an actor, so only map collision tiles block the ray.
 */
export function hasLineOfSight(
  grid: CollisionGrid,
  from: GridPosition,
  to: GridPosition,
): boolean {
  if (!isInsideGrid(grid, from) || !isInsideGrid(grid, to)) return false;

  const blocked = blockedSet(grid);
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;

  while (x !== to.x || y !== to.y) {
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }

    if ((x !== to.x || y !== to.y) && blocked.has(`${x},${y}`)) return false;
  }

  return true;
}

export function createCollisionGrid(
  width: number,
  height: number,
  blocked: readonly GridPosition[] = [],
): CollisionGrid {
  return {
    width,
    height,
    blocked: [...new Set(blocked.map(positionKey))],
  };
}

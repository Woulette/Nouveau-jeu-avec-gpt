import {
  cardinalNeighbours,
  hasLineOfSight,
  isInsideGrid,
  isWalkable,
  manhattanDistance,
  parsePositionKey,
  positionKey,
} from "./grid";
import type { CollisionGrid, GridPosition } from "./types";

interface SearchNode {
  position: GridPosition;
  cost: number;
  score: number;
}

export interface PathOptions {
  occupied?: ReadonlySet<string>;
  maxVisited?: number;
}

function reconstructPath(
  parents: ReadonlyMap<string, string>,
  end: GridPosition,
): GridPosition[] {
  const path: GridPosition[] = [];
  let cursor = positionKey(end);

  while (parents.has(cursor)) {
    path.push(parsePositionKey(cursor));
    cursor = parents.get(cursor)!;
  }

  path.reverse();
  return path;
}

function lowestScoreIndex(open: readonly SearchNode[]): number {
  let bestIndex = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (open[index].score < open[bestIndex].score) bestIndex = index;
  }
  return bestIndex;
}

/** A* over a four-direction integer grid. Returned paths exclude `start`. */
export function findPath(
  grid: CollisionGrid,
  start: GridPosition,
  goal: GridPosition,
  options: PathOptions = {},
): GridPosition[] | null {
  if (!isInsideGrid(grid, start) || !isInsideGrid(grid, goal)) return null;
  if (positionKey(start) === positionKey(goal)) return [];

  const occupied = new Set(options.occupied ?? []);
  occupied.delete(positionKey(start));
  if (!isWalkable(grid, goal, occupied)) return null;

  const open: SearchNode[] = [
    { position: start, cost: 0, score: manhattanDistance(start, goal) },
  ];
  const parents = new Map<string, string>();
  const bestCosts = new Map<string, number>([[positionKey(start), 0]]);
  const closed = new Set<string>();
  const maxVisited = options.maxVisited ?? grid.width * grid.height;

  while (open.length > 0 && closed.size < maxVisited) {
    const index = lowestScoreIndex(open);
    const current = open.splice(index, 1)[0];
    const currentKey = positionKey(current.position);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (currentKey === positionKey(goal)) {
      return reconstructPath(parents, current.position);
    }

    for (const neighbour of cardinalNeighbours(current.position)) {
      const neighbourKey = positionKey(neighbour);
      if (closed.has(neighbourKey) || !isWalkable(grid, neighbour, occupied)) continue;

      const cost = current.cost + 1;
      if (cost >= (bestCosts.get(neighbourKey) ?? Number.POSITIVE_INFINITY)) continue;

      bestCosts.set(neighbourKey, cost);
      parents.set(neighbourKey, currentKey);
      open.push({
        position: neighbour,
        cost,
        score: cost + manhattanDistance(neighbour, goal),
      });
    }
  }

  return null;
}

/**
 * Finds the shortest reachable tile from which an actor can attack a target.
 * The target tile itself is never entered. Ranged attacks also require sight.
 */
export function findPathToAttackRange(
  grid: CollisionGrid,
  start: GridPosition,
  target: GridPosition,
  range: number,
  options: PathOptions = {},
): GridPosition[] | null {
  const safeRange = Math.max(1, Math.floor(range));
  const canAttackFrom = (position: GridPosition): boolean =>
    manhattanDistance(position, target) <= safeRange &&
    (safeRange === 1 || hasLineOfSight(grid, position, target));

  if (canAttackFrom(start)) return [];

  const occupied = new Set(options.occupied ?? []);
  occupied.delete(positionKey(start));
  occupied.add(positionKey(target));

  const open: SearchNode[] = [
    {
      position: start,
      cost: 0,
      score: Math.max(0, manhattanDistance(start, target) - safeRange),
    },
  ];
  const parents = new Map<string, string>();
  const bestCosts = new Map<string, number>([[positionKey(start), 0]]);
  const closed = new Set<string>();
  const maxVisited = options.maxVisited ?? grid.width * grid.height;

  while (open.length > 0 && closed.size < maxVisited) {
    const index = lowestScoreIndex(open);
    const current = open.splice(index, 1)[0];
    const currentKey = positionKey(current.position);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (canAttackFrom(current.position)) {
      return reconstructPath(parents, current.position);
    }

    for (const neighbour of cardinalNeighbours(current.position)) {
      const neighbourKey = positionKey(neighbour);
      if (closed.has(neighbourKey) || !isWalkable(grid, neighbour, occupied)) continue;

      const cost = current.cost + 1;
      if (cost >= (bestCosts.get(neighbourKey) ?? Number.POSITIVE_INFINITY)) continue;
      bestCosts.set(neighbourKey, cost);
      parents.set(neighbourKey, currentKey);
      open.push({
        position: neighbour,
        cost,
        score: cost + Math.max(0, manhattanDistance(neighbour, target) - safeRange),
      });
    }
  }

  return null;
}

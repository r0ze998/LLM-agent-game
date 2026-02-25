import type { Position, Tile } from '@murasato/shared';
import { TERRAIN_MOVEMENT_COST } from '@murasato/shared';

interface Node {
  x: number;
  y: number;
  g: number; // cost from start
  h: number; // heuristic to goal
  f: number; // g + h
  parent: Node | null;
}

function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan distance
}

function movementCost(tile: Tile): number {
  return TERRAIN_MOVEMENT_COST[tile.terrain] ?? Infinity;
}

const NEIGHBORS: Position[] = [
  { x: 0, y: -1 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
];

export function findPath(
  tiles: Tile[][],
  start: Position,
  goal: Position,
  maxSteps: number = 200,
): Position[] | null {
  const mapH = tiles.length;
  const mapW = tiles[0]?.length ?? 0;

  if (goal.x < 0 || goal.x >= mapW || goal.y < 0 || goal.y >= mapH) return null;
  if (movementCost(tiles[goal.y][goal.x]) === Infinity) return null;

  const openSet: Node[] = [{
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
    parent: null,
  }];

  const closedSet = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  let iterations = 0;

  while (openSet.length > 0 && iterations < maxSteps) {
    iterations++;

    // Find node with lowest f
    let lowestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
    }
    const current = openSet.splice(lowestIdx, 1)[0];

    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path: Position[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(key(current.x, current.y));

    for (const dir of NEIGHBORS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;

      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) continue;
      if (closedSet.has(key(nx, ny))) continue;

      const cost = movementCost(tiles[ny][nx]);
      if (cost === Infinity) continue;

      const g = current.g + cost;
      const existing = openSet.find(n => n.x === nx && n.y === ny);

      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + existing.h;
          existing.parent = current;
        }
      } else {
        const h = heuristic({ x: nx, y: ny }, goal);
        openSet.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      }
    }
  }

  return null; // No path found
}

// Get the next step towards a goal (for single-tick movement)
export function getNextStep(tiles: Tile[][], start: Position, goal: Position): Position {
  const path = findPath(tiles, start, goal, 100);
  if (path && path.length > 1) {
    return path[1]; // Next position after start
  }
  return start; // Stay in place
}

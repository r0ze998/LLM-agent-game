import type { Tile, ResourceType, AgentState, Position } from '@murasato/shared';
import type { ResourceType4X } from '@murasato/shared';
import { GATHER_BASE_AMOUNT, RESOURCE_REGEN_INTERVAL, EAT_RESTORE, BASE_FOOD_PER_FARM_TICK } from '@murasato/shared';
import type { WorldMap } from './map.ts';

/** Map old 7 resource types to new 5 resource types */
export function mapTo4XResource(resource: ResourceType): ResourceType4X | null {
  switch (resource) {
    case 'food': return 'food';
    case 'wood': return 'wood';
    case 'stone': return 'stone';
    case 'ore': return 'iron';
    case 'herbs':
    case 'clay':
    case 'fiber':
      return null; // deprecated, no 4X equivalent
  }
}

// --- Gather resources from a tile ---

export function gatherFromTile(tile: Tile, resourceType: ResourceType, skillLevel: number): number {
  const available = tile.resources[resourceType] ?? 0;
  if (available <= 0) return 0;

  const amount = Math.min(available, Math.ceil(GATHER_BASE_AMOUNT * (1 + skillLevel * 0.1)));
  tile.resources[resourceType] = available - amount;
  return amount;
}

// --- Add resource to agent inventory ---

export function addToInventory(agent: AgentState, resource: ResourceType, amount: number): void {
  agent.inventory[resource] = (agent.inventory[resource] ?? 0) + amount;
}

// --- Consume food ---

export function eatFood(agent: AgentState): boolean {
  const food = agent.inventory.food ?? 0;
  if (food <= 0) return false;

  agent.inventory.food = food - 1;
  agent.needs.hunger = Math.min(100, agent.needs.hunger + EAT_RESTORE);
  return true;
}

// --- Farm a tile (requires adjacent farm structure) ---

export function farmTile(tile: Tile, skillLevel: number): number {
  if (tile.fertility <= 0) return 0;
  return Math.ceil(BASE_FOOD_PER_FARM_TICK * tile.fertility * (1 + skillLevel * 0.05));
}

// --- Regenerate world resources ---

export function regenerateResources(map: WorldMap, tick: number): void {
  if (tick % RESOURCE_REGEN_INTERVAL !== 0) return;

  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const tile = map.tiles[y][x];

      // Slowly regenerate based on terrain
      switch (tile.terrain) {
        case 'plains':
          tile.resources.food = Math.min(5, (tile.resources.food ?? 0) + 1);
          tile.resources.fiber = Math.min(3, (tile.resources.fiber ?? 0) + 1);
          break;
        case 'forest':
          tile.resources.wood = Math.min(8, (tile.resources.wood ?? 0) + 1);
          tile.resources.herbs = Math.min(3, (tile.resources.herbs ?? 0) + 1);
          tile.resources.food = Math.min(2, (tile.resources.food ?? 0) + 1);
          break;
        case 'mountain':
          tile.resources.stone = Math.min(8, (tile.resources.stone ?? 0) + 1);
          tile.resources.ore = Math.min(5, (tile.resources.ore ?? 0) + 1);
          break;
        case 'swamp':
          tile.resources.herbs = Math.min(5, (tile.resources.herbs ?? 0) + 1);
          tile.resources.clay = Math.min(3, (tile.resources.clay ?? 0) + 1);
          break;
        case 'desert':
          tile.resources.clay = Math.min(3, (tile.resources.clay ?? 0) + 1);
          break;
      }
    }
  }
}

// --- Find nearby tile with a specific resource ---

export function findNearbyResource(
  map: WorldMap,
  from: Position,
  resource: ResourceType,
  radius: number,
): Position | null {
  let best: Position | null = null;
  let bestAmount = 0;
  let bestDist = Infinity;

  const minX = Math.max(0, from.x - radius);
  const maxX = Math.min(map.size - 1, from.x + radius);
  const minY = Math.max(0, from.y - radius);
  const maxY = Math.min(map.size - 1, from.y + radius);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dist = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (dist === 0 || dist > radius) continue;

      const tile = map.tiles[y][x];
      const amount = tile.resources[resource] ?? 0;
      if (amount <= 0) continue;

      // Prefer closer tiles; break ties by amount
      if (dist < bestDist || (dist === bestDist && amount > bestAmount)) {
        best = { x, y };
        bestAmount = amount;
        bestDist = dist;
      }
    }
  }

  return best;
}

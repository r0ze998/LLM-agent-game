import type { Tile, ResourceType, AgentState } from '@murasato/shared';
import { GATHER_BASE_AMOUNT, RESOURCE_REGEN_INTERVAL, EAT_RESTORE, BASE_FOOD_PER_FARM_TICK } from '@murasato/shared';
import type { WorldMap } from './map.ts';

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

import type { Structure, StructureType, Position, AgentState, ResourceType } from '@murasato/shared';
import { BUILD_TICKS, BUILDING_DEFS } from '@murasato/shared';
import type { BuildingDef } from '@murasato/shared';
import type { WorldMap } from './map.ts';

/** Look up a building definition by its def ID (for 4X system) */
export function getBuildingDef(defId: string): BuildingDef | undefined {
  return BUILDING_DEFS[defId];
}

function generateId(): string {
  return `str_${crypto.randomUUID()}`;
}

// --- Building costs ---

const BUILD_COSTS: Record<StructureType, Partial<Record<ResourceType, number>>> = {
  house: { wood: 10, stone: 5 },
  farm: { wood: 5 },
  workshop: { wood: 15, stone: 10 },
  warehouse: { wood: 20, stone: 10 },
  market: { wood: 15, stone: 15 },
  meeting_hall: { wood: 25, stone: 20 },
  school: { wood: 20, stone: 15 },
  temple: { stone: 30, wood: 10 },
  wall: { stone: 10 },
  watchtower: { wood: 10, stone: 15 },
  well: { stone: 8 },
  road: { stone: 3 },
};

const STRUCTURE_MAX_HEALTH: Record<StructureType, number> = {
  house: 100,
  farm: 50,
  workshop: 80,
  warehouse: 120,
  market: 100,
  meeting_hall: 150,
  school: 100,
  temple: 200,
  wall: 200,
  watchtower: 150,
  well: 80,
  road: 50,
};

// --- Can build check ---

export function canBuild(
  map: WorldMap,
  pos: Position,
  type: StructureType,
  availableResources: Partial<Record<ResourceType, number>>,
): { ok: boolean; reason?: string } {
  // Check bounds
  if (pos.x < 0 || pos.x >= map.size || pos.y < 0 || pos.y >= map.size) {
    return { ok: false, reason: '範囲外' };
  }

  const tile = map.tiles[pos.y][pos.x];

  // Can't build on water or mountain
  if (tile.terrain === 'water') return { ok: false, reason: '水上には建設できない' };
  if (tile.terrain === 'mountain') return { ok: false, reason: '山には建設できない' };

  // Already has a structure
  if (tile.structureId) return { ok: false, reason: '既に建物がある' };

  // Check resources
  const costs = BUILD_COSTS[type];
  if (!costs) return { ok: false, reason: `不明な建物: ${type}` };
  for (const [resource, amount] of Object.entries(costs)) {
    const available = availableResources[resource as ResourceType] ?? 0;
    if (available < (amount ?? 0)) {
      return { ok: false, reason: `${resource}が足りない (必要: ${amount}, 所持: ${available})` };
    }
  }

  return { ok: true };
}

// --- Start building ---

export function createStructure(
  type: StructureType,
  pos: Position,
  villageId: string,
  builderId: string,
  tick: number,
): Structure {
  const maxHealth = STRUCTURE_MAX_HEALTH[type] ?? 100;
  return {
    id: generateId(),
    type,
    position: pos,
    level: 1,
    health: maxHealth,
    maxHealth,
    villageId,
    builderId,
    builtAtTick: tick,
  };
}

// --- Get build cost ---

export function getBuildCost(type: StructureType): Partial<Record<ResourceType, number>> {
  return BUILD_COSTS[type] ?? {};
}

// --- Get build time ---

export function getBuildTime(type: StructureType, skillLevel: number): number {
  const baseTicks = BUILD_TICKS[type] ?? 10;
  return Math.max(1, Math.ceil(baseTicks / (1 + skillLevel * 0.1)));
}

// === Terrain Rule Definitions ===

import type { TerrainRuleDef } from './types.ts';

export const TERRAIN_RULES: Record<string, TerrainRuleDef> = {
  plains: {
    terrain: 'plains',
    yields: { food: 2, wood: 0, stone: 0, iron: 0, gold: 0 },
    movementCost: 1,
    defenseBonus: 0,
    attackPenalty: 0,
    buildable: true,
  },
  forest: {
    terrain: 'forest',
    yields: { food: 1, wood: 3, stone: 0, iron: 0, gold: 0 },
    movementCost: 2,
    defenseBonus: 0.25,
    attackPenalty: 0.1,
    buildable: true,
  },
  mountain: {
    terrain: 'mountain',
    yields: { food: 0, wood: 0, stone: 2, iron: 2, gold: 1 },
    movementCost: 4,
    defenseBonus: 0.5,
    attackPenalty: 0.2,
    buildable: false,
  },
  water: {
    terrain: 'water',
    yields: { food: 1, wood: 0, stone: 0, iron: 0, gold: 0 },
    movementCost: Infinity,
    defenseBonus: 0,
    attackPenalty: 0,
    buildable: false,
  },
  desert: {
    terrain: 'desert',
    yields: { food: 0, wood: 0, stone: 1, iron: 0, gold: 1 },
    movementCost: 2,
    defenseBonus: -0.1,
    attackPenalty: 0.1,
    buildable: true,
  },
  swamp: {
    terrain: 'swamp',
    yields: { food: 1, wood: 1, stone: 0, iron: 0, gold: 0 },
    movementCost: 3,
    defenseBonus: 0.15,
    attackPenalty: 0.15,
    buildable: true,
  },
};

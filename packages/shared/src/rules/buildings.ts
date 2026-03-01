// === Building Definitions (25) — Data only, add new buildings without code changes ===

import type { BuildingDef } from './types.ts';

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  // ========== Economy ==========
  farm: {
    id: 'farm',
    name: 'Farm',
    category: 'economy',
    cost: { wood: 5 },
    buildTicks: 8,
    maxPerVillage: 0,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: 3 },
    ],
    requires: {},
  },
  granary: {
    id: 'granary',
    name: 'Granary',
    category: 'economy',
    cost: { wood: 15, stone: 5 },
    buildTicks: 12,
    maxPerVillage: 2,
    effects: [
      { type: 'resource_storage', target: { scope: 'village', resource: 'food' }, value: 200 },
      { type: 'food_consumption_mod', target: { scope: 'village' }, value: -0.1 },
    ],
    requires: { tech: 'agriculture' },
  },
  lumber_mill: {
    id: 'lumber_mill',
    name: 'Lumber Mill',
    category: 'economy',
    cost: { wood: 10, stone: 5 },
    buildTicks: 10,
    maxPerVillage: 0,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'wood' }, value: 2 },
    ],
    requires: {},
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    category: 'economy',
    cost: { wood: 10, stone: 10 },
    buildTicks: 15,
    maxPerVillage: 0,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'stone' }, value: 1 },
      { type: 'resource_production', target: { scope: 'village', resource: 'iron' }, value: 1 },
    ],
    requires: { tech: 'bronze_working' },
  },
  market: {
    id: 'market',
    name: 'Market',
    category: 'economy',
    cost: { wood: 15, stone: 15 },
    buildTicks: 20,
    maxPerVillage: 1,
    effects: [
      { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 3 },
      { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: 1 },
    ],
    requires: { tech: 'animal_husbandry' },
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    category: 'economy',
    cost: { wood: 20, stone: 10 },
    buildTicks: 12,
    maxPerVillage: 3,
    effects: [
      { type: 'resource_storage', target: { scope: 'village', resource: 'wood' }, value: 150 },
      { type: 'resource_storage', target: { scope: 'village', resource: 'stone' }, value: 150 },
      { type: 'resource_storage', target: { scope: 'village', resource: 'iron' }, value: 100 },
    ],
    requires: {},
  },
  irrigation_canal: {
    id: 'irrigation_canal',
    name: 'Irrigation Canal',
    category: 'economy',
    cost: { wood: 10, stone: 20 },
    buildTicks: 18,
    maxPerVillage: 1,
    effects: [
      { type: 'tile_yield_mod', target: { scope: 'tile', resource: 'food', terrain: 'plains' }, value: 0.5 },
      { type: 'tile_yield_mod', target: { scope: 'tile', resource: 'food', terrain: 'desert' }, value: 1.0 },
    ],
    requires: { tech: 'irrigation' },
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    category: 'economy',
    cost: { stone: 20, iron: 15, gold: 10 },
    buildTicks: 25,
    maxPerVillage: 1,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: 5 },
    ],
    requires: { tech: 'banking' },
  },

  // ========== Military ==========
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    category: 'military',
    cost: { wood: 15, stone: 10 },
    buildTicks: 12,
    maxPerVillage: 2,
    effects: [
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'warrior' }, value: 1 },
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'spearman' }, value: 1 },
    ],
    requires: { tech: 'bronze_working' },
  },
  archery_range: {
    id: 'archery_range',
    name: 'Archery Range',
    category: 'military',
    cost: { wood: 20, stone: 5 },
    buildTicks: 14,
    maxPerVillage: 1,
    effects: [
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'archer' }, value: 1 },
    ],
    requires: { tech: 'archery' },
  },
  stable: {
    id: 'stable',
    name: 'Stable',
    category: 'military',
    cost: { wood: 20, stone: 10, iron: 5 },
    buildTicks: 16,
    maxPerVillage: 1,
    effects: [
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'cavalry' }, value: 1 },
    ],
    requires: { tech: 'horseback_riding' },
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    category: 'military',
    cost: { stone: 20 },
    buildTicks: 15,
    maxPerVillage: 1,
    effects: [
      { type: 'fortification', target: { scope: 'village' }, value: 20 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.2 },
    ],
    requires: { tech: 'fortification' },
  },
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    category: 'military',
    cost: { wood: 10, stone: 15 },
    buildTicks: 10,
    maxPerVillage: 2,
    effects: [
      { type: 'vision_range', target: { scope: 'village' }, value: 3 },
      { type: 'fortification', target: { scope: 'village' }, value: 5 },
    ],
    requires: {},
  },
  forge: {
    id: 'forge',
    name: 'Forge',
    category: 'military',
    cost: { wood: 10, stone: 15, iron: 10 },
    buildTicks: 18,
    maxPerVillage: 1,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.15 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: { tech: 'iron_working' },
  },
  siege_workshop: {
    id: 'siege_workshop',
    name: 'Siege Workshop',
    category: 'military',
    cost: { wood: 25, iron: 15 },
    buildTicks: 20,
    maxPerVillage: 1,
    effects: [
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'siege_ram' }, value: 1 },
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'catapult' }, value: 1 },
    ],
    requires: { tech: 'siege_warfare' },
  },

  // ========== Culture ==========
  temple: {
    id: 'temple',
    name: 'Temple',
    category: 'culture',
    cost: { stone: 30, wood: 10 },
    buildTicks: 25,
    maxPerVillage: 1,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 3 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.05 },
    ],
    requires: { tech: 'mysticism' },
  },
  library: {
    id: 'library',
    name: 'Library',
    category: 'culture',
    cost: { wood: 20, stone: 15 },
    buildTicks: 18,
    maxPerVillage: 1,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 3 },
    ],
    requires: { tech: 'writing' },
  },
  school: {
    id: 'school',
    name: 'School',
    category: 'culture',
    cost: { wood: 20, stone: 15 },
    buildTicks: 20,
    maxPerVillage: 1,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 2 },
      { type: 'culture_points', target: { scope: 'village' }, value: 1 },
    ],
    requires: { tech: 'education' },
  },
  theater: {
    id: 'theater',
    name: 'Theater',
    category: 'culture',
    cost: { wood: 25, stone: 20, gold: 10 },
    buildTicks: 22,
    maxPerVillage: 1,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 5 },
    ],
    requires: { tech: 'arts' },
  },
  monument: {
    id: 'monument',
    name: 'Monument',
    category: 'culture',
    cost: { stone: 25, gold: 5 },
    buildTicks: 20,
    maxPerVillage: 2,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 2 },
    ],
    requires: {},
  },
  academy: {
    id: 'academy',
    name: 'Academy',
    category: 'culture',
    cost: { wood: 30, stone: 25, gold: 15 },
    buildTicks: 28,
    maxPerVillage: 1,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 5 },
      { type: 'culture_points', target: { scope: 'village' }, value: 2 },
    ],
    requires: { tech: 'printing' },
  },

  // ========== Infrastructure ==========
  house: {
    id: 'house',
    name: 'House',
    category: 'infrastructure',
    cost: { wood: 10, stone: 5 },
    buildTicks: 8,
    maxPerVillage: 0,
    effects: [
      { type: 'housing', target: { scope: 'village' }, value: 5 },
    ],
    requires: {},
  },
  well: {
    id: 'well',
    name: 'Well',
    category: 'infrastructure',
    cost: { stone: 8 },
    buildTicks: 8,
    maxPerVillage: 2,
    effects: [
      { type: 'population_growth', target: { scope: 'village' }, value: 0.05 },
      { type: 'heal_per_tick', target: { scope: 'village' }, value: 1 },
    ],
    requires: {},
  },
  road: {
    id: 'road',
    name: 'Road',
    category: 'infrastructure',
    cost: { stone: 3 },
    buildTicks: 3,
    maxPerVillage: 0,
    effects: [
      { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 0.5 },
      { type: 'build_speed', target: { scope: 'village' }, value: 0.05 },
    ],
    requires: {},
  },
  meeting_hall: {
    id: 'meeting_hall',
    name: 'Meeting Hall',
    category: 'infrastructure',
    cost: { wood: 25, stone: 20 },
    buildTicks: 20,
    maxPerVillage: 1,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 1 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.03 },
    ],
    requires: {},
  },

  // ========== Expansion (F2) ==========
  outpost: {
    id: 'outpost',
    name: 'Outpost',
    category: 'military',
    cost: { wood: 20, stone: 15 },
    buildTicks: 15,
    maxPerVillage: 3,
    effects: [
      { type: 'vision_range', target: { scope: 'village' }, value: 2 },
      { type: 'fortification', target: { scope: 'village' }, value: 3 },
    ],
    requires: { tech: 'fortification' },
  },
};

export const BUILDING_LIST = Object.values(BUILDING_DEFS);

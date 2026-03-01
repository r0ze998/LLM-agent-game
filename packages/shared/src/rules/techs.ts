// === Tech Tree Definitions (3 branches x 10 tiers = 30 techs) ===

import type { TechDef } from './types.ts';

export const TECH_DEFS: Record<string, TechDef> = {
  // ========== Agriculture Branch ==========
  agriculture: {
    id: 'agriculture',
    name: 'Agriculture',
    branch: 'agriculture',
    tier: 1,
    researchCost: 20,
    effects: [
      { type: 'tile_yield_mod', target: { scope: 'tile', resource: 'food', terrain: 'plains' }, value: 0.25 },
    ],
    requires: {},
  },
  irrigation: {
    id: 'irrigation',
    name: 'Irrigation',
    branch: 'agriculture',
    tier: 2,
    researchCost: 40,
    effects: [
      { type: 'tile_yield_mod', target: { scope: 'tile', resource: 'food', terrain: 'plains' }, value: 0.5 },
      { type: 'unlock_building', target: { scope: 'village' }, value: 1 },  // irrigation_canal
    ],
    requires: { tech: 'agriculture' },
  },
  animal_husbandry: {
    id: 'animal_husbandry',
    name: 'Animal Husbandry',
    branch: 'agriculture',
    tier: 3,
    researchCost: 60,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: 2 },
      { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 1 },
    ],
    requires: { tech: 'irrigation' },
  },
  crop_rotation: {
    id: 'crop_rotation',
    name: 'Crop Rotation',
    branch: 'agriculture',
    tier: 4,
    researchCost: 90,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: 3 },
      { type: 'food_consumption_mod', target: { scope: 'village' }, value: -0.1 },
    ],
    requires: { tech: 'animal_husbandry' },
  },
  watermill: {
    id: 'watermill',
    name: 'Watermill',
    branch: 'agriculture',
    tier: 5,
    researchCost: 130,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'wood' }, value: 2 },
      { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: 2 },
      { type: 'build_speed', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: { tech: 'crop_rotation' },
  },
  guilds: {
    id: 'guilds',
    name: 'Guilds',
    branch: 'agriculture',
    tier: 6,
    researchCost: 180,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: 3 },
      { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 2 },
    ],
    requires: { tech: 'watermill' },
  },
  banking: {
    id: 'banking',
    name: 'Banking',
    branch: 'agriculture',
    tier: 7,
    researchCost: 240,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: 5 },
    ],
    requires: { tech: 'guilds' },
  },
  economics: {
    id: 'economics',
    name: 'Economics',
    branch: 'agriculture',
    tier: 8,
    researchCost: 320,
    effects: [
      { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 5 },
      { type: 'resource_storage', target: { scope: 'village', resource: 'gold' }, value: 500 },
    ],
    requires: { tech: 'banking' },
  },
  industrialization: {
    id: 'industrialization',
    name: 'Industrialization',
    branch: 'agriculture',
    tier: 9,
    researchCost: 420,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'iron' }, value: 5 },
      { type: 'build_speed', target: { scope: 'village' }, value: 0.3 },
      { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: 5 },
    ],
    requires: { tech: 'economics' },
  },
  agriculture_mastery: {
    id: 'agriculture_mastery',
    name: 'Agriculture Mastery',
    branch: 'agriculture',
    tier: 10,
    researchCost: 550,
    effects: [
      { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: 10 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.2 },
      { type: 'food_consumption_mod', target: { scope: 'village' }, value: -0.25 },
    ],
    requires: { tech: 'industrialization' },
  },

  // ========== Military Branch ==========
  bronze_working: {
    id: 'bronze_working',
    name: 'Bronze Working',
    branch: 'military',
    tier: 1,
    researchCost: 20,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: {},
  },
  archery: {
    id: 'archery',
    name: 'Archery',
    branch: 'military',
    tier: 2,
    researchCost: 40,
    effects: [
      { type: 'attack_bonus', target: { scope: 'unit', unitType: 'archer' }, value: 0.15 },
    ],
    requires: { tech: 'bronze_working' },
  },
  horseback_riding: {
    id: 'horseback_riding',
    name: 'Horseback Riding',
    branch: 'military',
    tier: 3,
    researchCost: 60,
    effects: [
      { type: 'attack_bonus', target: { scope: 'unit', unitType: 'cavalry' }, value: 0.2 },
    ],
    requires: { tech: 'archery' },
  },
  iron_working: {
    id: 'iron_working',
    name: 'Iron Working',
    branch: 'military',
    tier: 4,
    researchCost: 90,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.15 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: { tech: 'horseback_riding' },
  },
  fortification: {
    id: 'fortification',
    name: 'Fortification',
    branch: 'military',
    tier: 5,
    researchCost: 130,
    effects: [
      { type: 'fortification', target: { scope: 'village' }, value: 10 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.2 },
    ],
    requires: { tech: 'iron_working' },
  },
  siege_warfare: {
    id: 'siege_warfare',
    name: 'Siege Warfare',
    branch: 'military',
    tier: 6,
    researchCost: 180,
    effects: [
      { type: 'attack_bonus', target: { scope: 'unit', unitType: 'siege_ram' }, value: 0.3 },
      { type: 'attack_bonus', target: { scope: 'unit', unitType: 'catapult' }, value: 0.3 },
    ],
    requires: { tech: 'fortification' },
  },
  steel: {
    id: 'steel',
    name: 'Steel',
    branch: 'military',
    tier: 7,
    researchCost: 240,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.2 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.15 },
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'knight' }, value: 1 },
    ],
    requires: { tech: 'siege_warfare' },
  },
  gunpowder: {
    id: 'gunpowder',
    name: 'Gunpowder',
    branch: 'military',
    tier: 8,
    researchCost: 320,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.25 },
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'musketeer' }, value: 1 },
    ],
    requires: { tech: 'steel' },
  },
  tactics: {
    id: 'tactics',
    name: 'Tactics',
    branch: 'military',
    tier: 9,
    researchCost: 420,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.2 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.2 },
      { type: 'unit_training_speed', target: { scope: 'village' }, value: 0.3 },
    ],
    requires: { tech: 'gunpowder' },
  },
  military_mastery: {
    id: 'military_mastery',
    name: 'Military Mastery',
    branch: 'military',
    tier: 10,
    researchCost: 550,
    effects: [
      { type: 'attack_bonus', target: { scope: 'village' }, value: 0.35 },
      { type: 'defense_bonus', target: { scope: 'village' }, value: 0.3 },
      { type: 'unlock_unit', target: { scope: 'village', unitType: 'elite_guard' }, value: 1 },
    ],
    requires: { tech: 'tactics' },
  },

  // ========== Culture Branch ==========
  writing: {
    id: 'writing',
    name: 'Writing',
    branch: 'culture',
    tier: 1,
    researchCost: 20,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 1 },
    ],
    requires: {},
  },
  philosophy: {
    id: 'philosophy',
    name: 'Philosophy',
    branch: 'culture',
    tier: 2,
    researchCost: 40,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 2 },
      { type: 'research_points', target: { scope: 'village' }, value: 1 },
    ],
    requires: { tech: 'writing' },
  },
  mysticism: {
    id: 'mysticism',
    name: 'Mysticism',
    branch: 'culture',
    tier: 3,
    researchCost: 60,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 2 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.05 },
    ],
    requires: { tech: 'philosophy' },
  },
  education: {
    id: 'education',
    name: 'Education',
    branch: 'culture',
    tier: 4,
    researchCost: 90,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 3 },
    ],
    requires: { tech: 'mysticism' },
  },
  arts: {
    id: 'arts',
    name: 'Arts',
    branch: 'culture',
    tier: 5,
    researchCost: 130,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 5 },
    ],
    requires: { tech: 'education' },
  },
  theology: {
    id: 'theology',
    name: 'Theology',
    branch: 'culture',
    tier: 6,
    researchCost: 180,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 3 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: { tech: 'arts' },
  },
  printing: {
    id: 'printing',
    name: 'Printing',
    branch: 'culture',
    tier: 7,
    researchCost: 240,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 5 },
      { type: 'culture_points', target: { scope: 'village' }, value: 3 },
    ],
    requires: { tech: 'theology' },
  },
  enlightenment: {
    id: 'enlightenment',
    name: 'Enlightenment',
    branch: 'culture',
    tier: 8,
    researchCost: 320,
    effects: [
      { type: 'research_points', target: { scope: 'village' }, value: 5 },
      { type: 'culture_points', target: { scope: 'village' }, value: 5 },
    ],
    requires: { tech: 'printing' },
  },
  ideology: {
    id: 'ideology',
    name: 'Ideology',
    branch: 'culture',
    tier: 9,
    researchCost: 420,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 8 },
      { type: 'population_growth', target: { scope: 'village' }, value: 0.1 },
    ],
    requires: { tech: 'enlightenment' },
  },
  culture_mastery: {
    id: 'culture_mastery',
    name: 'Culture Mastery',
    branch: 'culture',
    tier: 10,
    researchCost: 550,
    effects: [
      { type: 'culture_points', target: { scope: 'village' }, value: 15 },
      { type: 'research_points', target: { scope: 'village' }, value: 5 },
    ],
    requires: { tech: 'ideology' },
  },
};

export const TECH_LIST = Object.values(TECH_DEFS);

/** Returns techs for the given branch sorted by tier */
export function getTechsByBranch(branch: string): TechDef[] {
  return TECH_LIST.filter(t => t.branch === branch).sort((a, b) => a.tier - b.tier);
}

/** Returns the max tier (= mastery) for the given branch */
export function getMaxTier(branch: string): number {
  return Math.max(...getTechsByBranch(branch).map(t => t.tier));
}

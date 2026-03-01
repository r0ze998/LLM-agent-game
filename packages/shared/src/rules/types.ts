// === Effect System — Types defining the game's "physics" ===

import type { Position } from '../types.ts';
import type { ResourceType4X } from '../types4x.ts';

// --- Effect ---

export type EffectType =
  | 'resource_production'   // Produce resources per tick
  | 'resource_storage'      // Increase max resource capacity
  | 'housing'               // Add housing capacity
  | 'research_points'       // Produce research points per tick
  | 'culture_points'        // Produce culture points per tick
  | 'tile_yield_mod'        // Modify tile yield by multiplier for specific terrain
  | 'attack_bonus'          // Attack bonus (additive or multiplicative)
  | 'defense_bonus'         // Defense bonus
  | 'unit_training_speed'   // Unit training speed multiplier
  | 'build_speed'           // Build speed multiplier
  | 'population_growth'     // Population growth rate bonus
  | 'food_consumption_mod'  // Food consumption multiplier
  | 'trade_income'          // Trade gold income
  | 'vision_range'          // Vision range bonus
  | 'fortification'         // Wall defense value
  | 'heal_per_tick'         // Heal per tick
  | 'unlock_unit'           // Unlock unit training
  | 'unlock_building';      // Unlock building construction

export type EffectScope = 'village' | 'tile' | 'unit' | 'global';

export type TerrainType4X = 'plains' | 'forest' | 'mountain' | 'water' | 'desert' | 'swamp';

export interface EffectTarget {
  scope: EffectScope;
  resource?: ResourceType4X;
  unitType?: string;
  terrain?: TerrainType4X;
}

export type EffectConditionType =
  | 'has_tech'
  | 'has_building'
  | 'at_war'
  | 'at_peace'
  | 'population_above'
  | 'population_below'
  | 'adjacent_to_terrain';

export interface EffectCondition {
  type: EffectConditionType;
  value: string | number;
}

export interface Effect {
  type: EffectType;
  target: EffectTarget;
  value: number;
  condition?: EffectCondition;
}

// --- Building Definition ---

export type BuildingCategory = 'economy' | 'military' | 'culture' | 'infrastructure';

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  cost: Partial<Record<ResourceType4X, number>>;
  buildTicks: number;
  maxPerVillage: number;        // 0 = unlimited
  effects: Effect[];
  requires: {
    tech?: string;
    building?: string;
    population?: number;
  };
}

// --- Technology Definition ---

export type TechBranch = 'agriculture' | 'military' | 'culture';

export interface TechDef {
  id: string;
  name: string;
  branch: TechBranch;
  tier: number;                // 1-10
  researchCost: number;        // Research points
  effects: Effect[];
  requires: {
    tech?: string;             // Prerequisite tech
  };
}

// --- Unit Definition ---

export interface UnitDef {
  id: string;
  name: string;
  attack: number;
  defense: number;
  hp: number;
  speed: number;               // Tiles per tick
  range: number;               // Range (1 = melee)
  trainCost: Partial<Record<ResourceType4X, number>>;
  trainTicks: number;
  upkeepPerTick: Partial<Record<ResourceType4X, number>>;
  requires: {
    tech?: string;
    building?: string;
  };
  tags: string[];              // 'melee' | 'ranged' | 'cavalry' | 'siege'
}

// --- Victory Condition ---

export type VictoryType = 'domination' | 'culture' | 'diplomacy' | 'technology' | 'economic' | 'score';

export interface VictoryConditionDef {
  type: VictoryType;
  name: string;
  description: string;
  check: {
    metric: string;            // Metric to evaluate
    threshold: number;         // Threshold value
    comparison: 'gte' | 'lte' | 'eq';
  };
}

// --- Terrain Rule ---

export interface TerrainRuleDef {
  terrain: TerrainType4X;
  yields: Partial<Record<ResourceType4X, number>>;
  movementCost: number;
  defenseBonus: number;        // Defense bonus multiplier
  attackPenalty: number;       // Attack penalty multiplier
  buildable: boolean;
}

// --- Queue Item (shared type for building/research/training) ---

export type QueueType = 'building' | 'research' | 'training';

export interface QueueItem {
  id: string;
  queueType: QueueType;
  defId: string;               // BuildingDef.id / TechDef.id / UnitDef.id
  remainingTicks: number;
  totalTicks: number;
  position?: Position;         // Placement position (for buildings)
}

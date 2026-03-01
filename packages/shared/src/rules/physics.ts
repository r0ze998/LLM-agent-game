// === Layer 0: Physics Laws -- Immutable rules. Neither agents nor developers may change these ===

import type { Effect, EffectType, BuildingDef, TechDef, UnitDef } from './types.ts';
import type { ResourceType4X } from '../types4x.ts';
import { RESOURCE_TYPES_4X } from '../types4x.ts';

// --- Effect Bounds (Law 4) ---
// Sets absolute min/max bounds on all Effect values. Effects from any layer are clamped.

export const EFFECT_BOUNDS: Record<EffectType, { min: number; max: number }> = {
  resource_production:  { min: -10, max: 20 },
  resource_storage:     { min: -100, max: 500 },
  housing:              { min: 0, max: 50 },
  research_points:      { min: -5, max: 10 },
  culture_points:       { min: -5, max: 10 },
  tile_yield_mod:       { min: -0.5, max: 2.0 },
  attack_bonus:         { min: -0.5, max: 2.0 },
  defense_bonus:        { min: -0.5, max: 2.0 },
  unit_training_speed:  { min: -0.5, max: 1.0 },
  build_speed:          { min: -0.5, max: 1.0 },
  population_growth:    { min: -0.05, max: 0.1 },
  food_consumption_mod: { min: -0.5, max: 1.0 },
  trade_income:         { min: -5, max: 10 },
  vision_range:         { min: -3, max: 10 },
  fortification:        { min: 0, max: 100 },
  heal_per_tick:        { min: 0, max: 10 },
  unlock_unit:          { min: 0, max: 1 },
  unlock_building:      { min: 0, max: 1 },
};

// --- Minimum Costs for Building, Research, and Upkeep (Laws 5, 6, 7) ---

export const MIN_BUILDING_COST = 1;          // Law 5: Every building costs at least 1
export const MIN_RESEARCH_COST = 5;          // Law 6: Every technology costs at least 5
export const MIN_UNIT_UPKEEP_FOOD = 0.5;     // Law 7: Every unit requires at least food:0.5/tick

// --- Spacetime Laws (Laws 8, 9, 10) ---

export const MAX_TERRITORY_RADIUS = 15;      // Law 8: Territory extends at most 15 tiles from center
export const MIN_BUILD_TICKS = 1;            // Law 10: All construction takes at least 1 tick

// --- Entropy Laws (Laws 11, 12, 13) ---

export const DECAY_HP_PER_TICK = 1;          // Law 11: Without maintenance, HP -1 per tick
export const STARVATION_POP_LOSS_RATE = 0.01; // Law 12: At zero food, population -1% per tick
export const RELEVANCE_DECAY_RATE = 0.01;    // Law 13: Unused covenants/inventions undergo relevance decay

// --- Invention Limits ---

export const INVENTION_LIMITS = {
  maxEffectsPerInvention: 8,     // Max effects per invention
  maxInventionsPerVillage: 20,   // Max inventions a village can hold
  spreadDelayTicks: 50,          // Ticks before knowledge propagates to trade partners
  requiredResearchPoints: 100,   // Minimum research points required for invention
};

// --- Covenant Limits ---

export const COVENANT_LIMITS = {
  maxClausesPerCovenant: 5,      // Max clauses per covenant
  maxActiveCovenantsPerVillage: 10, // Max active covenants per village
};

// --- Institution Limits ---

export const INSTITUTION_LIMITS = {
  maxMemberEffects: 5,           // Max member effects per institution
  maxInstitutionsPerVillage: 5,  // Max institutions a village can belong to
  minMembersToSurvive: 1,       // Minimum members required to survive
};

// --- ClauseType Parameter Bounds ---

export const CLAUSE_PARAM_BOUNDS: Record<string, Record<string, { min: number; max: number }>> = {
  tax_rate:           { rate: { min: 0.0, max: 0.5 } },
  trade_tariff:       { rate: { min: 0.0, max: 0.3 } },
  conscription:       { ratio: { min: 0.0, max: 0.2 } },
  resource_sharing:   { percent: { min: 0.0, max: 0.5 } },
  building_subsidy:   { discount: { min: 0.0, max: 0.5 } },
  research_focus:     { bonus: { min: 0.1, max: 0.5 } },
  tribute:            { amount: { min: 1, max: 50 } },
  rationing:          { consumption_mod: { min: 0.5, max: 1.0 } },
  festival:           { culture_bonus: { min: 1, max: 5 }, food_cost: { min: 1, max: 20 } },
};

// --- Validation Functions ---

/** Clamp a single Effect to EFFECT_BOUNDS */
export function clampEffect(effect: Effect): Effect {
  const bounds = EFFECT_BOUNDS[effect.type];
  if (!bounds) return effect;

  // Unlock types don't need clamping (0 or 1)
  if (effect.type === 'unlock_unit' || effect.type === 'unlock_building') {
    return effect;
  }

  const clampedValue = Math.max(bounds.min, Math.min(bounds.max, effect.value));
  if (clampedValue === effect.value) return effect;

  return { ...effect, value: clampedValue };
}

/** Validate that an effect does not violate physics laws */
export function validateEffect(effect: Effect): { valid: boolean; violation?: string } {
  const bounds = EFFECT_BOUNDS[effect.type];
  if (!bounds) {
    return { valid: false, violation: `Unknown effect type: ${effect.type}` };
  }

  if (effect.type === 'unlock_unit' || effect.type === 'unlock_building') {
    return { valid: true };
  }

  if (effect.value < bounds.min || effect.value > bounds.max) {
    return {
      valid: false,
      violation: `${effect.type} value ${effect.value} out of bounds [${bounds.min}, ${bounds.max}]`,
    };
  }

  return { valid: true };
}

/** Validate that an invention definition (BuildingDef/TechDef/UnitDef) does not violate physics laws */
export function validateInventionDef(
  def: BuildingDef | TechDef | UnitDef,
  type: 'building' | 'tech' | 'unit',
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check effect count limit
  if ('effects' in def && def.effects.length > INVENTION_LIMITS.maxEffectsPerInvention) {
    violations.push(`Effect count ${def.effects.length} exceeds max ${INVENTION_LIMITS.maxEffectsPerInvention}`);
  }

  // Check that all effects are within EFFECT_BOUNDS
  if ('effects' in def) {
    for (const eff of def.effects) {
      const result = validateEffect(eff);
      if (!result.valid) {
        violations.push(result.violation!);
      }
    }
  }

  // Check minimum building cost (Law 5)
  if (type === 'building') {
    const bDef = def as BuildingDef;
    const totalCost = RESOURCE_TYPES_4X.reduce((sum, r) => sum + (bDef.cost[r] || 0), 0);
    if (totalCost < MIN_BUILDING_COST) {
      violations.push(`Building total cost ${totalCost} below minimum ${MIN_BUILDING_COST}`);
    }
    // Check minimum build time (Law 10)
    if (bDef.buildTicks < MIN_BUILD_TICKS) {
      violations.push(`Build ticks ${bDef.buildTicks} below minimum ${MIN_BUILD_TICKS}`);
    }
  }

  // Check minimum research cost (Law 6)
  if (type === 'tech') {
    const tDef = def as TechDef;
    if (tDef.researchCost < MIN_RESEARCH_COST) {
      violations.push(`Research cost ${tDef.researchCost} below minimum ${MIN_RESEARCH_COST}`);
    }
  }

  // Check minimum unit upkeep cost (Law 7)
  if (type === 'unit') {
    const uDef = def as UnitDef;
    const foodUpkeep = uDef.upkeepPerTick.food || 0;
    if (foodUpkeep < MIN_UNIT_UPKEEP_FOOD) {
      violations.push(`Unit food upkeep ${foodUpkeep} below minimum ${MIN_UNIT_UPKEEP_FOOD}`);
    }
  }

  return { valid: violations.length === 0, violations };
}

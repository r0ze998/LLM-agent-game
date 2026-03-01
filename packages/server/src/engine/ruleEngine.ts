// === Rule Engine — Effect aggregation + resource/population/research/culture tick processing ===

import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  TERRAIN_RULES,
  type Effect,
  clampEffect,
} from '@murasato/shared';
import {
  type VillageState4X,
  type Resources4X,
  type ResourceType4X,
  type AutonomousWorldState,
  RESOURCE_TYPES_4X,
} from '@murasato/shared';
import {
  FOOD_PER_POP_PER_TICK,
  POP_GROWTH_BASE_RATE,
  POP_STARVATION_RATE,
  POP_RESEARCH_CONTRIBUTION,
} from '@murasato/shared';
import type { Tile } from '@murasato/shared';
import { getActiveCovenantEffects } from './covenantEngine.ts';
import { getInventionEffects } from './inventionRegistry.ts';
import { getInstitutionEffects } from './institutionEngine.ts';

// --- Aggregated effect results ---

export interface AggregatedEffects {
  resourceProduction: Resources4X;
  resourceStorage: Resources4X;
  housing: number;
  researchPoints: number;
  culturePoints: number;
  tileYieldMods: Map<string, number>;     // key: `${terrain}_${resource}`
  attackBonus: number;                     // global multiplier
  defenseBonus: number;
  unitAttackBonus: Map<string, number>;    // unitType -> bonus
  unitDefenseBonus: Map<string, number>;
  unitTrainingSpeed: number;
  buildSpeed: number;
  populationGrowth: number;
  foodConsumptionMod: number;
  tradeIncome: Resources4X;
  visionRange: number;
  fortification: number;
  healPerTick: number;
  unlockedUnits: Set<string>;
  unlockedBuildings: Set<string>;
}

function emptyAggregated(): AggregatedEffects {
  return {
    resourceProduction: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
    resourceStorage: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
    housing: 0,
    researchPoints: 0,
    culturePoints: 0,
    tileYieldMods: new Map(),
    attackBonus: 0,
    defenseBonus: 0,
    unitAttackBonus: new Map(),
    unitDefenseBonus: new Map(),
    unitTrainingSpeed: 0,
    buildSpeed: 0,
    populationGrowth: 0,
    foodConsumptionMod: 0,
    tradeIncome: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
    visionRange: 0,
    fortification: 0,
    healPerTick: 0,
    unlockedUnits: new Set(),
    unlockedBuildings: new Set(),
  };
}

/** Aggregate all Effects for a village (buildings + researched techs + Covenants + inventions + institutions) */
export function aggregateEffects(
  village: VillageState4X,
  awState?: AutonomousWorldState,
  currentTick?: number,
  diplomaticStatus?: string,
): AggregatedEffects {
  const agg = emptyAggregated();

  // Layer 0: Hardcoded building Effects
  for (const bi of village.buildings) {
    const def = BUILDING_DEFS[bi.defId];
    if (!def) continue;
    for (const eff of def.effects) {
      applyEffect(agg, clampEffect(eff), village, diplomaticStatus);
    }
  }

  // Layer 0: Researched tech Effects
  for (const techId of village.researchedTechs) {
    const def = TECH_DEFS[techId];
    if (!def) continue;
    for (const eff of def.effects) {
      applyEffect(agg, clampEffect(eff), village, diplomaticStatus);
    }
  }

  // Layer 1-3: Autonomous World layers (optional)
  if (awState) {
    const tick = currentTick ?? 0;

    // Layer 1: Active Covenant Effects
    const covenantEffects = getActiveCovenantEffects(village.villageId, awState, tick);
    for (const eff of covenantEffects) {
      applyEffect(agg, eff, village, diplomaticStatus);
    }

    // Layer 2: Invented building/tech Effects
    const inventionEffects = getInventionEffects(village, awState);
    for (const eff of inventionEffects) {
      applyEffect(agg, eff, village, diplomaticStatus);
    }

    // Layer 3: Affiliated Institution memberEffects
    const institutionEffects = getInstitutionEffects(village.villageId, awState);
    for (const eff of institutionEffects) {
      applyEffect(agg, eff, village, diplomaticStatus);
    }
  }

  return agg;
}

function applyEffect(agg: AggregatedEffects, eff: Effect, village: VillageState4X, diplomaticStatus?: string): void {
  // Condition check
  if (eff.condition) {
    if (!checkCondition(eff.condition, village, diplomaticStatus)) return;
  }

  const res = eff.target.resource as ResourceType4X | undefined;

  switch (eff.type) {
    case 'resource_production':
      if (res) agg.resourceProduction[res] += eff.value;
      break;
    case 'resource_storage':
      if (res) agg.resourceStorage[res] += eff.value;
      break;
    case 'housing':
      agg.housing += eff.value;
      break;
    case 'research_points':
      agg.researchPoints += eff.value;
      break;
    case 'culture_points':
      agg.culturePoints += eff.value;
      break;
    case 'tile_yield_mod':
      if (eff.target.terrain && res) {
        const key = `${eff.target.terrain}_${res}`;
        agg.tileYieldMods.set(key, (agg.tileYieldMods.get(key) || 0) + eff.value);
      }
      break;
    case 'attack_bonus':
      if (eff.target.unitType) {
        const cur = agg.unitAttackBonus.get(eff.target.unitType) || 0;
        agg.unitAttackBonus.set(eff.target.unitType, cur + eff.value);
      } else {
        agg.attackBonus += eff.value;
      }
      break;
    case 'defense_bonus':
      if (eff.target.unitType) {
        const cur = agg.unitDefenseBonus.get(eff.target.unitType) || 0;
        agg.unitDefenseBonus.set(eff.target.unitType, cur + eff.value);
      } else {
        agg.defenseBonus += eff.value;
      }
      break;
    case 'unit_training_speed':
      agg.unitTrainingSpeed += eff.value;
      break;
    case 'build_speed':
      agg.buildSpeed += eff.value;
      break;
    case 'population_growth':
      agg.populationGrowth += eff.value;
      break;
    case 'food_consumption_mod':
      agg.foodConsumptionMod += eff.value;
      break;
    case 'trade_income':
      if (res) agg.tradeIncome[res] += eff.value;
      break;
    case 'vision_range':
      agg.visionRange += eff.value;
      break;
    case 'fortification':
      agg.fortification += eff.value;
      break;
    case 'heal_per_tick':
      agg.healPerTick += eff.value;
      break;
    case 'unlock_unit':
      if (eff.target.unitType) agg.unlockedUnits.add(eff.target.unitType);
      break;
    case 'unlock_building':
      // Building unlock is managed by BuildingDef.requires, no special processing needed here
      break;
  }
}

function checkCondition(
  cond: { type: string; value: string | number },
  village: VillageState4X,
  diplomaticStatus?: string,
): boolean {
  switch (cond.type) {
    case 'has_tech':
      return village.researchedTechs.has(cond.value as string);
    case 'has_building':
      return village.buildings.some(b => b.defId === cond.value);
    case 'at_war':
      return diplomaticStatus === 'war';
    case 'at_peace':
      return diplomaticStatus !== 'war';
    case 'population_above':
      return village.population >= (cond.value as number);
    case 'population_below':
      return village.population < (cond.value as number);
    default:
      return true;
  }
}

// --- Tick processing ---

export interface TickResult {
  resourceDelta: Resources4X;
  populationDelta: number;
  researchGained: number;
  cultureGained: number;
  queueCompleted: string[];    // IDs of completed queue items
  starvation: boolean;
}

/** Village tick processing: resource production -> consumption -> population -> research -> culture -> queue progression */
export function processVillageTick(
  village: VillageState4X,
  territoryTiles: Tile[],
  awState?: AutonomousWorldState,
  currentTick?: number,
  diplomaticStatus?: string,
): TickResult {
  const agg = aggregateEffects(village, awState, currentTick, diplomaticStatus);
  const result: TickResult = {
    resourceDelta: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
    populationDelta: 0,
    researchGained: 0,
    cultureGained: 0,
    queueCompleted: [],
    starvation: false,
  };

  // 1. Terrain yields (from territory tiles)
  for (const tile of territoryTiles) {
    const rule = TERRAIN_RULES[tile.terrain];
    if (!rule) continue;
    for (const res of RESOURCE_TYPES_4X) {
      const baseYield = rule.yields[res] || 0;
      if (baseYield <= 0) continue;
      const modKey = `${tile.terrain}_${res}`;
      const mod = agg.tileYieldMods.get(modKey) || 0;
      const adjusted = baseYield * (1 + mod);
      result.resourceDelta[res] += adjusted;
    }
  }

  // 2. Resource production from buildings and techs
  for (const res of RESOURCE_TYPES_4X) {
    result.resourceDelta[res] += agg.resourceProduction[res];
    result.resourceDelta[res] += agg.tradeIncome[res];
  }

  // 3. Population food consumption
  const foodConsumption = village.population * FOOD_PER_POP_PER_TICK * (1 + agg.foodConsumptionMod);
  result.resourceDelta.food -= foodConsumption;

  // 4. Unit upkeep costs
  const allUnits = [...village.garrison];
  for (const army of village.armies) {
    allUnits.push(...army.units);
  }
  for (const unit of allUnits) {
    const def = UNIT_DEFS[unit.defId];
    if (!def) continue;
    for (const res of RESOURCE_TYPES_4X) {
      const upkeep = def.upkeepPerTick[res] || 0;
      result.resourceDelta[res] -= upkeep * unit.count;
    }
  }

  // 5. Apply resources to village (cap check)
  const totalStorage: Resources4X = { ...village.resourceStorage };
  for (const res of RESOURCE_TYPES_4X) {
    totalStorage[res] += agg.resourceStorage[res];
  }

  // Gold cumulative tracking: add positive increments
  const goldDelta = result.resourceDelta.gold;
  if (goldDelta > 0) {
    village.totalGoldEarned = (village.totalGoldEarned ?? 0) + goldDelta;
  }

  for (const res of RESOURCE_TYPES_4X) {
    village.resources[res] += result.resourceDelta[res];
    village.resources[res] = Math.min(village.resources[res], totalStorage[res]);
    village.resources[res] = Math.max(village.resources[res], 0);
  }

  // 6. Population growth/decline
  const housingCap = agg.housing + 10; // base 10 + buildings
  village.housingCapacity = housingCap;

  if (village.resources.food <= 0) {
    // Starvation: population loss
    const loss = Math.max(1, Math.floor(village.population * POP_STARVATION_RATE));
    village.population = Math.max(1, village.population - loss);
    result.populationDelta = -loss;
    result.starvation = true;
  } else if (village.population < housingCap && village.resources.food > village.population * 2) {
    // Growth: food surplus + housing available
    const growthRate = POP_GROWTH_BASE_RATE + agg.populationGrowth;
    const growth = Math.max(0, Math.floor(village.population * growthRate));
    if (growth > 0) {
      village.population = Math.min(village.population + growth, housingCap);
      result.populationDelta = growth;
    }
  }

  // 7. Research points
  const researchGained = agg.researchPoints + village.population * POP_RESEARCH_CONTRIBUTION;
  village.researchPoints += researchGained;
  result.researchGained = researchGained;

  // 8. Culture points
  village.culturePoints += agg.culturePoints;
  village.totalCulturePoints += agg.culturePoints;
  result.cultureGained = agg.culturePoints;

  // 9. Queue progression
  processQueues(village, agg, result, currentTick);

  // 10. Score calculation
  village.score = computeScore(village);

  return result;
}

function processQueues(
  village: VillageState4X,
  agg: AggregatedEffects,
  result: TickResult,
  currentTick?: number,
): void {
  // Build queue
  if (village.buildQueue.length > 0) {
    const item = village.buildQueue[0];
    const speedMod = 1 + agg.buildSpeed;
    item.remainingTicks -= speedMod;
    if (item.remainingTicks <= 0) {
      // Construction complete
      const def = BUILDING_DEFS[item.defId];
      if (def && item.position) {
        village.buildings.push({
          id: item.id,
          defId: item.defId,
          position: item.position,
          level: 1,
          health: 100,
          maxHealth: 100,
          builtAtTick: currentTick ?? 0,
        });
      }
      village.buildQueue.shift();
      result.queueCompleted.push(item.id);
    }
  }

  // Research queue
  if (village.researchQueue.length > 0) {
    const item = village.researchQueue[0];
    // Research progresses via accumulated points
    const techDef = TECH_DEFS[item.defId];
    if (techDef && village.researchPoints >= techDef.researchCost) {
      village.researchPoints -= techDef.researchCost;
      village.researchedTechs.add(item.defId);
      village.researchQueue.shift();
      result.queueCompleted.push(item.id);
    }
  }

  // Training queue
  if (village.trainQueue.length > 0) {
    const item = village.trainQueue[0];
    const speedMod = 1 + agg.unitTrainingSpeed;
    item.remainingTicks -= speedMod;
    if (item.remainingTicks <= 0) {
      // Training complete: add to garrison
      const existing = village.garrison.find(u => u.defId === item.defId);
      if (existing) {
        existing.count += 1;
      } else {
        village.garrison.push({ defId: item.defId, count: 1, veterancy: 0 });
      }
      village.trainQueue.shift();
      result.queueCompleted.push(item.id);
    }
  }
}

function computeScore(village: VillageState4X): number {
  let score = 0;
  score += village.population * 2;
  score += village.buildings.length * 5;
  score += village.researchedTechs.size * 10;
  score += Math.floor(village.totalCulturePoints / 10);
  const totalMilitary = village.garrison.reduce((s, u) => s + u.count, 0)
    + village.armies.reduce((s, a) => a.units.reduce((s2, u) => s2 + u.count, s), 0);
  score += totalMilitary * 3;
  return score;
}

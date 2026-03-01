// === Layer 1: Covenant Engine — Covenant -> Effect[] conversion + validation ===
//
// ClauseType -> Effect[] conversion rules are immutable (Layer 0 invariant).
// Agents choose the combination of ClauseTypes and parameters,
// but the conversion logic itself cannot be modified.

import type { Effect } from '@murasato/shared';
import type {
  Covenant,
  CovenantClause,
  ClauseType,
  ResourceType4X,
  AutonomousWorldState,
} from '@murasato/shared';
import {
  CLAUSE_PARAM_BOUNDS,
  COVENANT_LIMITS,
  clampEffect,
  RELEVANCE_DECAY_RATE,
} from '@murasato/shared';

// --- ClauseType -> Effect[] conversion ---

export function clauseToEffects(clause: CovenantClause): Effect[] {
  const p = clause.params;

  switch (clause.type) {
    case 'tax_rate': {
      const rate = p.rate as number;
      const resource = (p.resource as ResourceType4X) || 'gold';
      return [
        { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: rate * 5 },
        { type: 'resource_production', target: { scope: 'village', resource }, value: -(rate * 2) },
      ];
    }

    case 'trade_tariff': {
      const rate = p.rate as number;
      return [
        { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: rate * 3 },
        { type: 'trade_income', target: { scope: 'village', resource: 'food' }, value: -(rate * 1) },
      ];
    }

    case 'conscription': {
      const ratio = p.ratio as number;
      return [
        { type: 'defense_bonus', target: { scope: 'village' }, value: ratio * 3 },
        { type: 'population_growth', target: { scope: 'village' }, value: -(ratio * 2) },
      ];
    }

    case 'resource_sharing': {
      const percent = p.percent as number;
      const resource = (p.resource as ResourceType4X) || 'food';
      return [
        { type: 'resource_production', target: { scope: 'village', resource }, value: percent * 4 },
      ];
    }

    case 'building_ban': {
      // Building ban is hard to express as an Effect, checked during command processing
      // Here we apply a penalty to build_speed
      return [
        { type: 'build_speed', target: { scope: 'village' }, value: -0.1 },
      ];
    }

    case 'building_subsidy': {
      const discount = p.discount as number;
      return [
        { type: 'build_speed', target: { scope: 'village' }, value: discount * 0.5 },
        { type: 'resource_production', target: { scope: 'village', resource: 'gold' }, value: -(discount * 2) },
      ];
    }

    case 'research_focus': {
      const bonus = p.bonus as number;
      return [
        { type: 'research_points', target: { scope: 'village' }, value: bonus * 4 },
      ];
    }

    case 'military_pact': {
      return [
        { type: 'defense_bonus', target: { scope: 'village' }, value: 0.2 },
        { type: 'attack_bonus', target: { scope: 'village' }, value: 0.1 },
      ];
    }

    case 'non_aggression': {
      // Non-aggression pact needs no Effect; managed via diplomatic status.
      // Grants trade_income as a peace bonus
      return [
        { type: 'trade_income', target: { scope: 'village', resource: 'gold' }, value: 1 },
      ];
    }

    case 'tribute': {
      const amount = p.amount as number;
      const resource = (p.resource as ResourceType4X) || 'gold';
      // Negative for payer, positive for receiver (handled via bilateral scope)
      return [
        { type: 'resource_production', target: { scope: 'village', resource }, value: -(amount * 0.2) },
      ];
    }

    case 'immigration_policy': {
      const open = p.open as boolean;
      return [
        { type: 'population_growth', target: { scope: 'village' }, value: open ? 0.02 : -0.01 },
      ];
    }

    case 'rationing': {
      const mod = p.consumption_mod as number;
      return [
        { type: 'food_consumption_mod', target: { scope: 'village' }, value: -(1 - mod) },
        { type: 'population_growth', target: { scope: 'village' }, value: -0.01 },
      ];
    }

    case 'festival': {
      const cultureBonus = p.culture_bonus as number;
      const foodCost = p.food_cost as number;
      return [
        { type: 'culture_points', target: { scope: 'village' }, value: cultureBonus },
        { type: 'resource_production', target: { scope: 'village', resource: 'food' }, value: -(foodCost * 0.1) },
      ];
    }

    default:
      return [];
  }
}

// --- Validation ---

export function validateCovenant(covenant: Omit<Covenant, 'id' | 'enactedAtTick' | 'repealedAtTick' | 'relevance'>): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Clause count check
  if (covenant.clauses.length === 0) {
    violations.push('Covenant must have at least one clause');
  }
  if (covenant.clauses.length > COVENANT_LIMITS.maxClausesPerCovenant) {
    violations.push(`Clause count ${covenant.clauses.length} exceeds max ${COVENANT_LIMITS.maxClausesPerCovenant}`);
  }

  // Parameter range check for each clause
  for (const clause of covenant.clauses) {
    const bounds = CLAUSE_PARAM_BOUNDS[clause.type];
    if (bounds) {
      for (const [key, range] of Object.entries(bounds)) {
        const val = clause.params[key];
        if (typeof val === 'number') {
          if (val < range.min || val > range.max) {
            violations.push(`${clause.type}.${key} = ${val} out of bounds [${range.min}, ${range.max}]`);
          }
        }
      }
    }

    // Validate all Effects against EFFECT_BOUNDS
    const effects = clauseToEffects(clause);
    for (const eff of effects) {
      const clamped = clampEffect(eff);
      if (clamped.value !== eff.value) {
        // Effect gets clamped, but this is a warning, not fatal
        // It will be clamped at runtime so it's OK
      }
    }
  }

  // bilateral scope requires targetVillageId
  if (covenant.scope === 'bilateral' && !covenant.targetVillageId) {
    violations.push('Bilateral covenant requires targetVillageId');
  }

  return { valid: violations.length === 0, violations };
}

// --- Get active Covenant Effects ---

export function getActiveCovenantEffects(
  villageId: string,
  awState: AutonomousWorldState,
  currentTick: number,
): Effect[] {
  const effects: Effect[] = [];

  for (const covenant of awState.covenants.values()) {
    // Check if active
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.relevance <= 0) continue;

    // Check if applies to this village
    const applies =
      (covenant.scope === 'village' && covenant.villageId === villageId) ||
      (covenant.scope === 'bilateral' && (covenant.villageId === villageId || covenant.targetVillageId === villageId)) ||
      (covenant.scope === 'global');

    if (!applies) continue;

    // Gather Effects from all clauses
    for (const clause of covenant.clauses) {
      const clauseEffects = clauseToEffects(clause);

      // bilateral tribute is directional
      if (clause.type === 'tribute' && covenant.scope === 'bilateral') {
        if (covenant.villageId === villageId) {
          // Enacting village bears the cost
          effects.push(...clauseEffects.map(e => clampEffect(e)));
        } else if (covenant.targetVillageId === villageId) {
          // Target village receives benefit (sign inverted)
          effects.push(...clauseEffects.map(e => clampEffect({ ...e, value: -e.value })));
        }
      } else {
        effects.push(...clauseEffects.map(e => clampEffect(e)));
      }
    }
  }

  return effects;
}

// --- Covenant relevance decay (law of forgetting) ---

export function decayCovenantRelevance(awState: AutonomousWorldState): void {
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    covenant.relevance = Math.max(0, covenant.relevance - RELEVANCE_DECAY_RATE);
  }
}

// --- Get active covenant count ---

export function getActiveCovenantCount(villageId: string, awState: AutonomousWorldState, currentTick: number): number {
  let count = 0;
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.villageId === villageId) count++;
  }
  return count;
}

// --- Building ban check ---

export function isBuildingBanned(
  villageId: string,
  buildingDefId: string,
  awState: AutonomousWorldState,
  currentTick: number,
): boolean {
  for (const covenant of awState.covenants.values()) {
    if (covenant.repealedAtTick !== null) continue;
    if (covenant.expiresAtTick !== null && currentTick >= covenant.expiresAtTick) continue;
    if (covenant.villageId !== villageId && covenant.scope !== 'global') continue;

    for (const clause of covenant.clauses) {
      if (clause.type === 'building_ban' && clause.params.buildingDefId === buildingDefId) {
        return true;
      }
    }
  }
  return false;
}

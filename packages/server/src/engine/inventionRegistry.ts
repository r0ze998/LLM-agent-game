// === Layer 2: Invention Registry — Managing buildings, techs, and units invented by agents ===

import type { Effect, BuildingDef, TechDef, UnitDef } from '@murasato/shared';
import type {
  Invention,
  VillageState4X,
  AutonomousWorldState,
  ResourceType4X,
} from '@murasato/shared';
import {
  BUILDING_DEFS,
  TECH_DEFS,
  UNIT_DEFS,
  RESOURCE_TYPES_4X,
} from '@murasato/shared';
import {
  validateInventionDef,
  INVENTION_LIMITS,
  clampEffect,
  RELEVANCE_DECAY_RATE,
} from '@murasato/shared';

// --- InventionRegistry ---

export class InventionRegistry {
  private awState: AutonomousWorldState;

  constructor(awState: AutonomousWorldState) {
    this.awState = awState;
  }

  /** Register an invention. Succeeds only if it passes physics validation */
  register(invention: Invention): { success: boolean; violations: string[] } {
    // Reject if ID already exists
    if (this.awState.inventions.has(invention.id)) {
      return { success: false, violations: ['Invention ID already exists'] };
    }

    // Check invention count per village
    const villageInventionCount = this.getInventionsByVillage(invention.originVillageId).length;
    if (villageInventionCount >= INVENTION_LIMITS.maxInventionsPerVillage) {
      return { success: false, violations: [`Village has reached max inventions (${INVENTION_LIMITS.maxInventionsPerVillage})`] };
    }

    // Restore definition and run physics validation
    const def = invention.definition;
    const validationResult = validateInventionDef(def as any, invention.type);

    if (!validationResult.valid) {
      return { success: false, violations: validationResult.violations };
    }

    // Register
    invention.relevance = 1.0;
    this.awState.inventions.set(invention.id, invention);
    return { success: true, violations: [] };
  }

  /** Get inventions available to a specific village */
  getAvailableFor(villageId: string): Invention[] {
    const available: Invention[] = [];
    for (const inv of this.awState.inventions.values()) {
      if (inv.relevance <= 0) continue;
      if (inv.knownByVillages.includes(villageId) || inv.originVillageId === villageId) {
        available.push(inv);
      }
    }
    return available;
  }

  /** Get inventions created by a specific village */
  getInventionsByVillage(villageId: string): Invention[] {
    const result: Invention[] = [];
    for (const inv of this.awState.inventions.values()) {
      if (inv.originVillageId === villageId) result.push(inv);
    }
    return result;
  }

  /** Spread knowledge along trade routes */
  spreadKnowledge(villageStates: Map<string, VillageState4X>, currentTick: number): void {
    for (const inv of this.awState.inventions.values()) {
      if (inv.relevance <= 0) continue;

      // Spread delay check
      if (currentTick - inv.inventedAtTick < INVENTION_LIMITS.spreadDelayTicks) continue;

      const originVillage = villageStates.get(inv.originVillageId);
      if (!originVillage) continue;

      // Spread along trade routes
      for (const route of originVillage.tradeRoutes) {
        const targetVillageId = route.fromVillageId === inv.originVillageId
          ? route.toVillageId
          : route.fromVillageId;

        if (!inv.knownByVillages.includes(targetVillageId)) {
          inv.knownByVillages.push(targetVillageId);
        }

        // Secondary spread: propagate to trade partners of knowledge holders (with additional delay)
        if (currentTick - inv.inventedAtTick >= INVENTION_LIMITS.spreadDelayTicks * 2) {
          const targetVillage = villageStates.get(targetVillageId);
          if (targetVillage) {
            for (const route2 of targetVillage.tradeRoutes) {
              const tertiaryId = route2.fromVillageId === targetVillageId
                ? route2.toVillageId
                : route2.fromVillageId;
              if (!inv.knownByVillages.includes(tertiaryId)) {
                inv.knownByVillages.push(tertiaryId);
              }
            }
          }
        }
      }
    }
  }
}

// --- Get Effects from inventions ---

export function getInventionEffects(
  village: VillageState4X,
  awState: AutonomousWorldState,
): Effect[] {
  const effects: Effect[] = [];
  const registry = new InventionRegistry(awState);
  const available = registry.getAvailableFor(village.villageId);

  for (const inv of available) {
    if (inv.type === 'building') {
      // Check if this invented building is built in the village
      const hasBuilding = village.buildings.some(b => b.defId === inv.id);
      if (!hasBuilding) continue;

      const def = inv.definition as unknown as BuildingDef;
      if (def.effects) {
        effects.push(...def.effects.map(e => clampEffect(e)));
      }
    } else if (inv.type === 'tech') {
      // Check if this invented tech has been researched by the village
      if (!village.researchedTechs.has(inv.id)) continue;

      const def = inv.definition as unknown as TechDef;
      if (def.effects) {
        effects.push(...def.effects.map(e => clampEffect(e)));
      }
    }
    // Units don't hold Effects directly (stats are referenced during combat)
  }

  return effects;
}

// --- Invention relevance decay ---

export function decayInventionRelevance(awState: AutonomousWorldState): void {
  for (const inv of awState.inventions.values()) {
    inv.relevance = Math.max(0, inv.relevance - RELEVANCE_DECAY_RATE);
  }
}

// --- Invention BuildingDef / TechDef / UnitDef lookup ---

/** Look up BuildingDef including inventions */
export function lookupBuildingDef(
  defId: string,
  awState: AutonomousWorldState,
): BuildingDef | null {
  // First search hardcoded definitions
  const hardcoded = BUILDING_DEFS[defId];
  if (hardcoded) return hardcoded;

  // Search inventions
  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'building' && inv.relevance > 0) {
    return inv.definition as unknown as BuildingDef;
  }

  return null;
}

/** Look up TechDef including inventions */
export function lookupTechDef(
  defId: string,
  awState: AutonomousWorldState,
): TechDef | null {
  const hardcoded = TECH_DEFS[defId];
  if (hardcoded) return hardcoded;

  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'tech' && inv.relevance > 0) {
    return inv.definition as unknown as TechDef;
  }

  return null;
}

/** Look up UnitDef including inventions */
export function lookupUnitDef(
  defId: string,
  awState: AutonomousWorldState,
): UnitDef | null {
  const hardcoded = UNIT_DEFS[defId];
  if (hardcoded) return hardcoded;

  const inv = awState.inventions.get(defId);
  if (inv && inv.type === 'unit' && inv.relevance > 0) {
    return inv.definition as unknown as UnitDef;
  }

  return null;
}

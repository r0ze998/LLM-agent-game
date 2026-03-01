// === Layer 3: Institution Engine — Supra-village organizations created by agents ===
//
// Trade guilds, religious orders, military alliances, academies, etc.
// memberEffects are constrained by EFFECT_BOUNDS.

import type { Effect } from '@murasato/shared';
import type {
  Institution,
  JoinRequirement,
  VillageState4X,
  AutonomousWorldState,
  ResourceType4X,
} from '@murasato/shared';
import {
  clampEffect,
  validateEffect,
  INSTITUTION_LIMITS,
  RELEVANCE_DECAY_RATE,
} from '@murasato/shared';

// --- Institution validation ---

export function validateInstitution(institution: Omit<Institution, 'id' | 'foundedAtTick' | 'relevance'>): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // memberEffects count check
  if (institution.memberEffects.length > INSTITUTION_LIMITS.maxMemberEffects) {
    violations.push(`memberEffects count ${institution.memberEffects.length} exceeds max ${INSTITUTION_LIMITS.maxMemberEffects}`);
  }

  // Check all Effects are within EFFECT_BOUNDS
  for (const eff of institution.memberEffects) {
    const result = validateEffect(eff);
    if (!result.valid) {
      violations.push(result.violation!);
    }
  }

  // Check name is not empty
  if (!institution.name || institution.name.trim().length === 0) {
    violations.push('Institution must have a name');
  }

  return { valid: violations.length === 0, violations };
}

// --- Found institution ---

export function foundInstitution(
  institution: Institution,
  awState: AutonomousWorldState,
): { success: boolean; violations: string[] } {
  if (awState.institutions.has(institution.id)) {
    return { success: false, violations: ['Institution ID already exists'] };
  }

  const validation = validateInstitution(institution);
  if (!validation.valid) {
    return { success: false, violations: validation.violations };
  }

  institution.relevance = 1.0;
  awState.institutions.set(institution.id, institution);
  return { success: true, violations: [] };
}

// --- Join institution ---

export function joinInstitution(
  villageId: string,
  institutionId: string,
  village: VillageState4X,
  awState: AutonomousWorldState,
): { success: boolean; reason?: string } {
  const institution = awState.institutions.get(institutionId);
  if (!institution) {
    return { success: false, reason: 'Institution not found' };
  }

  // Already a member
  if (institution.memberVillageIds.includes(villageId)) {
    return { success: false, reason: 'Already a member' };
  }

  // Check village institution limit
  const membershipCount = countMemberships(villageId, awState);
  if (membershipCount >= INSTITUTION_LIMITS.maxInstitutionsPerVillage) {
    return { success: false, reason: `Village already in ${membershipCount} institutions (max ${INSTITUTION_LIMITS.maxInstitutionsPerVillage})` };
  }

  // Join requirement check
  for (const req of institution.joinRequirements) {
    if (!checkJoinRequirement(req, village)) {
      return { success: false, reason: `Join requirement not met: ${req.type}` };
    }
  }

  institution.memberVillageIds.push(villageId);
  return { success: true };
}

// --- Leave institution ---

export function leaveInstitution(
  villageId: string,
  institutionId: string,
  awState: AutonomousWorldState,
): { success: boolean; reason?: string } {
  const institution = awState.institutions.get(institutionId);
  if (!institution) {
    return { success: false, reason: 'Institution not found' };
  }

  const idx = institution.memberVillageIds.indexOf(villageId);
  if (idx === -1) {
    return { success: false, reason: 'Not a member' };
  }

  institution.memberVillageIds.splice(idx, 1);
  return { success: true };
}

// --- Join requirement check ---

function checkJoinRequirement(req: JoinRequirement, village: VillageState4X): boolean {
  switch (req.type) {
    case 'min_population':
      return village.population >= (req.params.value as number);
    case 'has_tech':
      return village.researchedTechs.has(req.params.techId as string);
    case 'has_building':
      return village.buildings.some(b => b.defId === (req.params.buildingDefId as string));
    case 'min_culture':
      return village.totalCulturePoints >= (req.params.value as number);
    case 'approval':
      // Requires approval from existing members (simplified: always true)
      return true;
    default:
      return true;
  }
}

// --- Get institution Effects ---

export function getInstitutionEffects(
  villageId: string,
  awState: AutonomousWorldState,
): Effect[] {
  const effects: Effect[] = [];

  for (const institution of awState.institutions.values()) {
    if (institution.relevance <= 0) continue;
    if (!institution.memberVillageIds.includes(villageId)) continue;

    for (const eff of institution.memberEffects) {
      effects.push(clampEffect(eff));
    }
  }

  return effects;
}

// --- Institution relevance decay + decline processing ---

export function processInstitutionLifecycle(awState: AutonomousWorldState): string[] {
  const dissolved: string[] = [];

  for (const [id, institution] of awState.institutions) {
    // Rapid decline if no members
    if (institution.memberVillageIds.length < INSTITUTION_LIMITS.minMembersToSurvive) {
      institution.relevance = Math.max(0, institution.relevance - RELEVANCE_DECAY_RATE * 5);
    } else {
      // Normal decay (slower with members)
      institution.relevance = Math.max(0, institution.relevance - RELEVANCE_DECAY_RATE * 0.1);
    }

    // Dissolve when relevance reaches 0
    if (institution.relevance <= 0) {
      dissolved.push(institution.name);
      awState.institutions.delete(id);
    }
  }

  return dissolved;
}

// --- Helpers ---

function countMemberships(villageId: string, awState: AutonomousWorldState): number {
  let count = 0;
  for (const inst of awState.institutions.values()) {
    if (inst.memberVillageIds.includes(villageId)) count++;
  }
  return count;
}

/** Get all institutions a village belongs to */
export function getVillageInstitutions(villageId: string, awState: AutonomousWorldState): Institution[] {
  const result: Institution[] = [];
  for (const inst of awState.institutions.values()) {
    if (inst.memberVillageIds.includes(villageId)) result.push(inst);
  }
  return result;
}

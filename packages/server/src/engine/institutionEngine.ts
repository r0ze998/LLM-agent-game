// === Layer 3: 制度エンジン — エージェントが創設する超村組織 ===
//
// 交易ギルド、宗教団体、軍事同盟、学術院など。
// memberEffects は EFFECT_BOUNDS に制約される。

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

// --- 制度のバリデーション ---

export function validateInstitution(institution: Omit<Institution, 'id' | 'foundedAtTick' | 'relevance'>): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // memberEffects 数チェック
  if (institution.memberEffects.length > INSTITUTION_LIMITS.maxMemberEffects) {
    violations.push(`memberEffects count ${institution.memberEffects.length} exceeds max ${INSTITUTION_LIMITS.maxMemberEffects}`);
  }

  // 全 Effect が EFFECT_BOUNDS 内か
  for (const eff of institution.memberEffects) {
    const result = validateEffect(eff);
    if (!result.valid) {
      violations.push(result.violation!);
    }
  }

  // 名前が空でないか
  if (!institution.name || institution.name.trim().length === 0) {
    violations.push('Institution must have a name');
  }

  return { valid: violations.length === 0, violations };
}

// --- 制度の創設 ---

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

// --- 制度への加入 ---

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

  // 既に加入済みか
  if (institution.memberVillageIds.includes(villageId)) {
    return { success: false, reason: 'Already a member' };
  }

  // 村の制度数上限チェック
  const membershipCount = countMemberships(villageId, awState);
  if (membershipCount >= INSTITUTION_LIMITS.maxInstitutionsPerVillage) {
    return { success: false, reason: `Village already in ${membershipCount} institutions (max ${INSTITUTION_LIMITS.maxInstitutionsPerVillage})` };
  }

  // 加入条件チェック
  for (const req of institution.joinRequirements) {
    if (!checkJoinRequirement(req, village)) {
      return { success: false, reason: `Join requirement not met: ${req.type}` };
    }
  }

  institution.memberVillageIds.push(villageId);
  return { success: true };
}

// --- 制度からの脱退 ---

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

// --- 加入条件チェック ---

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
      // 既存メンバーの承認が必要（簡略化: 常にtrue）
      return true;
    default:
      return true;
  }
}

// --- 制度の Effect 取得 ---

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

// --- 制度の relevance 減衰 + 衰退処理 ---

export function processInstitutionLifecycle(awState: AutonomousWorldState): string[] {
  const dissolved: string[] = [];

  for (const [id, institution] of awState.institutions) {
    // メンバーがいなければ急速に衰退
    if (institution.memberVillageIds.length < INSTITUTION_LIMITS.minMembersToSurvive) {
      institution.relevance = Math.max(0, institution.relevance - RELEVANCE_DECAY_RATE * 5);
    } else {
      // 通常の減衰（メンバーがいれば緩やか）
      institution.relevance = Math.max(0, institution.relevance - RELEVANCE_DECAY_RATE * 0.1);
    }

    // relevance が 0 になったら解散
    if (institution.relevance <= 0) {
      dissolved.push(institution.name);
      awState.institutions.delete(id);
    }
  }

  return dissolved;
}

// --- ヘルパー ---

function countMemberships(villageId: string, awState: AutonomousWorldState): number {
  let count = 0;
  for (const inst of awState.institutions.values()) {
    if (inst.memberVillageIds.includes(villageId)) count++;
  }
  return count;
}

/** 村が所属する全制度を取得 */
export function getVillageInstitutions(villageId: string, awState: AutonomousWorldState): Institution[] {
  const result: Institution[] = [];
  for (const inst of awState.institutions.values()) {
    if (inst.memberVillageIds.includes(villageId)) result.push(inst);
  }
  return result;
}

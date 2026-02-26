// === Layer 0: 物理法則 — 不変のルール。エージェントも開発者も変更不可 ===

import type { Effect, EffectType, BuildingDef, TechDef, UnitDef } from './types.ts';
import type { ResourceType4X } from '../types4x.ts';
import { RESOURCE_TYPES_4X } from '../types4x.ts';

// --- Effect上下限 (法則4) ---
// 全Effectの value に絶対的な上下限を設定。どのレイヤーからの Effect も clamp される。

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

// --- 建設・研究・維持コストの最小値 (法則5,6,7) ---

export const MIN_BUILDING_COST = 1;          // 法則5: どんな建物も最低コスト1
export const MIN_RESEARCH_COST = 5;          // 法則6: どんな技術も最低コスト5
export const MIN_UNIT_UPKEEP_FOOD = 0.5;     // 法則7: 全ユニット最低 food:0.5/tick

// --- 時空間則 (法則8,9,10) ---

export const MAX_TERRITORY_RADIUS = 15;      // 法則8: 領土は中心から最大15タイル
export const MIN_BUILD_TICKS = 1;            // 法則10: 全建設は最低1tick

// --- エントロピー則 (法則11,12,13) ---

export const DECAY_HP_PER_TICK = 1;          // 法則11: 維持しなければ毎tick HP -1
export const STARVATION_POP_LOSS_RATE = 0.01; // 法則12: 食料0で毎tick人口 -1%
export const RELEVANCE_DECAY_RATE = 0.01;    // 法則13: 使われないCovenant/Inventionは relevance decay

// --- 発明制限 ---

export const INVENTION_LIMITS = {
  maxEffectsPerInvention: 8,     // 1つの発明に含められる最大Effect数
  maxInventionsPerVillage: 20,   // 1村が持てる発明の最大数
  spreadDelayTicks: 50,          // 知識が交易先に伝播するまでのtick数
  requiredResearchPoints: 100,   // 発明に必要な最低研究ポイント
};

// --- Covenant制限 ---

export const COVENANT_LIMITS = {
  maxClausesPerCovenant: 5,      // 1つの契約に含められる最大条項数
  maxActiveCovenantsPerVillage: 10, // 1村が同時に持てる契約の最大数
};

// --- Institution制限 ---

export const INSTITUTION_LIMITS = {
  maxMemberEffects: 5,           // 制度の memberEffects 最大数
  maxInstitutionsPerVillage: 5,  // 1村が所属できる制度の最大数
  minMembersToSurvive: 1,       // 存続に必要な最低メンバー数
};

// --- ClauseType パラメータ制約 ---

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

// --- バリデーション関数 ---

/** 単一Effectを EFFECT_BOUNDS で clamp する */
export function clampEffect(effect: Effect): Effect {
  const bounds = EFFECT_BOUNDS[effect.type];
  if (!bounds) return effect;

  // unlock 系は clamp 不要（0 or 1）
  if (effect.type === 'unlock_unit' || effect.type === 'unlock_building') {
    return effect;
  }

  const clampedValue = Math.max(bounds.min, Math.min(bounds.max, effect.value));
  if (clampedValue === effect.value) return effect;

  return { ...effect, value: clampedValue };
}

/** Effectが物理法則に違反していないか検証 */
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

/** 発明定義（BuildingDef/TechDef/UnitDef）が物理法則に違反していないか検証 */
export function validateInventionDef(
  def: BuildingDef | TechDef | UnitDef,
  type: 'building' | 'tech' | 'unit',
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Effect数上限チェック
  if ('effects' in def && def.effects.length > INVENTION_LIMITS.maxEffectsPerInvention) {
    violations.push(`Effect count ${def.effects.length} exceeds max ${INVENTION_LIMITS.maxEffectsPerInvention}`);
  }

  // 全 Effect が EFFECT_BOUNDS 内かチェック
  if ('effects' in def) {
    for (const eff of def.effects) {
      const result = validateEffect(eff);
      if (!result.valid) {
        violations.push(result.violation!);
      }
    }
  }

  // 建物コスト最小値チェック (法則5)
  if (type === 'building') {
    const bDef = def as BuildingDef;
    const totalCost = RESOURCE_TYPES_4X.reduce((sum, r) => sum + (bDef.cost[r] || 0), 0);
    if (totalCost < MIN_BUILDING_COST) {
      violations.push(`Building total cost ${totalCost} below minimum ${MIN_BUILDING_COST}`);
    }
    // 建設時間最小値 (法則10)
    if (bDef.buildTicks < MIN_BUILD_TICKS) {
      violations.push(`Build ticks ${bDef.buildTicks} below minimum ${MIN_BUILD_TICKS}`);
    }
  }

  // 研究コスト最小値チェック (法則6)
  if (type === 'tech') {
    const tDef = def as TechDef;
    if (tDef.researchCost < MIN_RESEARCH_COST) {
      violations.push(`Research cost ${tDef.researchCost} below minimum ${MIN_RESEARCH_COST}`);
    }
  }

  // ユニット維持コスト最小値チェック (法則7)
  if (type === 'unit') {
    const uDef = def as UnitDef;
    const foodUpkeep = uDef.upkeepPerTick.food || 0;
    if (foodUpkeep < MIN_UNIT_UPKEEP_FOOD) {
      violations.push(`Unit food upkeep ${foodUpkeep} below minimum ${MIN_UNIT_UPKEEP_FOOD}`);
    }
  }

  return { valid: violations.length === 0, violations };
}
